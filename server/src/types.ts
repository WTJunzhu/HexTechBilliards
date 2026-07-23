// ============================================================
// HexTechBilliards — 消息协议类型（客户端 & 服务器共用）
// ============================================================

// ---- 客户端 → 服务器（信令） ----

export interface CreateRoomMessage {
  type: 'create_room'
  playerName: string
}

export interface JoinRoomMessage {
  type: 'join_room'
  roomId: string
  playerName: string
}

export interface LeaveRoomMessage {
  type: 'leave_room'
}

export interface ReadyMessage {
  type: 'ready'
}

export interface StartGameMessage {
  type: 'start_game'
}

export interface WebRTCOfferMessage {
  type: 'webrtc_offer'
  targetPlayerId: string
  sdp: string
}

export interface WebRTCAnswerMessage {
  type: 'webrtc_answer'
  targetPlayerId: string
  sdp: string
}

export interface WebRTCIceCandidateMessage {
  type: 'webrtc_ice_candidate'
  targetPlayerId: string
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | ReadyMessage
  | StartGameMessage
  | WebRTCOfferMessage
  | WebRTCAnswerMessage
  | WebRTCIceCandidateMessage

// ---- 服务器 → 客户端 ----

export interface RoomCreatedMessage {
  type: 'room_created'
  roomId: string
  playerId: string
}

export interface RoomJoinedMessage {
  type: 'room_joined'
  roomId: string
  playerId: string
  players: RoomPlayerInfo[]
}

export interface OpponentJoinedMessage {
  type: 'opponent_joined'
  opponentId: string
  opponentName: string
}

export interface OpponentLeftMessage {
  type: 'opponent_left'
}

export interface OpponentReadyMessage {
  type: 'opponent_ready'
}

export interface GameStartedMessage {
  type: 'game_started'
  /** 房主先手 → firstPlayerIndex=0 */
  firstPlayerIndex: number
  yourPlayerIndex: number
}

export interface RoomFullMessage {
  type: 'room_full'
}

export interface RoomNotFoundMessage {
  type: 'room_not_found'
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export interface WebRTCOfferRelayMessage {
  type: 'webrtc_offer'
  fromPlayerId: string
  sdp: string
}

export interface WebRTCAnswerRelayMessage {
  type: 'webrtc_answer'
  fromPlayerId: string
  sdp: string
}

export interface WebRTCIceCandidateRelayMessage {
  type: 'webrtc_ice_candidate'
  fromPlayerId: string
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
}

export type ServerMessage =
  | RoomCreatedMessage
  | RoomJoinedMessage
  | OpponentJoinedMessage
  | OpponentLeftMessage
  | OpponentReadyMessage
  | GameStartedMessage
  | RoomFullMessage
  | RoomNotFoundMessage
  | ErrorMessage
  | WebRTCOfferRelayMessage
  | WebRTCAnswerRelayMessage
  | WebRTCIceCandidateRelayMessage

// ---- P2P 游戏消息（WebRTC DataChannel / WebSocket 回退） ----

export interface ShootMessage {
  type: 'shoot'
  power: number
  angle: number
  timestamp: number
}

export interface PlaceCueBallMessage {
  type: 'place_cue_ball'
  position: { x: number; y: number }
}

export interface GameReadyMessage {
  type: 'game_ready'
}

export interface RematchRequestMessage {
  type: 'rematch_request'
}

export interface RematchAcceptMessage {
  type: 'rematch_accept'
}

export interface StateChecksumMessage {
  type: 'state_checksum'
  checksum: string
  turnCount: number
}

export type GameMessage =
  | ShootMessage
  | PlaceCueBallMessage
  | GameReadyMessage
  | RematchRequestMessage
  | RematchAcceptMessage
  | StateChecksumMessage

// ---- 通用类型 ----

export interface RoomPlayerInfo {
  playerId: string
  playerName: string
  ready: boolean
}

/** 服务器端玩家连接上下文 */
export interface PlayerConnection {
  playerId: string
  playerName: string
  ws: any  // WebSocket instance
  roomId: string | null
  ready: boolean
}
