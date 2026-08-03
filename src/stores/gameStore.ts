import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Ball, BallState } from '../engine/physics/Ball'
import { Vector2 } from '../engine/physics/Vector2'
import { PhysicsWorld } from '../engine/physics/PhysicsWorld'
import { RuleEngine } from '../engine/game/RuleEngine'
import { TABLE_WIDTH, TABLE_HEIGHT } from '../engine/physics/TableSpec'
import { GamePhase as GP, BallGroup as BG, type Player as PlayerType, type TurnResult } from '../engine/game/GameState'
import { getNetworkManager } from '../network/NetworkManager'
import type { GameMessage, GameSnapshotMessage, NetworkEvent } from '../network/types'

/**
 * 中式八球初始球位
 *
 * ⚠️ 中式八球开球摆放：
 * - 8号球在三角形中心
 * - 三角形底边两角必须一全色一花色
 * - 三角形顶球在开球线上
 *
 * 使用缩放后的游戏坐标系：TABLE_WIDTH=36, TABLE_HEIGHT=18
 */
function createInitialBalls(): Ball[] {
  const balls: Ball[] = []

  // 白球 - 开球区（左侧1/4处）
  balls.push(new Ball(0, new Vector2(TABLE_WIDTH * 0.25, TABLE_HEIGHT * 0.5)))

  // 三角形排列 - 顶球在球桌3/4处
  const startX = TABLE_WIDTH * 0.72
  const startY = TABLE_HEIGHT * 0.5
  const spacing = 2.15 // 球间距（略大于直径，防止初始重叠）

  // 三角形位置（5行：1+2+3+4+5）
  const positions: { row: number; col: number; number: number }[] = [
    // 第1行（顶球） - 任意全色球
    { row: 0, col: 0, number: 1 },
    // 第2行 - 一花色一全色
    { row: 1, col: 0, number: 9 },
    { row: 1, col: 1, number: 2 },
    // 第3行 - 8号在中间
    { row: 2, col: 0, number: 10 },
    { row: 2, col: 1, number: 8 },  // 8号球居中
    { row: 2, col: 2, number: 3 },
    // 第4行
    { row: 3, col: 0, number: 11 },
    { row: 3, col: 1, number: 4 },
    { row: 3, col: 2, number: 12 },
    { row: 3, col: 3, number: 5 },
    // 第5行 - 底边，两角一全色一花色
    { row: 4, col: 0, number: 6 },   // 角：全色
    { row: 4, col: 1, number: 13 },
    { row: 4, col: 2, number: 14 },
    { row: 4, col: 3, number: 7 },
    { row: 4, col: 4, number: 15 },  // 角：花色
  ]

  for (const pos of positions) {
    const x = startX + pos.row * spacing * Math.cos(Math.PI / 6)
    const y = startY + (pos.col - pos.row / 2) * spacing
    balls.push(new Ball(pos.number, new Vector2(x, y)))
  }

  return balls
}

/**
 * 计算球局状态的校验和（用于检测两个客户端的物理是否漂移）
 */
function computeChecksum(balls: Ball[]): string {
  const data = balls
    .filter(b => b.active || b.state === BallState.PLACING)
    .map(b => `${b.number}:${b.position.x.toFixed(4)},${b.position.y.toFixed(4)}:${b.state}`)
    .sort()
    .join('|')
  // 简单哈希 — 不需要加密级别
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const ch = data.charCodeAt(i)
    hash = ((hash << 5) - hash + ch) | 0
  }
  return hash.toString(36)
}

export const useGameStore = defineStore('game', () => {
  // === 核心引擎 ===
  const physicsWorld = new PhysicsWorld()
  const ruleEngine = new RuleEngine()

  // === 游戏状态 ===
  const phase = ref<GP>(GP.IDLE)
  const players = ref<PlayerType[]>([
    { index: 0, name: '玩家1', group: BG.NONE, pocketedCount: 0 },
    { index: 1, name: '玩家2', group: BG.NONE, pocketedCount: 0 },
  ])
  const currentPlayerIndex = ref(0)
  const turnCount = ref(0)
  const groupsAssigned = ref(false)
  const winner = ref<number | null>(null)
  const winReason = ref<string | null>(null)

  // === 回合跟踪 ===
  const firstHitBallThisTurn = ref<number | null>(null)
  const pocketedThisTurn = ref<Ball[]>([])
  const turnResult = ref<TurnResult | null>(null)
  const foulMessage = ref<string | null>(null)

  // === 瞄准/击球状态 ===
  const aimAngle = ref(0)
  const shotPower = ref(0)

  // === 在线模式 ===
  const isOnlineMode = ref(false)
  const myPlayerIndex = ref(-1)  // 在线时我在房间的位置（0或1）
  const networkStatus = ref<'connected' | 'disconnected' | 'reconnecting'>('disconnected')
  const opponentDisconnected = ref(false)
  const rematchRequested = ref(false)
  const opponentRequestedRematch = ref(false)

  // 网络管理器引用
  let networkManager: ReturnType<typeof getNetworkManager> | null = null
  let networkEventHandler: ((event: NetworkEvent) => void) | null = null

  // 当前玩家
  const currentPlayer = () => players.value[currentPlayerIndex.value]
  const otherPlayer = () => players.value[1 - currentPlayerIndex.value]

  /** 是否是我的回合（在线模式下只有轮到我才能操作） */
  const isMyTurn = () => {
    if (!isOnlineMode.value) return true
    return currentPlayerIndex.value === myPlayerIndex.value
  }

  /** 初始化/重新开始游戏 */
  function initGame(): void {
    physicsWorld.balls = createInitialBalls()
    phase.value = GP.BREAK_SHOT
    players.value[0].group = BG.NONE
    players.value[0].pocketedCount = 0
    players.value[1].group = BG.NONE
    players.value[1].pocketedCount = 0
    currentPlayerIndex.value = 0
    turnCount.value = 0
    groupsAssigned.value = false
    winner.value = null
    winReason.value = null
    firstHitBallThisTurn.value = null
    pocketedThisTurn.value = []
    turnResult.value = null
    foulMessage.value = null
    opponentDisconnected.value = false
    rematchRequested.value = false
    opponentRequestedRematch.value = false
  }

  /**
   * 初始化在线模式
   * @param myIndex 我在房间中的玩家编号（0或1）
   */
  function initOnlineMode(myIndex: number): void {
    isOnlineMode.value = true
    myPlayerIndex.value = myIndex

    // 绑定网络事件
    networkManager = getNetworkManager()
    networkEventHandler = handleNetworkEvent
    networkManager.onEvent(networkEventHandler)

    // 初始化游戏
    initGame()
  }

  /** 离开在线模式 */
  function leaveOnlineMode(): void {
    if (networkManager && networkEventHandler) {
      networkManager.offEvent(networkEventHandler)
      networkEventHandler = null
    }
    isOnlineMode.value = false
    myPlayerIndex.value = -1
  }

  /** 处理网络事件 */
  function handleNetworkEvent(event: NetworkEvent): void {
    switch (event.type) {
      case 'connection_state':
        if (event.state === 'connected') {
          networkStatus.value = 'connected'
        } else if (event.state === 'reconnecting') {
          networkStatus.value = 'reconnecting'
        } else {
          networkStatus.value = 'disconnected'
        }
        break

      case 'opponent_left':
        opponentDisconnected.value = true
        winner.value = myPlayerIndex.value >= 0 ? myPlayerIndex.value : null
        winReason.value = '对手已离开，本局判定为你获胜'
        phase.value = GP.GAME_OVER
        networkStatus.value = 'disconnected'
        break

      case 'game_message':
        handleGameMessage(event.message)
        break
    }
  }

  /** 处理收到的游戏消息（来自对手） */
  function handleGameMessage(msg: GameMessage): void {
    switch (msg.type) {
      case 'shoot':
        // 对手击球 — 用相同参数在本地执行物理
        localShoot(msg.power, msg.angle)
        break

      case 'place_cue_ball':
        // 对手放置白球
        localPlaceCueBall(new Vector2(msg.position.x, msg.position.y))
        break

      case 'state_checksum':
        // 校验和仅做提前预警；房主会在回合结算时发送完整快照进行最终校正。
        const localChecksum = computeChecksum(physicsWorld.balls)
        if (localChecksum !== msg.checksum) {
          console.warn(`[Online] State drift detected at turn ${msg.turnCount}: local=${localChecksum}, remote=${msg.checksum}`)
        }
        break

      case 'game_snapshot':
        applyGameSnapshot(msg)
        break

      case 'game_ready':
        console.log('[Online] Opponent game ready')
        break

      case 'rematch_request':
        opponentRequestedRematch.value = true
        break

      case 'rematch_accept':
        initGame()
        break
    }
  }

  /** 击球（统一入口） */
  function shoot(power: number, angle: number): void {
    // 在线模式下，只有轮到我才能击球
    if (isOnlineMode.value && !isMyTurn()) return

    if (isOnlineMode.value) {
      // 在线模式：先发送给对手，再本地执行
      networkManager?.sendGameMessage({
        type: 'shoot',
        power,
        angle,
        timestamp: Date.now(),
      })
    }

    localShoot(power, angle)
  }

  /** 本地执行击球 */
  function localShoot(power: number, angle: number): void {
    const cueBall = physicsWorld.balls.find(b => b.isCue && b.active)
    if (!cueBall) return

    cueBall.shoot(power, angle)
    phase.value = GP.BALLS_MOVING
    firstHitBallThisTurn.value = null
    pocketedThisTurn.value = []
  }

  /** 游戏主循环 - 每帧调用 */
  function update(): void {
    if (phase.value !== GP.BALLS_MOVING) return

    // 物理步进
    physicsWorld.step()

    // 追踪第一个碰撞的球
    if (firstHitBallThisTurn.value === null) {
      for (const event of physicsWorld.collisionEventsThisFrame) {
        if (event.ball1.isCue) {
          firstHitBallThisTurn.value = event.ball2.number
          break
        } else if (event.ball2.isCue) {
          firstHitBallThisTurn.value = event.ball1.number
          break
        }
      }
    }

    // 追踪进袋球
    pocketedThisTurn.value.push(...physicsWorld.pocketedBallsThisFrame)

    // 所有球停止 → 进入回合结束判定
    if (physicsWorld.allBallsStopped) {
      endTurn()
    }
  }

  /** 回合结束判定 */
  function endTurn(): void {
    const isBreakShot = phase.value === GP.BREAK_SHOT || turnCount.value === 0

    // 计算回合结果
    const result = ruleEngine.evaluateTurn(
      physicsWorld.balls,
      pocketedThisTurn.value,
      firstHitBallThisTurn.value,
      currentPlayer(),
      otherPlayer(),
      isBreakShot,
    )
    turnResult.value = result

    // 球组分配（中式八球：第一个合法进球决定球组）
    if (!groupsAssigned.value && !isBreakShot) {
      for (const ball of pocketedThisTurn.value) {
        if (!ball.isCue && !ball.isEight) {
          const assigned = ruleEngine.assignGroups(
            ball, currentPlayer(), otherPlayer(), isBreakShot
          )
          if (assigned) {
            groupsAssigned.value = true
            break
          }
        }
      }
    }

    // 更新玩家进球数
    ruleEngine.updatePlayerScore(physicsWorld.balls, players.value[0])
    ruleEngine.updatePlayerScore(physicsWorld.balls, players.value[1])

    // 检查胜负
    const winResult = ruleEngine.checkWin(
      physicsWorld.balls, currentPlayer(), otherPlayer(), result
    )
    if (winResult) {
      winner.value = winResult.winner
      winReason.value = winResult.reason
      phase.value = GP.GAME_OVER
      broadcastOnlineState()
      return
    }

    // 白球进袋处理
    if (result.cueBallPocketed) {
      const cueBall = physicsWorld.balls.find(b => b.isCue)
      if (cueBall) {
        cueBall.state = BallState.PLACING
      }
      phase.value = GP.BALL_IN_HAND
      foulMessage.value = result.foulReason || '犯规！对手自由球'
      broadcastOnlineState()
      return
    }

    // 判定是否换手
    const shouldSwitch = ruleEngine.shouldSwitchTurn(result, currentPlayer())

    if (result.foul) {
      foulMessage.value = result.foulReason ?? null
    } else {
      foulMessage.value = null
    }

    if (shouldSwitch) {
      currentPlayerIndex.value = 1 - currentPlayerIndex.value
    }

    turnCount.value++
    phase.value = GP.AIMING

    broadcastOnlineState()

    // 清除回合数据
    firstHitBallThisTurn.value = null
    pocketedThisTurn.value = []
  }

  function broadcastOnlineState(): void {
    if (!isOnlineMode.value) return
    networkManager?.sendGameMessage({
      type: 'state_checksum',
      checksum: computeChecksum(physicsWorld.balls),
      turnCount: turnCount.value,
    })
    if (networkManager?.isHost) {
      networkManager.sendGameMessage(createGameSnapshot())
    }
  }

  /** 请求在线再来一局，等待对手确认。 */
  function requestRematch(): void {
    if (!isOnlineMode.value || opponentDisconnected.value || rematchRequested.value) return
    rematchRequested.value = true
    networkManager?.sendGameMessage({ type: 'rematch_request' })
  }

  /** 接受对手的再来一局请求，双方使用相同初始球局重置。 */
  function acceptRematch(): void {
    if (!isOnlineMode.value || !opponentRequestedRematch.value) return
    networkManager?.sendGameMessage({ type: 'rematch_accept' })
    initGame()
  }

  function createGameSnapshot(): GameSnapshotMessage {
    return {
      type: 'game_snapshot',
      turnCount: turnCount.value,
      currentPlayerIndex: currentPlayerIndex.value,
      phase: phase.value as GameSnapshotMessage['phase'],
      groupsAssigned: groupsAssigned.value,
      players: players.value.map(player => ({
        index: player.index,
        group: player.group,
        pocketedCount: player.pocketedCount,
      })),
      winner: winner.value,
      winReason: winReason.value,
      balls: physicsWorld.balls.map(ball => ({
        number: ball.number,
        position: { x: ball.position.x, y: ball.position.y },
        velocity: { x: ball.velocity.x, y: ball.velocity.y },
        state: ball.state,
      })),
    }
  }

  function applyGameSnapshot(snapshot: GameSnapshotMessage): void {
    if (!isOnlineMode.value || snapshot.turnCount < turnCount.value) return

    for (const snapshotBall of snapshot.balls) {
      const ball = physicsWorld.balls.find(candidate => candidate.number === snapshotBall.number)
      if (!ball) continue
      ball.position = new Vector2(snapshotBall.position.x, snapshotBall.position.y)
      ball.velocity = new Vector2(snapshotBall.velocity.x, snapshotBall.velocity.y)
      ball.state = snapshotBall.state as BallState
    }

    currentPlayerIndex.value = snapshot.currentPlayerIndex
    turnCount.value = snapshot.turnCount
    groupsAssigned.value = snapshot.groupsAssigned
    players.value.forEach(player => {
      const snapshotPlayer = snapshot.players.find(candidate => candidate.index === player.index)
      if (!snapshotPlayer) return
      player.group = snapshotPlayer.group as BG
      player.pocketedCount = snapshotPlayer.pocketedCount
    })
    winner.value = snapshot.winner
    winReason.value = snapshot.winReason
    phase.value = snapshot.phase as GP
    firstHitBallThisTurn.value = null
    pocketedThisTurn.value = []
    foulMessage.value = null
  }

  /** 放置自由球（统一入口） */
  function placeCueBall(position: Vector2): boolean {
    // 在线模式下，只有轮到我才能放置
    if (isOnlineMode.value && !isMyTurn()) return false

    const success = localPlaceCueBall(position)

    if (success && isOnlineMode.value) {
      // 在线模式：发送给对手
      networkManager?.sendGameMessage({
        type: 'place_cue_ball',
        position: { x: position.x, y: position.y },
      })
    }

    return success
  }

  /** 本地放置白球 */
  function localPlaceCueBall(position: Vector2): boolean {
    const cueBall = physicsWorld.balls.find(b => b.isCue)
    if (!cueBall) return false

    // 检查位置是否合法
    if (!physicsWorld.isInsideTable(position)) return false
    if (physicsWorld.isPositionOverlap(position, cueBall)) return false
    if (physicsWorld.isInsideAnyPocket(position)) return false

    cueBall.place(position)
    foulMessage.value = null
    phase.value = GP.AIMING
    return true
  }

  return {
    // 状态
    phase, players, currentPlayerIndex, turnCount,
    groupsAssigned, winner, winReason,
    foulMessage, aimAngle, shotPower,
    // 在线模式状态
    isOnlineMode, myPlayerIndex, networkStatus,
    opponentDisconnected, rematchRequested, opponentRequestedRematch,
    // 引擎
    physicsWorld, ruleEngine,
    // 方法
    initGame, shoot, update, placeCueBall,
    currentPlayer, otherPlayer,
    firstHitBallThisTurn,
    // 在线模式方法
    initOnlineMode, leaveOnlineMode, isMyTurn,
    requestRematch, acceptRematch,
  }
})
