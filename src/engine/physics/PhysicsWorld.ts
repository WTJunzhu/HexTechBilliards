import type { Vector2 } from './Vector2'
import type { Ball } from './Ball'
import {
  TABLE_WIDTH, TABLE_HEIGHT, CUSHION_WIDTH,
  POCKETS, CUSHION_SEGMENTS, closestPointOnSegment,
  BALL_RESTITUTION, CUSHION_RESTITUTION, BALL_DIAMETER, BALL_RADIUS,
  PHYSICS_DT, MAX_SUBSTEP_TRAVEL,
} from './TableSpec'

/**
 * 碰撞回调类型（为海克斯系统预留Hook）
 */
export type CollisionHook = (ball1: Ball, ball2: Ball) => void
export type CushionHook = (ball: Ball) => void
export type PocketHook = (ball: Ball, pocketIndex: number) => void

/**
 * 物理世界 - 2D台球物理引擎
 *
 * 核心改进（vs 旧版）：
 * 1. 固定时间步长（PHYSICS_DT），结果与屏幕刷新率无关
 * 2. 自适应子步进：按最快球速细分，防止隧道效应
 * 3. 执行顺序：位置更新 → 进袋 → 碰撞 → 库边 → 摩擦
 * 4. 摩擦为恒定减速 + 线性阻力（见 TableSpec），每个子步按时长积分
 *
 * 碰撞模型：
 * - 球-球：等质量冲量碰撞，只作用于法向且仅在两球相互接近时生效；切向速度不变
 * - 球-库边：库边为线段，端点即袋角；只衰减法向速度（CUSHION_RESTITUTION）
 * - 进袋：球心越过袋口线达到捕获深度即落袋（几何定义见 TableSpec.POCKETS）
 */
export class PhysicsWorld {
  public balls: Ball[] = []

  // 海克斯Hook预留
  private preCollisionHooks: CollisionHook[] = []
  private postCollisionHooks: CollisionHook[] = []
  private cushionHooks: CushionHook[] = []
  private pocketHooks: PocketHook[] = []

  /** 本帧进袋的球 */
  public pocketedBallsThisFrame: Ball[] = []

  /** 本帧碰撞事件 */
  public collisionEventsThisFrame: { ball1: Ball; ball2: Ball }[] = []

  constructor() {}

  /** 添加海克斯碰撞Hook */
  addPreCollisionHook(hook: CollisionHook): void {
    this.preCollisionHooks.push(hook)
  }

  addPostCollisionHook(hook: CollisionHook): void {
    this.postCollisionHooks.push(hook)
  }

  addCushionHook(hook: CushionHook): void {
    this.cushionHooks.push(hook)
  }

  addPocketHook(hook: PocketHook): void {
    this.pocketHooks.push(hook)
  }

  /** 清除所有Hook */
  clearHooks(): void {
    this.preCollisionHooks = []
    this.postCollisionHooks = []
    this.cushionHooks = []
    this.pocketHooks = []
  }

  /** 物理步进 - 每个固定时间步调用一次 */
  step(dt: number = PHYSICS_DT): void {
    this.pocketedBallsThisFrame = []
    this.collisionEventsThisFrame = []

    // 子步数按最快球的位移决定，保证每个子步位移不超过 MAX_SUBSTEP_TRAVEL
    const maxSpeed = Math.max(0, ...this.balls.filter(b => b.active).map(b => b.velocity.length))
    const subSteps = Math.max(1, Math.ceil(maxSpeed * dt / MAX_SUBSTEP_TRAVEL))
    const subDt = dt / subSteps

    for (let s = 0; s < subSteps; s++) {
      // 1. 更新位置（所有活跃球，不论是否 moving）
      for (const ball of this.balls) {
        ball.updatePosition(subDt)
      }

      // 2. 检测进袋
      this.handlePockets()

      // 3. 检测球-球碰撞（含连锁碰撞）
      this.handleBallCollisions()

      // 4. 检测库边碰撞
      this.handleCushionCollisions()

      // 5. 台面摩擦
      for (const ball of this.balls) {
        ball.applyFriction(subDt)
      }
    }
  }

  /** 检测所有球是否停止运动 */
  get allBallsStopped(): boolean {
    return this.balls.every(ball => !ball.moving)
  }

  // ==================== 进袋判定 ====================

  private handlePockets(): void {
    for (const ball of this.balls) {
      if (!ball.active) continue
      const pocketIndex = this.findCapturingPocket(ball.position)
      if (pocketIndex < 0) continue

      ball.pocket()
      this.pocketedBallsThisFrame.push(ball)
      for (const hook of this.pocketHooks) {
        hook(ball, pocketIndex)
      }
    }
  }

  /** 球心所在位置会被哪个袋口捕获，返回袋口索引，-1 表示不会 */
  private findCapturingPocket(position: Vector2): number {
    for (let i = 0; i < POCKETS.length; i++) {
      const pocket = POCKETS[i]
      if (this.depthPastMouth(position, i) > pocket.captureDepth) return i
    }

    // 兜底：球因数值误差越出台面外框，归入最近的袋口，避免球卡在桌外
    const margin = CUSHION_WIDTH
    if (position.x < -margin || position.x > TABLE_WIDTH + margin
      || position.y < -margin || position.y > TABLE_HEIGHT + margin) {
      let nearest = 0
      for (let i = 1; i < POCKETS.length; i++) {
        if (position.distFrom(POCKETS[i].holeCenter) < position.distFrom(POCKETS[nearest].holeCenter)) nearest = i
      }
      return nearest
    }
    return -1
  }

  /** 球心越过某个袋口线的深度（正数表示已越过，在袋口线外侧） */
  private depthPastMouth(position: Vector2, pocketIndex: number): number {
    const pocket = POCKETS[pocketIndex]
    // 只考虑袋口线正对的区域，避免把其他方向的位置误判为越过
    const along = pocket.mouthB.subtract(pocket.mouthA)
    const t = position.subtract(pocket.mouthA).dot(along) / along.lengthSq
    if (t < -0.25 || t > 1.25) return -Infinity
    return -position.subtract(pocket.mouthA).dot(pocket.inward)
  }

  // ==================== 球-球碰撞 ====================

  /**
   * 球-球碰撞检测与响应
   * 使用多次迭代确保连锁碰撞全部处理
   */
  private handleBallCollisions(): void {
    // 最多迭代 3 次确保连锁碰撞（A→B→C）全部处理
    for (let iteration = 0; iteration < 3; iteration++) {
      let anyCollision = false

      for (let i = 0; i < this.balls.length; i++) {
        const ball1 = this.balls[i]
        if (!ball1.active) continue

        for (let j = i + 1; j < this.balls.length; j++) {
          const ball2 = this.balls[j]
          if (!ball2.active) continue

          if (this.resolveBallCollision(ball1, ball2)) {
            anyCollision = true
          }
        }
      }

      // 如果本轮没有任何碰撞，无需继续迭代
      if (!anyCollision) break
    }
  }

  private resolveBallCollision(ball1: Ball, ball2: Ball): boolean {
    const diff = ball1.position.subtract(ball2.position)
    const dist = diff.length

    // 碰撞检测：距离 < 两球直径
    if (dist >= BALL_DIAMETER || dist === 0) return false

    // 触发碰撞前Hook
    for (const hook of this.preCollisionHooks) {
      hook(ball1, ball2)
    }

    // 最小平移距离（MTD）分离重叠
    const normal = diff.normalized // 从 ball2 指向 ball1
    const overlap = BALL_DIAMETER - dist
    ball1.position = ball1.position.add(normal.multiply(overlap / 2))
    ball2.position = ball2.position.subtract(normal.multiply(overlap / 2))

    // 两球正在分离（或相对静止）时只分开、不交换速度，避免球堆抖动
    const approachSpeed = ball1.velocity.subtract(ball2.velocity).dot(normal)
    if (approachSpeed >= 0) return false

    // 等质量冲量碰撞：e=1 时等价于法向速度交换
    const impulse = normal.multiply(-(1 + BALL_RESTITUTION) / 2 * approachSpeed)
    ball1.velocity = ball1.velocity.add(impulse)
    ball2.velocity = ball2.velocity.subtract(impulse)

    // 记录碰撞事件（去重：同一对球每步只记录一次）
    const alreadyRecorded = this.collisionEventsThisFrame.some(
      e => (e.ball1 === ball1 && e.ball2 === ball2) || (e.ball1 === ball2 && e.ball2 === ball1)
    )
    if (!alreadyRecorded) {
      this.collisionEventsThisFrame.push({ ball1, ball2 })
    }

    // 触发碰撞后Hook
    for (const hook of this.postCollisionHooks) {
      hook(ball1, ball2)
    }

    return true
  }

  // ==================== 库边碰撞 ====================

  private handleCushionCollisions(): void {
    for (const ball of this.balls) {
      if (!ball.active) continue

      this.resolveCushionCollision(ball)
    }
  }

  private resolveCushionCollision(ball: Ball): void {
    let collided = false

    for (const segment of CUSHION_SEGMENTS) {
      const closest = closestPointOnSegment(ball.position, segment.a, segment.b)
      const diff = ball.position.subtract(closest)
      const dist = diff.length
      if (dist >= ball.radius || dist === 0) continue

      // 推出库边；线段端点处法向沿径向，即圆弧形袋角
      const normal = diff.divide(dist)
      ball.position = closest.add(normal.multiply(ball.radius))

      const normalSpeed = ball.velocity.dot(normal)
      if (normalSpeed < 0) {
        ball.velocity = ball.velocity.subtract(normal.multiply((1 + CUSHION_RESTITUTION) * normalSpeed))
        collided = true
      }
    }

    if (collided) {
      for (const hook of this.cushionHooks) {
        hook(ball)
      }
    }
  }

  // ==================== 工具方法 ====================

  /** 球放在该位置是否完全在台面内（不压库边，也不越过任何袋口线） */
  isInsideTable(position: Vector2): boolean {
    return (
      position.x - BALL_RADIUS >= 0 &&
      position.x + BALL_RADIUS <= TABLE_WIDTH &&
      position.y - BALL_RADIUS >= 0 &&
      position.y + BALL_RADIUS <= TABLE_HEIGHT &&
      POCKETS.every((_, i) => this.depthPastMouth(position, i) <= -BALL_RADIUS * 0.5)
    )
  }

  /** 检查位置是否与已有球重叠 */
  isPositionOverlap(position: Vector2, excludeBall?: Ball): boolean {
    return this.balls.some(ball => {
      if (!ball.active) return false
      if (excludeBall && ball === excludeBall) return false
      return ball.position.distFrom(position) < BALL_DIAMETER
    })
  }
}
