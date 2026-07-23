import type { PlayerConnection, RoomPlayerInfo } from './types'

/**
 * 单个房间
 */
export class Room {
  public readonly roomId: string
  public readonly createdAt: number = Date.now()

  /** 房间内的玩家连接 */
  private players: Map<string, PlayerConnection> = new Map()

  /** 游戏是否已开始 */
  public gameStarted = false

  constructor(roomId: string) {
    this.roomId = roomId
  }

  get playerCount(): number {
    return this.players.size
  }

  get isFull(): boolean {
    return this.players.size >= 2
  }

  get isEmpty(): boolean {
    return this.players.size === 0
  }

  /** 添加玩家到房间 */
  addPlayer(conn: PlayerConnection): boolean {
    if (this.isFull) return false
    conn.roomId = this.roomId
    this.players.set(conn.playerId, conn)
    return true
  }

  /** 移除玩家 */
  removePlayer(playerId: string): PlayerConnection | null {
    const conn = this.players.get(playerId)
    if (!conn) return null
    this.players.delete(playerId)
    conn.roomId = null
    return conn
  }

  /** 获取玩家信息 */
  getPlayer(playerId: string): PlayerConnection | null {
    return this.players.get(playerId) || null
  }

  /** 获取另一个玩家（对手） */
  getOpponent(playerId: string): PlayerConnection | null {
    for (const [id, conn] of this.players) {
      if (id !== playerId) return conn
    }
    return null
  }

  /** 获取所有玩家信息列表 */
  getPlayerList(): RoomPlayerInfo[] {
    const list: RoomPlayerInfo[] = []
    for (const [id, conn] of this.players) {
      list.push({
        playerId: id,
        playerName: conn.playerName,
        ready: conn.ready,
      })
    }
    return list
  }

  /** 向房间内所有玩家广播消息 */
  broadcast(message: object, excludePlayerId?: string): void {
    const data = JSON.stringify(message)
    for (const [id, conn] of this.players) {
      if (id !== excludePlayerId && conn.ws.readyState === 1) {
        conn.ws.send(data)
      }
    }
  }

  /** 向单个玩家发送消息 */
  sendTo(playerId: string, message: object): boolean {
    const conn = this.players.get(playerId)
    if (!conn || conn.ws.readyState !== 1) return false
    conn.ws.send(JSON.stringify(message))
    return true
  }

  /** 检查是否所有玩家都准备好了 */
  get allReady(): boolean {
    if (this.players.size < 2) return false
    for (const conn of this.players.values()) {
      if (!conn.ready) return false
    }
    return true
  }

  /** 销毁房间 */
  destroy(): void {
    for (const conn of this.players.values()) {
      conn.roomId = null
    }
    this.players.clear()
  }
}
