import type { GameMessage } from './types'

/**
 * WebRTC P2P 连接管理
 *
 * 负责建立 DataChannel 进行低延迟游戏数据传输
 * 信令交换由 SignalingClient 处理
 */
export class PeerConnection {
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private _isInitiator = false
  private _isConnected = false

  /** 收到 P2P 游戏消息回调 */
  onGameMessage: ((msg: GameMessage) => void) | null = null
  /** 连接状态变化回调 */
  onConnectionStateChange: ((connected: boolean) => void) | null = null

  /** ICE candidate 收集回调（通过信令发送给对方） */
  onIceCandidate: ((candidate: RTCIceCandidate) => void) | null = null
  /** 需要发送 offer 回调 */
  onNeedSendOffer: ((sdp: string) => void) | null = null
  /** 需要发送 answer 回调 */
  onNeedSendAnswer: ((sdp: string) => void) | null = null

  get isConnected(): boolean {
    return this._isConnected
  }

  get isInitiator(): boolean {
    return this._isInitiator
  }

  // ---- 创建连接 ----

  /**
   * 作为发起方创建连接
   * 会创建 DataChannel 并触发 onNeedSendOffer
   */
  async createOffer(opponentId: string): Promise<void> {
    this.cleanup()
    this._isInitiator = true

    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    })

    this.setupPeerConnection(opponentId)

    // 发起方创建 DataChannel
    this.dataChannel = this.pc.createDataChannel('game-data', {
      ordered: true,
    })
    this.setupDataChannel(this.dataChannel)

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    this.onNeedSendOffer?.(offer.sdp!)
  }

  /**
   * 作为响应方处理收到的 offer
   * 会触发 onNeedSendAnswer
   */
  async handleOffer(sdp: string, opponentId: string): Promise<void> {
    this.cleanup()
    this._isInitiator = false

    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    })

    this.setupPeerConnection(opponentId)

    // 响应方监听 DataChannel
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel
      this.setupDataChannel(this.dataChannel!)
    }

    await this.pc.setRemoteDescription({ type: 'offer', sdp })
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    this.onNeedSendAnswer?.(answer.sdp!)
  }

  /**
   * 处理收到的 answer
   */
  async handleAnswer(sdp: string): Promise<void> {
    if (!this.pc) return
    await this.pc.setRemoteDescription({ type: 'answer', sdp })
  }

  /**
   * 处理收到的 ICE candidate
   */
  async handleIceCandidate(candidate: string, sdpMid: string | null, sdpMLineIndex: number | null): Promise<void> {
    if (!this.pc) return
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate({
        candidate,
        sdpMid,
        sdpMLineIndex,
      }))
    } catch (err) {
      console.warn('[PeerConnection] Failed to add ICE candidate:', err)
    }
  }

  // ---- 数据发送 ----

  /** 通过 DataChannel 发送游戏消息 */
  send(msg: GameMessage): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('[PeerConnection] Cannot send: DataChannel not open')
      return false
    }
    this.dataChannel.send(JSON.stringify(msg))
    return true
  }

  // ---- 内部方法 ----

  private setupPeerConnection(opponentId: string): void {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(event.candidate)
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log('[PeerConnection] State:', state)
      if (state === 'connected') {
        this._isConnected = true
        this.onConnectionStateChange?.(true)
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this._isConnected = false
        this.onConnectionStateChange?.(false)
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState
      if (state === 'failed') {
        console.warn('[PeerConnection] ICE connection failed')
        this._isConnected = false
        this.onConnectionStateChange?.(false)
      }
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log('[PeerConnection] DataChannel open')
      this._isConnected = true
      this.onConnectionStateChange?.(true)
    }

    channel.onclose = () => {
      console.log('[PeerConnection] DataChannel closed')
      this._isConnected = false
      this.onConnectionStateChange?.(false)
    }

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as GameMessage
        this.onGameMessage?.(msg)
      } catch {
        console.warn('[PeerConnection] Failed to parse game message:', event.data)
      }
    }

    channel.onerror = (err) => {
      console.error('[PeerConnection] DataChannel error:', err)
    }
  }

  /** 清理连接 */
  cleanup(): void {
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    this._isConnected = false
    this._isInitiator = false
  }
}
