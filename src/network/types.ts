// ============================================================
// HexTechBilliards — 消息协议类型（客户端侧）
// ============================================================

// ---- 客户端 → 服务器 ----

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

export interface RelayGameMessage {
  type: 'relay_game_message'
  message: GameMessage
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
  | RelayGameMessage

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

export interface RelayGameMessageReceived {
  type: 'relay_game_message'
  fromPlayerId: string
  message: GameMessage
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
  | RelayGameMessageReceived

// ---- P2P 游戏消息 ----

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

export interface GameSnapshotMessage {
  type: 'game_snapshot'
  turnCount: number
  currentPlayerIndex: number
  phase: 'break_shot' | 'aiming' | 'ball_in_hand' | 'game_over'
  groupsAssigned: boolean
  players: Array<{
    index: number
    group: 'none' | 'solid' | 'stripe'
    pocketedCount: number
  }>
  winner: number | null
  winReason: string | null
  balls: Array<{
    number: number
    position: { x: number; y: number }
    velocity: { x: number; y: number }
    state: 'active' | 'pocketed' | 'placing'
  }>
}

export type GameMessage =
  | ShootMessage
  | PlaceCueBallMessage
  | GameReadyMessage
  | RematchRequestMessage
  | RematchAcceptMessage
  | StateChecksumMessage
  | GameSnapshotMessage

// ---- 通用 ----

export interface RoomPlayerInfo {
  playerId: string
  playerName: string
  ready: boolean
}

/** 连接状态 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/** 网络事件（NetworkManager 对外暴露） */
export type NetworkEvent =
  | { type: 'room_created'; roomId: string; playerId: string }
  | { type: 'room_joined'; roomId: string; playerId: string; players: RoomPlayerInfo[] }
  | { type: 'opponent_joined'; opponentId: string; opponentName: string }
  | { type: 'opponent_left' }
  | { type: 'opponent_ready' }
  | { type: 'game_started'; firstPlayerIndex: number; yourPlayerIndex: number }
  | { type: 'room_full' }
  | { type: 'room_not_found' }
  | { type: 'error'; message: string }
  | { type: 'connection_state'; state: ConnectionState }
  | { type: 'game_message'; message: GameMessage }
