import { SignalingClient } from './SignalingClient'
import { PeerConnection } from './PeerConnection'
import type {
  ServerMessage,
  GameMessage,
  NetworkEvent,
  ConnectionState,
  RoomPlayerInfo,
} from './types'

/**
 * 网络管理器 — 统一管理信令和 P2P 连接
 *
 * 对外暴露事件驱动接口，游戏代码只需监听 NetworkEvent
 */

/** 默认信令服务器地址（开发环境） */
const DEFAULT_SERVER_URL = 'ws://localhost:3001'

export class NetworkManager {
  private signaling: SignalingClient
  private peer: PeerConnection

  // ---- 房间状态 ----
  private _roomId: string | null = null
  private _playerId: string | null = null
  private _playerName: string = ''
  private _opponentId: string | null = null
  private _opponentName: string | null = null
  private _myPlayerIndex: number = -1
  private _isHost = false

  // ---- WebSocket 回退 ----
  /** 如果 WebRTC 不可用，通过信令 WebSocket 传游戏消息 */
  private _useWebSocketFallback = false

  // ---- 事件 ----
  private eventListeners: ((event: NetworkEvent) => void)[] = []

  constructor(serverUrl?: string) {
    this.signaling = new SignalingClient(serverUrl || DEFAULT_SERVER_URL)
    this.peer = new PeerConnection()

    // 信令消息路由
    this.signaling.onMessage = (msg) => this.handleServerMessage(msg)
    this.signaling.onStateChange = (state) => {
      this.emit({ type: 'connection_state', state })
    }

    // Peer 事件路由
    this.peer.onGameMessage = (msg) => {
      this.emit({ type: 'game_message', message: msg })
    }
    this.peer.onConnectionStateChange = (connected) => {
      if (connected) {
        this.emit({ type: 'connection_state', state: 'connected' })
      }
    }
    this.peer.onIceCandidate = (candidate) => {
      if (this._opponentId) {
        this.signaling.sendIceCandidate(this._opponentId, candidate)
      }
    }
    this.peer.onNeedSendOffer = (sdp) => {
      if (this._opponentId) {
        this.signaling.sendWebRTCOffer(this._opponentId, sdp)
      }
    }
    this.peer.onNeedSendAnswer = (sdp) => {
      if (this._opponentId) {
        this.signaling.sendWebRTCAnswer(this._opponentId, sdp)
      }
    }
  }

  // ---- 公开属性 ----

  get roomId(): string | null { return this._roomId }
  get playerId(): string | null { return this._playerId }
  get opponentName(): string | null { return this._opponentName }
  get myPlayerIndex(): number { return this._myPlayerIndex }
  get isHost(): boolean { return this._isHost }
  get isConnected(): boolean { return this.peer.isConnected || this._useWebSocketFallback }
  get connectionState(): ConnectionState { return this.signaling.state }

  // ---- 事件系统 ----

  onEvent(listener: (event: NetworkEvent) => void): void {
    this.eventListeners.push(listener)
  }

  offEvent(listener: (event: NetworkEvent) => void): void {
    this.eventListeners = this.eventListeners.filter(l => l !== listener)
  }

  private emit(event: NetworkEvent): void {
    for (const listener of this.eventListeners) {
      listener(event)
    }
  }

  // ---- 主要操作 ----

  /** 连接信令服务器 */
  async connect(): Promise<void> {
    await this.signaling.connect()
  }

  /** 创建房间 */
  createRoom(playerName: string): void {
    this._playerName = playerName
    this._isHost = true
    this.signaling.createRoom(playerName)
  }

  /** 加入房间 */
  joinRoom(roomId: string, playerName: string): void {
    this._playerName = playerName
    this._isHost = false
    this.signaling.joinRoom(roomId, playerName)
  }

  /** 离开房间 */
  leaveRoom(): void {
    this.peer.cleanup()
    this.signaling.leaveRoom()
    this._roomId = null
    this._playerId = null
    this._opponentId = null
    this._opponentName = null
    this._myPlayerIndex = -1
  }

  /** 准备 */
  ready(): void {
    this.signaling.ready()
  }

  /** 开始游戏（房主操作） */
  startGame(): void {
    this.signaling.startGame()
  }

  /** 断开所有连接 */
  disconnect(): void {
    this.peer.cleanup()
    this.signaling.disconnect()
    this._roomId = null
    this._playerId = null
    this._opponentId = null
    this._opponentName = null
    this._myPlayerIndex = -1
  }

  /** 发送游戏消息（优先 WebRTC DataChannel，回退到 WebSocket） */
  sendGameMessage(msg: GameMessage): boolean {
    if (!this._useWebSocketFallback && this.peer.isConnected) {
      return this.peer.send(msg)
    }
    // WebSocket 回退：通过信令服务器中转
    // 这里我们把游戏消息包装成一种特殊信令消息
    // 服务器会原样转发给对手
    if (this._useWebSocketFallback && this.signaling.state === 'connected') {
      // 在实际实现中，服务器需要支持 relay_game_message 类型
      // 暂时用简单方式：直接通过 DataChannel or fallback
      return this.signaling.send(msg as any as import('./types').ClientMessage)
    }
    return false
  }

  // ---- 服务器消息处理 ----

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'room_created':
        this._roomId = msg.roomId
        this._playerId = msg.playerId
        this.emit({ type: 'room_created', roomId: msg.roomId, playerId: msg.playerId })
        break

      case 'room_joined':
        this._roomId = msg.roomId
        this._playerId = msg.playerId
        // 如果房间里已经有人，记录对手
        const otherPlayer = msg.players.find(p => p.playerId !== msg.playerId)
        if (otherPlayer) {
          this._opponentId = otherPlayer.playerId
          this._opponentName = otherPlayer.playerName
        }
        this.emit({
          type: 'room_joined',
          roomId: msg.roomId,
          playerId: msg.playerId,
          players: msg.players,
        })
        break

      case 'opponent_joined':
        this._opponentId = msg.opponentId
        this._opponentName = msg.opponentName
        // 对手加入后，房主主动发起 WebRTC 连接
        if (this._isHost && this._opponentId) {
          this.establishPeerConnection()
        }
        this.emit({
          type: 'opponent_joined',
          opponentId: msg.opponentId,
          opponentName: msg.opponentName,
        })
        break

      case 'opponent_left':
        this.peer.cleanup()
        this._opponentId = null
        this._opponentName = null
        this.emit({ type: 'opponent_left' })
        break

      case 'opponent_ready':
        this.emit({ type: 'opponent_ready' })
        break

      case 'game_started':
        this._myPlayerIndex = msg.yourPlayerIndex
        this.emit({
          type: 'game_started',
          firstPlayerIndex: msg.firstPlayerIndex,
          yourPlayerIndex: msg.yourPlayerIndex,
        })
        break

      case 'room_full':
        this.emit({ type: 'room_full' })
        break

      case 'room_not_found':
        this.emit({ type: 'room_not_found' })
        break

      case 'error':
        this.emit({ type: 'error', message: msg.message })
        break

      // WebRTC 信令
      case 'webrtc_offer':
        // 收到 offer，作为响应方处理
        if (this._opponentId) {
          this.peer.handleOffer(msg.sdp, msg.fromPlayerId).then(() => {
            // offer 处理完成后自动发送 answer（通过 onNeedSendAnswer 回调）
          })
        }
        break

      case 'webrtc_answer':
        if (this._opponentId) {
          this.peer.handleAnswer(msg.sdp)
        }
        break

      case 'webrtc_ice_candidate':
        this.peer.handleIceCandidate(msg.candidate, msg.sdpMid, msg.sdpMLineIndex)
        break
    }
  }

  /** 发起 P2P 连接 */
  private async establishPeerConnection(): Promise<void> {
    if (!this._opponentId) return

    try {
      await this.peer.createOffer(this._opponentId)
      console.log('[Network] WebRTC offer created, waiting for answer...')
    } catch (err) {
      console.warn('[Network] WebRTC failed, falling back to WebSocket relay:', err)
      this._useWebSocketFallback = true
    }
  }

  /** 启用 WebSocket 回退模式（小程序等不支持 WebRTC 的环境） */
  enableWebSocketFallback(): void {
    this._useWebSocketFallback = true
  }
}

/** 全局单例 */
let _instance: NetworkManager | null = null

export function getNetworkManager(): NetworkManager {
  if (!_instance) {
    _instance = new NetworkManager()
  }
  return _instance
}

export function resetNetworkManager(): void {
  if (_instance) {
    _instance.disconnect()
    _instance = null
  }
}
