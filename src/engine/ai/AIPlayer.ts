import { Vector2 } from '../physics/Vector2'
import type { Ball } from '../physics/Ball'
import { Ball as BallEntity } from '../physics/Ball'
import {
  POCKETS, TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, BALL_DIAMETER,
  MAX_SHOT_POWER, PHYSICS_DT, closestPointOnSegment,
} from '../physics/TableSpec'

export type AIDifficulty = 'easy' | 'normal' | 'hard'

/** 电脑的一杆 */
export interface AIShot {
  angle: number
  speed: number
  spinX: number
  spinY: number
  /** 打 8 号球时指定的袋口 */
  calledPocket: number | null
}

export interface AIContext {
  balls: Ball[]
  /** 可合法首碰的目标球 */
  targets: Ball[]
  isBreakShot: boolean
  /** 是否需要指定 8 号球袋口 */
  needsCalledPocket: boolean
}

/** 一条进球线路 */
interface PotLine {
  target: Ball
  pocketIndex: number
  /** 白球应击中的位置（幽灵球球心） */
  ghost: Vector2
  /** 切球角余弦，1 为直球 */
  cutCos: number
  cueDistance: number
  objectDistance: number
  score: number
}

/**
 * 速度—滑行距离表：用真实的台面摩擦模型（滑动 + 滚动两阶段）离线积分得到，
 * 比匀减速公式准确。speedForDistance 反查需要的初速度
 */
let travelTable: { speed: number; distance: number }[] | null = null

function buildTravelTable(): { speed: number; distance: number }[] {
  const table: { speed: number; distance: number }[] = []
  for (let speed = 2; speed <= MAX_SHOT_POWER; speed *= 1.08) {
    const ball = new BallEntity(0, Vector2.zero)
    ball.velocity = new Vector2(speed, 0)
    ball.rollSpin = Vector2.zero
    let distance = 0
    for (let i = 0; i < 120 * 30 && ball.moving; i++) {
      distance += ball.velocity.length * PHYSICS_DT
      ball.applyFriction(PHYSICS_DT)
    }
    table.push({ speed, distance })
  }
  return table
}

/** 球（无旋转、在台面上滑动起步）要滚过 distance 需要的初速度 */
function speedForDistance(distance: number): number {
  travelTable ??= buildTravelTable()
  const entry = travelTable.find(e => e.distance >= distance)
  return entry ? entry.speed : MAX_SHOT_POWER
}

/** 初速度 speed 的球滚过 distance 后剩余的速度（查表近似） */
function speedAfter(speed: number, distance: number): number {
  travelTable ??= buildTravelTable()
  const total = travelTable.find(e => e.speed >= speed)?.distance ?? Infinity
  return speedForDistance(Math.max(total - distance, 0))
}

const DIFFICULTY = {
  easy: { angleNoiseDeg: 1.6, speedNoise: 0.15, minScore: 0 },
  normal: { angleNoiseDeg: 0.7, speedNoise: 0.08, minScore: 0 },
  hard: { angleNoiseDeg: 0.25, speedNoise: 0.04, minScore: 0 },
}

/** 切球角超过此值的线路不考虑（真人也很难打进） */
const MAX_CUT_COS = Math.cos((78 * Math.PI) / 180)

/**
 * 电脑玩家：枚举"目标球 × 袋口"的进球线路，检查白球路径和目标球路径是否被挡，
 * 按切球角和距离打分选最优线路；没有可进的球时轻推最近的目标球防守。
 * 难度只影响出杆误差，不影响选线。
 */
export class AIPlayer {
  constructor(public difficulty: AIDifficulty = 'normal', private random: () => number = Math.random) {}

  /** 计划一杆 */
  planShot(ctx: AIContext): AIShot {
    const cueBall = ctx.balls.find(b => b.isCue && b.active)
    if (!cueBall) return { angle: 0, speed: 0, spinX: 0, spinY: 0, calledPocket: null }

    if (ctx.isBreakShot) return this.planBreak(ctx, cueBall.position)

    const best = this.findPotLines(cueBall.position, ctx)[0]
    if (best) return this.withNoise(this.shotForLine(cueBall.position, best))
    return this.withNoise(this.planSafety(cueBall.position, ctx))
  }

  /** 自由球：在台面上取样，选进球线路得分最高的位置 */
  planPlacement(ctx: AIContext, isValid: (position: Vector2) => boolean): Vector2 {
    let bestPosition: Vector2 | null = null
    let bestScore = -1
    const step = 3
    for (let x = BALL_RADIUS + 1; x < TABLE_WIDTH - BALL_RADIUS; x += step) {
      for (let y = BALL_RADIUS + 1; y < TABLE_HEIGHT - BALL_RADIUS; y += step) {
        const position = new Vector2(x, y)
        if (!isValid(position)) continue
        const line = this.findPotLines(position, ctx)[0]
        const score = line ? line.score : 0
        if (score > bestScore) {
          bestScore = score
          bestPosition = position
        }
      }
    }
    return bestPosition ?? new Vector2(TABLE_WIDTH * 0.25, TABLE_HEIGHT / 2)
  }

  // ==================== 选线 ====================

  private findPotLines(cue: Vector2, ctx: AIContext): PotLine[] {
    const lines: PotLine[] = []
    for (const target of ctx.targets) {
      POCKETS.forEach((pocket, pocketIndex) => {
        // 瞄袋口线中点稍靠里的位置
        const mouthCenter = pocket.mouthA.add(pocket.mouthB).multiply(0.5)
        const aimPoint = mouthCenter.subtract(pocket.inward.multiply(0.6))
        const toPocket = aimPoint.subtract(target.position)
        const objectDistance = toPocket.length
        if (objectDistance < 0.01) return
        const objectDir = toPocket.divide(objectDistance)

        // 中袋入袋角度太斜会被袋角挡住
        if (pocketIndex === 1 || pocketIndex === 4) {
          if (-objectDir.dot(pocket.inward) < Math.cos((55 * Math.PI) / 180)) return
        }

        const ghost = target.position.subtract(objectDir.multiply(BALL_DIAMETER))
        if (!this.insideTable(ghost)) return

        const toGhost = ghost.subtract(cue)
        const cueDistance = toGhost.length
        if (cueDistance < 0.01) return
        const cutCos = toGhost.divide(cueDistance).dot(objectDir)
        if (cutCos < MAX_CUT_COS) return

        if (!this.pathClear(cue, ghost, ctx.balls, [target])) return
        if (!this.pathClear(target.position, aimPoint, ctx.balls, [target])) return

        // 直球、近距离得分高
        const score = cutCos * cutCos / (1 + cueDistance / 60 + objectDistance / 40)
        lines.push({ target, pocketIndex, ghost, cutCos, cueDistance, objectDistance, score })
      })
    }
    return lines.sort((a, b) => b.score - a.score)
  }

  /** 从 from 到 to 的路径上，球心到其他球心距离都大于一个直径 */
  private pathClear(from: Vector2, to: Vector2, balls: Ball[], ignore: Ball[]): boolean {
    return balls.every(ball => {
      if (!ball.active || ball.isCue || ignore.includes(ball)) return true
      return closestPointOnSegment(ball.position, from, to).distFrom(ball.position) >= BALL_DIAMETER - 0.05
    })
  }

  private insideTable(p: Vector2): boolean {
    return p.x > BALL_RADIUS && p.x < TABLE_WIDTH - BALL_RADIUS
      && p.y > BALL_RADIUS && p.y < TABLE_HEIGHT - BALL_RADIUS
  }

  // ==================== 出杆 ====================

  private shotForLine(cue: Vector2, line: PotLine): AIShot {
    // 目标球需要滚到袋口再多一点 → 白球碰撞时的速度（切球只传递 cos 分量）→ 反推出杆速度
    const objectSpeed = speedForDistance(line.objectDistance + 25)
    const contactSpeed = objectSpeed / Math.max(line.cutCos, 0.35) / 0.95
    let speed = contactSpeed
    // 迭代找出杆速度：滚过 cueDistance 后剩余速度不小于 contactSpeed
    for (let i = 0; i < 40 && speedAfter(speed, line.cueDistance) < contactSpeed; i++) speed *= 1.1
    return {
      angle: line.ghost.subtract(cue).angle,
      speed: Math.min(speed, MAX_SHOT_POWER * 0.6),
      // 接近直球时加一点低杆，避免白球跟进袋口
      spinX: 0,
      spinY: line.cutCos > 0.97 ? -0.3 : 0,
      calledPocket: line.target.isEight ? line.pocketIndex : null,
    }
  }

  private planBreak(ctx: AIContext, cue: Vector2): AIShot {
    // 瞄球堆顶球（x 最小的目标球）
    const objects = ctx.balls.filter(b => b.active && !b.isCue)
    const apex = objects.reduce((a, b) => (b.position.x < a.position.x ? b : a), objects[0])
    return this.withNoise({
      angle: apex.position.subtract(cue).angle,
      speed: MAX_SHOT_POWER * 0.92,
      spinX: 0,
      spinY: 0,
      calledPocket: null,
    })
  }

  /**
   * 没有可进的球：防守杆。优先选白球路径通畅、且被撞后沿撞击方向能直通库边的目标球，
   * 力度保证目标球碰库（避免"无球碰库"犯规）；都不满足时加大力度硬推最近的球
   */
  private planSafety(cue: Vector2, ctx: AIContext): AIShot {
    const candidates = ctx.targets
      .filter(t => this.pathClear(cue, t.position, ctx.balls, [t]))
      .map(t => {
        const dir = t.position.subtract(cue).normalized
        const railPoint = this.railHit(t.position, dir)
        const clear = this.pathClear(t.position, railPoint, ctx.balls, [t])
        return { target: t, dir, railDistance: t.position.distFrom(railPoint), clear, distance: t.position.distFrom(cue) }
      })
      .sort((a, b) => Number(b.clear) - Number(a.clear) || a.distance + a.railDistance - (b.distance + b.railDistance))

    const pick = candidates[0]
    const target = pick?.target ?? ctx.targets[0]
    const distance = target ? target.position.distFrom(cue) : 10
    // 正碰传递几乎全部速度：目标球要滚到库边再多一点
    const objectSpeed = speedForDistance((pick?.railDistance ?? 40) + 15) * (pick?.clear ? 1 : 1.8)
    let speed = objectSpeed / 0.95
    for (let i = 0; i < 40 && speedAfter(speed, distance) < objectSpeed / 0.95; i++) speed *= 1.1
    return {
      angle: target ? target.position.subtract(cue).angle : 0,
      speed: Math.min(speed, MAX_SHOT_POWER * 0.7),
      spinX: 0,
      spinY: 0,
      calledPocket: ctx.needsCalledPocket && target ? this.nearestPocket(target.position) : null,
    }
  }

  /** 从 from 沿 dir 到库边（球心可达边界）的交点 */
  private railHit(from: Vector2, dir: Vector2): Vector2 {
    const tx = dir.x > 0 ? (TABLE_WIDTH - BALL_RADIUS - from.x) / dir.x : dir.x < 0 ? (BALL_RADIUS - from.x) / dir.x : Infinity
    const ty = dir.y > 0 ? (TABLE_HEIGHT - BALL_RADIUS - from.y) / dir.y : dir.y < 0 ? (BALL_RADIUS - from.y) / dir.y : Infinity
    return from.add(dir.multiply(Math.max(0, Math.min(tx, ty))))
  }

  private nearestPocket(position: Vector2): number {
    let nearest = 0
    POCKETS.forEach((pocket, i) => {
      if (pocket.holeCenter.distFrom(position) < POCKETS[nearest].holeCenter.distFrom(position)) nearest = i
    })
    return nearest
  }

  private withNoise(shot: AIShot): AIShot {
    const config = DIFFICULTY[this.difficulty]
    return {
      ...shot,
      angle: shot.angle + this.gaussian() * (config.angleNoiseDeg * Math.PI) / 180,
      speed: shot.speed * (1 + this.gaussian() * config.speedNoise),
    }
  }

  private gaussian(): number {
    const u = Math.max(this.random(), 1e-9)
    const v = this.random()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}
