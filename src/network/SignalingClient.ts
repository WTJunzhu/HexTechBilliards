import type {
  ClientMessage,
  ServerMessage,
  ConnectionState,
} from './types'

/**
 * 信令客户端 — 与服务器 WebSocket 通信
 *
 * 负责房间管理、WebRTC 信令交换
 * 使用浏览器原生 WebSocket（H5）或 uni.connectSocket（小程序）
 */
export class SignalingClient {
  private ws: WebSocket | null = null
  private url: string
  private _state: ConnectionState = 'disconnected'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  /** 收到服务器消息的回调 */
  onMessage: ((msg: ServerMessage) => void) | null = null
  /** 连接状态变化回调 */
  onStateChange: ((state: ConnectionState) => void) | null = null

  constructor(serverUrl: string) {
    this.url = serverUrl
  }

  get state(): ConnectionState {
    return this._state
  }

  private set state(val: ConnectionState) {
    this._state = val
    this.onStateChange?.(val)
  }

  // ---- 连接管理 ----

  /** 连接信令服务器 */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      this.state = 'connecting'

      try {
        this.ws = new WebSocket(this.url)
      } catch (err) {
        this.state = 'disconnected'
        reject(new Error(`Failed to create WebSocket: ${err}`))
        return
      }

      this.ws.onopen = () => {
        console.log('[Signaling] Connected to server')
        this.state = 'connected'
        this.reconnectAttempts = 0
        this.startHeartbeat()
        resolve()
      }

      this.ws.onmessage = (event: MessageEvent) => {
        // 处理 ping/pong 心跳
        if (event.data === '__ping__') {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send('__pong__')
          }
          return
        }
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage
          this.onMessage?.(msg)
        } catch {
          console.warn('[Signaling] Failed to parse message:', event.data)
        }
      }

      this.ws.onclose = () => {
        console.log('[Signaling] Disconnected')
        this.state = 'disconnected'
        this.tryReconnect()
      }

      this.ws.onerror = (err) => {
        console.error('[Signaling] Error:', err)
        this.state = 'disconnected'
        reject(new Error('WebSocket connection failed'))
      }
    })
  }

  /** 断线重连 */
  private tryReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[Signaling] Max reconnect attempts reached')
      return
    }

    this.state = 'reconnecting'
    this.reconnectAttempts++

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000)
    console.log(`[Signaling] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // connect failed, tryReconnect will be called again by onclose
      })
    }, delay)
  }

  /** 主动断开 */
  disconnect(): void {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectAttempts = this.maxReconnectAttempts // prevent auto-reconnect
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.state = 'disconnected'
  }

  // ---- 心跳保活 ----

  /** 启动客户端心跳（响应服务端 ping） */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    // 额外：客户端每 25s 发一次心跳，防止 Render 空闲超时
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }))
      }
    }, 25_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // ---- 发送消息 ----

  send(msg: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Signaling] Cannot send: not connected')
      return false
    }
    this.ws.send(JSON.stringify(msg))
    return true
  }

  // ---- 便捷方法 ----

  createRoom(playerName: string): void {
    this.send({ type: 'create_room', playerName })
  }

  joinRoom(roomId: string, playerName: string): void {
    this.send({ type: 'join_room', roomId, playerName })
  }

  leaveRoom(): void {
    this.send({ type: 'leave_room' })
  }

  ready(): void {
    this.send({ type: 'ready' })
  }

  startGame(): void {
    this.send({ type: 'start_game' })
  }

  sendWebRTCOffer(targetPlayerId: string, sdp: string): void {
    this.send({ type: 'webrtc_offer', targetPlayerId, sdp })
  }

  sendWebRTCAnswer(targetPlayerId: string, sdp: string): void {
    this.send({ type: 'webrtc_answer', targetPlayerId, sdp })
  }

  sendIceCandidate(targetPlayerId: string, candidate: RTCIceCandidate): void {
    this.send({
      type: 'webrtc_ice_candidate',
      targetPlayerId,
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
    })
  }
}
