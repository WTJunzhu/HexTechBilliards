import { Room } from './Room'
import type { PlayerConnection } from './types'
import { config } from './config'

/**
 * 房间管理器 — 管理所有房间和玩家-房间映射
 */
export class RoomManager {
  /** roomId → Room */
  private rooms: Map<string, Room> = new Map()

  /** playerId → roomId（快速查找） */
  private playerRoomMap: Map<string, string> = new Map()

  /** 已使用的房间号集合（避免重复） */
  private usedRoomIds: Set<string> = new Set()

  /** 创建新房间 */
  createRoom(host: PlayerConnection): Room {
    const roomId = this.generateRoomId()
    const room = new Room(roomId)
    room.addPlayer(host)
    this.rooms.set(roomId, room)
    this.playerRoomMap.set(host.playerId, roomId)
    this.usedRoomIds.add(roomId)
    return room
  }

  /** 加入房间 */
  joinRoom(roomId: string, player: PlayerConnection): Room | null {
    const room = this.rooms.get(roomId)
    if (!room) return null
    if (room.isFull) return null
    if (!room.addPlayer(player)) return null
    this.playerRoomMap.set(player.playerId, roomId)
    return room
  }

  /** 离开房间 */
  leaveRoom(playerId: string): { room: Room; removedPlayer: PlayerConnection } | null {
    const roomId = this.playerRoomMap.get(playerId)
    if (!roomId) return null
    const room = this.rooms.get(roomId)
    if (!room) return null

    const removedPlayer = room.removePlayer(playerId)
    this.playerRoomMap.delete(playerId)

    // 房间空了就销毁
    if (room.isEmpty) {
      this.rooms.delete(roomId)
      this.usedRoomIds.delete(roomId)
    }

    if (!removedPlayer) return null
    return { room, removedPlayer }
  }

  /** 根据房间号获取房间 */
  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) || null
  }

  /** 根据玩家 ID 获取其所在房间 */
  getRoomByPlayer(playerId: string): Room | null {
    const roomId = this.playerRoomMap.get(playerId)
    if (!roomId) return null
    return this.rooms.get(roomId) || null
  }

  /** 获取当前房间数 */
  get roomCount(): number {
    return this.rooms.size
  }

  /** 生成不重复的6位数字房间号 */
  private generateRoomId(): string {
    const maxAttempt = 100
    for (let i = 0; i < maxAttempt; i++) {
      const id = Math.floor(100000 + Math.random() * 900000).toString()
      if (!this.usedRoomIds.has(id)) return id
    }
    // 极端情况：递增
    const fallback = (100000 + this.usedRoomIds.size).toString()
    return fallback
  }
}
