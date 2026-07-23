export const config = {
  /** 服务器端口 */
  port: parseInt(process.env.PORT || '3001', 10),

  /** 房间号长度（6位数字） */
  roomIdLength: 6,

  /** 房间最大人数 */
  maxPlayersPerRoom: 2,

  /** 玩家断线后房间保留时间（毫秒） */
  roomKeepAliveMs: 30_000,

  /** 心跳间隔（毫秒） */
  heartbeatIntervalMs: 15_000,
}
