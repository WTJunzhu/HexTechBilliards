import { WebSocketServer, WebSocket } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { RoomManager } from './RoomManager'
import { config } from './config'
import type {
  ClientMessage,
  PlayerConnection,
  ServerMessage,
} from './types'

const roomManager = new RoomManager()

/** 所有连接的玩家 playerId → PlayerConnection */
const connections = new Map<string, PlayerConnection>()

// ============================================================
// 服务器入口
// ============================================================

const wss = new WebSocketServer({ port: config.port })

console.log(`🎱 HexTechBilliards Signaling Server running on ws://localhost:${config.port}`)

wss.on('connection', (ws: WebSocket) => {
  const playerId = uuidv4()
  const conn: PlayerConnection = {
    playerId,
    playerName: '',
    ws,
    roomId: null,
    ready: false,
  }
  connections.set(playerId, conn)

  // 启用 ping/pong 心跳检测
  ;(ws as any)._isAlive = true
  ws.on('pong', () => {
    ;(ws as any)._isAlive = true
  })

  console.log(`[+] Player connected: ${playerId}`)

  ws.on('message', (raw: Buffer) => {
    const data = raw.toString()

    // 心跳消息处理（客户端发来的 heartbeat JSON 或纯文本 ping）
    if (data === '__ping__' || data === '__pong__') {
      // 纯文本心跳，原样回复
      if (data === '__ping__') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('__pong__')
        }
      }
      ;(ws as any)._isAlive = true
      return
    }

    try {
      const msg = JSON.parse(data) as ClientMessage
      // 客户端 JSON 心跳
      if ((msg as any).type === 'heartbeat') {
        ;(ws as any)._isAlive = true
        return
      }
      handleMessage(conn, msg)
    } catch (err) {
      send(conn, { type: 'error', message: 'Invalid message format' })
    }
  })

  ws.on('close', () => {
    console.log(`[-] Player disconnected: ${conn.playerName || playerId}`)
    handleDisconnect(conn)
    connections.delete(playerId)
  })

  ws.on('error', (err) => {
    console.error(`[!] WebSocket error for ${playerId}:`, err.message)
  })
})

// ============================================================
// 心跳保活 — 每 30s 向所有客户端发 ping
// 未响应的连接视为断线，自动清理
// 防止 Render/Nginx 等反向代理因空闲超时断连
// ============================================================

setInterval(() => {
  for (const [playerId, conn] of connections) {
    const ws = conn.ws
    if (!(ws as any)._isAlive) {
      console.log(`[Heartbeat] Terminating dead connection: ${conn.playerName || playerId}`)
      ws.terminate()
      // terminate 会触发 close 事件，在 close 中做清理
      return
    }
    ;(ws as any)._isAlive = false
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping()
    }
  }
}, config.heartbeatIntervalMs)

// ============================================================
// 消息处理
// ============================================================

function handleMessage(conn: PlayerConnection, msg: ClientMessage): void {
  switch (msg.type) {
    case 'create_room':
      handleCreateRoom(conn, msg.playerName)
      break
    case 'join_room':
      handleJoinRoom(conn, msg.roomId, msg.playerName)
      break
    case 'leave_room':
      handleLeaveRoom(conn)
      break
    case 'ready':
      handleReady(conn)
      break
    case 'start_game':
      handleStartGame(conn)
      break
    // WebRTC 信令中转
    case 'webrtc_offer':
    case 'webrtc_answer':
    case 'webrtc_ice_candidate':
      handleWebRTCRelay(conn, msg)
      break
    default:
      send(conn, { type: 'error', message: `Unknown message type: ${(msg as any).type}` })
  }
}

// ---- 创建房间 ----
function handleCreateRoom(conn: PlayerConnection, playerName: string): void {
  if (conn.roomId) {
    send(conn, { type: 'error', message: 'Already in a room' })
    return
  }
  conn.playerName = playerName || `Player_${conn.playerId.slice(0, 4)}`
  const room = roomManager.createRoom(conn)
  console.log(`[Room] Created: ${room.roomId} by ${conn.playerName}`)
  send(conn, {
    type: 'room_created',
    roomId: room.roomId,
    playerId: conn.playerId,
  })
}

// ---- 加入房间 ----
function handleJoinRoom(conn: PlayerConnection, roomId: string, playerName: string): void {
  if (conn.roomId) {
    send(conn, { type: 'error', message: 'Already in a room' })
    return
  }
  conn.playerName = playerName || `Player_${conn.playerId.slice(0, 4)}`

  const room = roomManager.getRoom(roomId)
  if (!room) {
    send(conn, { type: 'room_not_found' })
    return
  }
  if (room.isFull) {
    send(conn, { type: 'room_full' })
    return
  }

  room.addPlayer(conn)

  // 发给加入者：房间信息
  send(conn, {
    type: 'room_joined',
    roomId: room.roomId,
    playerId: conn.playerId,
    players: room.getPlayerList(),
  })

  // 通知已在房间的人：对手加入
  const opponent = room.getOpponent(conn.playerId)
  if (opponent) {
    send(opponent, {
      type: 'opponent_joined',
      opponentId: conn.playerId,
      opponentName: conn.playerName,
    })
  }

  console.log(`[Room] ${conn.playerName} joined room ${roomId}`)
}

// ---- 离开房间 ----
function handleLeaveRoom(conn: PlayerConnection): void {
  if (!conn.roomId) return
  const result = roomManager.leaveRoom(conn.playerId)
  if (!result) return

  // 通知对手
  const opponent = result.room.getOpponent(conn.playerId)
  if (opponent) {
    send(opponent, { type: 'opponent_left' })
  }

  conn.ready = false
  console.log(`[Room] ${conn.playerName} left room ${conn.roomId}`)
}

// ---- 准备 ----
function handleReady(conn: PlayerConnection): void {
  if (!conn.roomId) return
  const room = roomManager.getRoomByPlayer(conn.playerId)
  if (!room) return

  conn.ready = true

  // 通知对手
  const opponent = room.getOpponent(conn.playerId)
  if (opponent) {
    send(opponent, { type: 'opponent_ready' })
  }

  console.log(`[Room] ${conn.playerName} is ready in room ${conn.roomId}`)
}

// ---- 开始游戏 ----
function handleStartGame(conn: PlayerConnection): void {
  if (!conn.roomId) return
  const room = roomManager.getRoomByPlayer(conn.playerId)
  if (!room) return

  if (!room.allReady) {
    send(conn, { type: 'error', message: 'Not all players are ready' })
    return
  }

  room.gameStarted = true

  // 给两位玩家发开始消息，各自带上自己的 playerIndex
  const playerList = room.getPlayerList()
  for (let i = 0; i < playerList.length; i++) {
    const p = playerList[i]
    room.sendTo(p.playerId, {
      type: 'game_started',
      firstPlayerIndex: 0,   // 房主（先加入者）先手
      yourPlayerIndex: i,
    })
  }

  console.log(`[Room] Game started in room ${room.roomId}`)
}

// ---- WebRTC 信令中转 ----
function handleWebRTCRelay(conn: PlayerConnection, msg: ClientMessage): void {
  if (!conn.roomId) return
  const room = roomManager.getRoomByPlayer(conn.playerId)
  if (!room) return

  let relayMsg: ServerMessage

  switch (msg.type) {
    case 'webrtc_offer':
      relayMsg = {
        type: 'webrtc_offer',
        fromPlayerId: conn.playerId,
        sdp: msg.sdp,
      }
      break
    case 'webrtc_answer':
      relayMsg = {
        type: 'webrtc_answer',
        fromPlayerId: conn.playerId,
        sdp: msg.sdp,
      }
      break
    case 'webrtc_ice_candidate':
      relayMsg = {
        type: 'webrtc_ice_candidate',
        fromPlayerId: conn.playerId,
        candidate: msg.candidate,
        sdpMid: msg.sdpMid,
        sdpMLineIndex: msg.sdpMLineIndex,
      }
      break
    default:
      return
  }

  // 转发给对手
  const opponent = room.getOpponent(conn.playerId)
  if (opponent) {
    send(opponent, relayMsg)
  }
}

// ---- 断线处理 ----
function handleDisconnect(conn: PlayerConnection): void {
  if (!conn.roomId) return
  handleLeaveRoom(conn)
}

// ============================================================
// 工具函数
// ============================================================

function send(conn: PlayerConnection, msg: ServerMessage): void {
  if (conn.ws.readyState === 1) {
    conn.ws.send(JSON.stringify(msg))
  }
}
