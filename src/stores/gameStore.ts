import { defineStore } from 'pinia'
import { ref, markRaw } from 'vue'
import { Ball, BallState } from '../engine/physics/Ball'
import { Vector2 } from '../engine/physics/Vector2'
import { PhysicsWorld } from '../engine/physics/PhysicsWorld'
import { RuleEngine } from '../engine/game/RuleEngine'
import { TABLE_WIDTH, TABLE_HEIGHT, PHYSICS_DT, BREAK_LINE_X } from '../engine/physics/TableSpec'
import { GamePhase as GP, BallGroup as BG, type Player as PlayerType, type TurnResult, type ShotInfo } from '../engine/game/GameState'
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
 */
const RACK_GAP = 0.02
const RACK_JITTER = 0.01

function createInitialBalls(): Ball[] {
  const balls: Ball[] = []

  // 白球 - 开球线上（开球前可在开球线后自由摆放）
  balls.push(new Ball(0, new Vector2(BREAK_LINE_X, TABLE_HEIGHT * 0.5)))

  // 三角形排列 - 顶球在置球点（球桌 3/4 处）
  const startX = TABLE_WIDTH * 0.75
  const startY = TABLE_HEIGHT * 0.5
  // 真实球堆不可能绝对贴紧：完全贴紧时动量像牛顿摆一样只传给末端的球，开球散不开。
  // 这里给每颗球加一点微小的固定偏移（同一套种子，联机双方结果一致）
  const spacing = 2 + RACK_GAP
  let seed = 20261020
  const jitter = () => {
    seed = (seed * 16807) % 2147483647
    return (seed / 2147483647 - 0.5) * 2 * RACK_JITTER
  }

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
    balls.push(new Ball(pos.number, new Vector2(x + jitter(), y + jitter())))
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

/** 对局模式：本地双人 / 在线 / 单人练习 / 人机对战（电脑为玩家2） */
export type GameMode = 'local' | 'online' | 'practice' | 'ai'

/** 屏幕中央的短暂提示（犯规、分组、开球重摆等） */
export interface GameNotice {
  id: number
  text: string
  kind: 'foul' | 'info'
}

export const useGameStore = defineStore('game', () => {
  // === 核心引擎 ===
  // markRaw：引擎对象每帧高频读写，不需要 Vue 响应式代理
  const physicsWorld = markRaw(new PhysicsWorld())
  const ruleEngine = markRaw(new RuleEngine())

  // === 游戏状态 ===
  const phase = ref<GP>(GP.IDLE)
  const gameMode = ref<GameMode>('local')
  const notice = ref<GameNotice | null>(null)
  let noticeSeq = 0
  /** 练习模式击球次数 */
  const shotCount = ref(0)
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
  const isBreakShot = ref(true)
  const firstHitBallThisTurn = ref<number | null>(null)
  const pocketedThisTurn = ref<Ball[]>([])
  /** 打8号球时指定的袋口（每杆清空） */
  const calledPocket = ref<number | null>(null)
  // 本杆物理过程跟踪（不需要响应式）
  let firstContactSeq: number | null = null
  let railAfterContact = false
  let railedObjectBalls = new Set<number>()
  let eightBallPocket: number | null = null
  let shotCalledPocket: number | null = null
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

  // 尚未消耗的物理时间（秒）
  let physicsAccumulator = 0

  // 当前玩家
  const currentPlayer = () => players.value[currentPlayerIndex.value]
  const otherPlayer = () => players.value[1 - currentPlayerIndex.value]

  /** 是否是我的回合（在线模式下只有轮到我才能操作） */
  const isMyTurn = () => {
    if (gameMode.value === 'online') return currentPlayerIndex.value === myPlayerIndex.value
    if (gameMode.value === 'ai') return currentPlayerIndex.value === 0
    return true
  }

  function showNotice(text: string, kind: GameNotice['kind'] = 'info'): void {
    notice.value = { id: ++noticeSeq, text, kind }
  }

  /** 初始化/重新开始游戏 */
  function initGame(mode?: GameMode): void {
    if (mode) gameMode.value = mode
    if (gameMode.value !== 'online') {
      players.value[0].name = gameMode.value === 'practice' ? '练习' : '玩家1'
      players.value[1].name = gameMode.value === 'ai' ? '电脑' : '玩家2'
    }
    shotCount.value = 0
    notice.value = null
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
    isBreakShot.value = true
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
    gameMode.value = 'online'
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
    gameMode.value = 'local'
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
        calledPocket.value = msg.calledPocket ?? null
        localShoot(msg.power, msg.angle, msg.spinX ?? 0, msg.spinY ?? 0)
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

      case 'resign':
        winner.value = myPlayerIndex.value
        winReason.value = '对手认输'
        phase.value = GP.GAME_OVER
        break
    }
  }

  /** 击球（统一入口） */
  function shoot(power: number, angle: number, spinX = 0, spinY = 0): void {
    // 在线模式下，只有轮到我才能击球
    if (isOnlineMode.value && !isMyTurn()) return

    if (isOnlineMode.value) {
      // 在线模式：先发送给对手，再本地执行
      networkManager?.sendGameMessage({
        type: 'shoot',
        power,
        angle,
        spinX,
        spinY,
        calledPocket: calledPocket.value,
        timestamp: Date.now(),
      })
    }

    localShoot(power, angle, spinX, spinY)
  }

  /** 本地执行击球 */
  function localShoot(power: number, angle: number, spinX = 0, spinY = 0): void {
    const cueBall = physicsWorld.balls.find(b => b.isCue && b.active)
    if (!cueBall) return

    cueBall.shoot(power, angle, spinX, spinY)
    shotCount.value++
    phase.value = GP.BALLS_MOVING
    firstHitBallThisTurn.value = null
    pocketedThisTurn.value = []
    firstContactSeq = null
    railAfterContact = false
    railedObjectBalls = new Set()
    eightBallPocket = null
    shotCalledPocket = calledPocket.value
  }

  /**
   * 游戏主循环 - 每帧调用
   * @param frameSeconds 距上一帧的真实时间（秒），按固定步长 PHYSICS_DT 消耗
   */
  function update(frameSeconds: number): void {
    if (phase.value !== GP.BALLS_MOVING) {
      physicsAccumulator = 0
      return
    }

    // 切到后台再回来时 frameSeconds 可能很大，限制单帧最多推进 0.1 秒
    physicsAccumulator += Math.min(frameSeconds, 0.1)
    while (physicsAccumulator >= PHYSICS_DT && phase.value === GP.BALLS_MOVING) {
      physicsAccumulator -= PHYSICS_DT
      stepPhysics()
    }
  }

  function stepPhysics(): void {
    physicsWorld.step()

    // 追踪白球第一次碰到的球
    if (firstHitBallThisTurn.value === null) {
      for (const event of physicsWorld.collisionEventsThisFrame) {
        const other = event.ball1.isCue ? event.ball2 : event.ball2.isCue ? event.ball1 : null
        if (other) {
          firstHitBallThisTurn.value = other.number
          firstContactSeq = event.seq
          break
        }
      }
    }

    // 追踪碰库：首次碰球之后的任意碰库，以及碰过库的目标球
    for (const event of physicsWorld.cushionEventsThisFrame) {
      if (firstContactSeq !== null && event.seq > firstContactSeq) railAfterContact = true
      if (!event.ball.isCue) railedObjectBalls.add(event.ball.number)
    }

    // 追踪进袋球
    pocketedThisTurn.value.push(...physicsWorld.pocketedBallsThisFrame)
    for (const event of physicsWorld.pocketEventsThisFrame) {
      if (event.ball.isEight) eightBallPocket = event.pocketIndex
    }

    // 所有球停止 → 进入回合结束判定
    if (physicsWorld.allBallsStopped) {
      endTurn()
    }
  }

  /** 回合结束判定 */
  function endTurn(): void {
    if (gameMode.value === 'practice') {
      endPracticeTurn()
      return
    }
    const breakShot = isBreakShot.value
    isBreakShot.value = false

    const shot: ShotInfo = {
      isBreakShot: breakShot,
      railAfterContact,
      objectBallsRailed: railedObjectBalls.size,
      eightBallPocket,
      calledPocket: shotCalledPocket,
    }

    // 计算回合结果
    const result = ruleEngine.evaluateTurn(
      physicsWorld.balls,
      pocketedThisTurn.value,
      firstHitBallThisTurn.value,
      currentPlayer(),
      shot,
    )
    turnResult.value = result

    // 开球打进8号球：重新摆球开球；若同时犯规，改由对手开球
    if (breakShot && result.eightBallPocketed) {
      physicsWorld.balls = createInitialBalls()
      if (result.foul) {
        currentPlayerIndex.value = 1 - currentPlayerIndex.value
      }
      isBreakShot.value = true
      foulMessage.value = `开球打进8号球，重新摆球，由${currentPlayer().name}开球`
      showNotice(foulMessage.value)
      finishTurn(GP.BREAK_SHOT)
      return
    }

    // 球组分配（中式八球：开球后第一个合法进球决定球组）
    // 同一杆进了全色和花色时，按白球首碰的球决定；另一组进的球算帮对手进球，不犯规
    if (!groupsAssigned.value && !breakShot && !result.foul) {
      const groupBalls = pocketedThisTurn.value.filter(b => !b.isCue && !b.isEight)
      const mixed = groupBalls.some(b => b.isSolid) && groupBalls.some(b => b.isStripe)
      const firstHit = physicsWorld.balls.find(b => b.number === firstHitBallThisTurn.value)
      const decider = mixed && firstHit && !firstHit.isEight ? firstHit : groupBalls[0]
      if (decider && ruleEngine.assignGroups(decider, currentPlayer(), otherPlayer(), breakShot)) {
        groupsAssigned.value = true
        const groupName = currentPlayer().group === BG.SOLID ? '全色球' : '花色球'
        showNotice(`${currentPlayer().name} 打${groupName}`)
      }
    }

    // 更新玩家进球数
    ruleEngine.updatePlayerScore(physicsWorld.balls, players.value[0])
    ruleEngine.updatePlayerScore(physicsWorld.balls, players.value[1])

    // 检查胜负
    const winResult = ruleEngine.checkWin(
      physicsWorld.balls, currentPlayer(), otherPlayer(), result, shot
    )
    if (winResult) {
      winner.value = winResult.winner
      winReason.value = winResult.reason
      finishTurn(GP.GAME_OVER)
      return
    }

    // 犯规：换手，对手获得全台自由球
    if (result.foul) {
      if (result.cueBallPocketed) {
        const cueBall = physicsWorld.balls.find(b => b.isCue)
        if (cueBall) {
          cueBall.state = BallState.PLACING
        }
      }
      currentPlayerIndex.value = 1 - currentPlayerIndex.value
      foulMessage.value = `犯规：${result.foulReason}，${currentPlayer().name}获得自由球`
      showNotice(foulMessage.value, 'foul')
      finishTurn(GP.BALL_IN_HAND)
      return
    }

    foulMessage.value = null
    if (ruleEngine.shouldSwitchTurn(result, currentPlayer())) {
      currentPlayerIndex.value = 1 - currentPlayerIndex.value
    }
    finishTurn(GP.AIMING)
  }

  /**
   * 练习模式结算：不判犯规和胜负，白球落袋则自由摆放，目标球全部打完即完成。
   * 8 号球也只是普通目标球
   */
  function endPracticeTurn(): void {
    isBreakShot.value = false
    const objectLeft = physicsWorld.balls.some(b => b.active && !b.isCue)
    if (!objectLeft) {
      winner.value = 0
      winReason.value = `练习完成，共 ${shotCount.value} 杆清台`
      finishTurn(GP.GAME_OVER)
      return
    }
    const cueBall = physicsWorld.balls.find(b => b.isCue)
    if (cueBall && !cueBall.active) {
      cueBall.state = BallState.PLACING
      showNotice('白球落袋，重新摆放白球', 'foul')
      finishTurn(GP.BALL_IN_HAND)
      return
    }
    foulMessage.value = null
    finishTurn(GP.AIMING)
  }

  /** 认输：当前操作方（在线为自己）判负 */
  function resign(): void {
    if (phase.value === GP.GAME_OVER || gameMode.value === 'practice') return
    const loser = gameMode.value === 'online' ? myPlayerIndex.value
      : gameMode.value === 'ai' ? 0
        : currentPlayerIndex.value
    if (gameMode.value === 'online') networkManager?.sendGameMessage({ type: 'resign' })
    winner.value = 1 - loser
    winReason.value = `${players.value[loser].name} 认输`
    phase.value = GP.GAME_OVER
  }

  /** 进入下一阶段并清理本回合数据 */
  function finishTurn(nextPhase: GP): void {
    calledPocket.value = null
    turnCount.value++
    phase.value = nextPhase
    broadcastOnlineState()
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
        rollSpin: { x: ball.rollSpin.x, y: ball.rollSpin.y },
        sideSpin: ball.sideSpin,
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
      ball.rollSpin = snapshotBall.rollSpin ? new Vector2(snapshotBall.rollSpin.x, snapshotBall.rollSpin.y) : Vector2.zero
      ball.sideSpin = snapshotBall.sideSpin ?? 0
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
    isBreakShot.value = snapshot.phase === GP.BREAK_SHOT
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

  /** 白球能否放在该位置（台面内、不在袋口、不与其他球重叠；开球时须在开球线后） */
  function isValidCueBallPosition(position: Vector2): boolean {
    const cueBall = physicsWorld.balls.find(b => b.isCue)
    if (phase.value === GP.BREAK_SHOT && position.x > BREAK_LINE_X) return false
    return physicsWorld.isInsideTable(position)
      && !physicsWorld.isPositionOverlap(position, cueBall)
  }

  /** 指定8号球袋口（仅本组清完、轮到自己瞄准时有效） */
  function callPocket(pocketIndex: number | null): void {
    if (isOnlineMode.value && !isMyTurn()) return
    calledPocket.value = pocketIndex
  }

  /** 当前玩家是否需要先指定袋口才能击球 */
  function needsCalledPocket(): boolean {
    if (gameMode.value === 'practice') return false
    return ruleEngine.needsCalledPocket(physicsWorld.balls, currentPlayer())
  }

  /** 当前玩家可合法首碰的目标球（练习模式下所有球都可打） */
  function targetBalls(): Ball[] {
    if (gameMode.value === 'practice') return physicsWorld.balls.filter(b => b.active && !b.isCue)
    return ruleEngine.getTargetBalls(physicsWorld.balls, currentPlayer())
  }

  /** 本地放置白球 */
  function localPlaceCueBall(position: Vector2): boolean {
    const cueBall = physicsWorld.balls.find(b => b.isCue)
    if (!cueBall) return false
    if (!isValidCueBallPosition(position)) return false

    cueBall.place(position)
    // 开球前在开球区摆放白球不改变阶段
    if (phase.value !== GP.BREAK_SHOT) {
      foulMessage.value = null
      phase.value = GP.AIMING
    }
    return true
  }

  return {
    // 状态
    phase, players, currentPlayerIndex, turnCount,
    groupsAssigned, winner, winReason,
    foulMessage, aimAngle, shotPower, calledPocket, gameMode, notice, shotCount,
    // 在线模式状态
    isOnlineMode, myPlayerIndex, networkStatus,
    opponentDisconnected, rematchRequested, opponentRequestedRematch,
    // 引擎
    physicsWorld, ruleEngine,
    // 方法
    initGame, shoot, update, placeCueBall, isValidCueBallPosition,
    callPocket, needsCalledPocket, targetBalls, resign,
    currentPlayer, otherPlayer,
    firstHitBallThisTurn,
    // 在线模式方法
    initOnlineMode, leaveOnlineMode, isMyTurn,
    requestRematch, acceptRematch,
  }
})
