import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Ball, BallState } from '../engine/physics/Ball'
import { Vector2 } from '../engine/physics/Vector2'
import { PhysicsWorld } from '../engine/physics/PhysicsWorld'
import { RuleEngine } from '../engine/game/RuleEngine'
import { TABLE_WIDTH, TABLE_HEIGHT } from '../engine/physics/TableSpec'
import { GamePhase as GP, BallGroup as BG, type Player as PlayerType, type TurnResult } from '../engine/game/GameState'

/**
 * 中式八球初始球位
 *
 * ⚠️ 中式八球开球摆放：
 * - 8号球在三角形中心
 * - 三角形底边两角必须一全色一花色
 * - 三角形顶球在开球线上
 *
 * 使用缩放后的游戏坐标系：TABLE_WIDTH=24, TABLE_HEIGHT=12
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

  // 当前玩家
  const currentPlayer = () => players.value[currentPlayerIndex.value]
  const otherPlayer = () => players.value[1 - currentPlayerIndex.value]

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
  }

  /** 击球 */
  function shoot(power: number, angle: number): void {
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

    // 清除回合数据
    firstHitBallThisTurn.value = null
    pocketedThisTurn.value = []
  }

  /** 放置自由球 */
  function placeCueBall(position: Vector2): boolean {
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
    // 引擎
    physicsWorld, ruleEngine,
    // 方法
    initGame, shoot, update, placeCueBall,
    currentPlayer, otherPlayer,
    firstHitBallThisTurn,
  }
})
