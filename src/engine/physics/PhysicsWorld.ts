import type { Vector2 } from './Vector2'
import type { Ball } from './Ball'
import {
  TABLE_WIDTH, TABLE_HEIGHT,
  CORNER_POCKET_RADIUS, SIDE_POCKET_RADIUS,
  POCKET_POSITIONS, COLLISION_LOSS, CUSHION_LOSS, BALL_DIAMETER, BALL_RADIUS,
  MIN_VELOCITY, CORNER_MOUTH_HALF_WIDTH, SIDE_MOUTH_HALF_WIDTH,
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
 * 1. 子步进（sub-stepping）：每帧执行多次物理步进，防止隧道效应
 * 2. 正确的执行顺序：位置更新 → 碰撞检测/响应，不再跳过静止球
 * 3. 碰撞后速度立即生效，下一子步进即会移动被碰撞的球
 * 4. 每帧仅末尾应用一次摩擦衰减（而非每子步进都衰减，避免过度减速）
 *
 * 2D弹性碰撞原理：
 * - 等质量弹性碰撞：法线方向速度交换，切线方向速度不变
 * - 碰撞后分离（MTD修正）防止粘连
 */
export class PhysicsWorld {
  public balls: Ball[] = []

  /** 子步进次数（每帧物理细分，防止隧道效应） */
  private static readonly SUB_STEPS = 4

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

  /** 物理步进 - 每帧调用一次 */
  step(): void {
    this.pocketedBallsThisFrame = []
    this.collisionEventsThisFrame = []

    const subSteps = PhysicsWorld.SUB_STEPS
    const dt = 1 / subSteps

    for (let s = 0; s < subSteps; s++) {
      // 1. 更新位置（所有活跃球，不论是否 moving）
      for (const ball of this.balls) {
        ball.updatePosition(dt)
      }

      // 2. 检测进袋
      this.handlePockets()

      // 3. 检测球-球碰撞（含连锁碰撞）
      this.handleBallCollisions()

      // 4. 检测库边碰撞
      this.handleCushionCollisions()
    }

    // 5. 每帧末尾统一应用摩擦衰减（而非每子步进都衰减）
    for (const ball of this.balls) {
      ball.applyFriction()
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

      for (let i = 0; i < POCKET_POSITIONS.length; i++) {
        const pocketPos = POCKET_POSITIONS[i]
        const pocketRadius = i === 1 || i === 4 // 中袋
          ? SIDE_POCKET_RADIUS
          : CORNER_POCKET_RADIUS

        if (ball.position.distFrom(pocketPos) <= pocketRadius) {
          ball.pocket()
          this.pocketedBallsThisFrame.push(ball)

          // 触发口袋Hook
          for (const hook of this.pocketHooks) {
            hook(ball, i)
          }
          break
        }
      }
    }
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
    const mtd = diff.multiply((BALL_DIAMETER - dist) / dist)
    ball1.position = ball1.position.add(mtd.multiply(0.5))
    ball2.position = ball2.position.subtract(mtd.multiply(0.5))

    // 法线方向（从ball2指向ball1）
    const normal = diff.normalized
    // 切线方向
    const tangent = normal.perpendicular

    // 速度在法线和切线方向上的投影
    const v1n = normal.dot(ball1.velocity)
    const v1t = tangent.dot(ball1.velocity)
    const v2n = normal.dot(ball2.velocity)
    const v2t = tangent.dot(ball2.velocity)

    // 等质量弹性碰撞：法线方向速度交换，切线方向速度不变
    const newV1n = v2n
    const newV1t = v1t
    const newV2n = v1n
    const newV2t = v2t

    // 重建速度向量
    ball1.velocity = normal.multiply(newV1n).add(tangent.multiply(newV1t))
    ball2.velocity = normal.multiply(newV2n).add(tangent.multiply(newV2t))

    // 碰撞能量损失
    ball1.velocity = ball1.velocity.multiply(1 - COLLISION_LOSS)
    ball2.velocity = ball2.velocity.multiply(1 - COLLISION_LOSS)

    // 记录碰撞事件（去重：同一对球每帧只记录一次）
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

    // 上库边
    if (ball.position.y - ball.radius < 0) {
      // 袋口豁口内不反弹，让球滚入袋口
      if (!this.isInCushionGap(ball.position.x, 'top')) {
        ball.position.y = ball.radius
        ball.velocity.y = -ball.velocity.y
        collided = true
      }
    }

    // 下库边
    if (ball.position.y + ball.radius > TABLE_HEIGHT) {
      if (!this.isInCushionGap(ball.position.x, 'bottom')) {
        ball.position.y = TABLE_HEIGHT - ball.radius
        ball.velocity.y = -ball.velocity.y
        collided = true
      }
    }

    // 左库边
    if (ball.position.x - ball.radius < 0) {
      if (!this.isInCushionGap(ball.position.y, 'left')) {
        ball.position.x = ball.radius
        ball.velocity.x = -ball.velocity.x
        collided = true
      }
    }

    // 右库边
    if (ball.position.x + ball.radius > TABLE_WIDTH) {
      if (!this.isInCushionGap(ball.position.y, 'right')) {
        ball.position.x = TABLE_WIDTH - ball.radius
        ball.velocity.x = -ball.velocity.x
        collided = true
      }
    }

    if (collided) {
      // 库边碰撞能量损失
      ball.velocity = ball.velocity.multiply(1 - CUSHION_LOSS)

      // 触发库边Hook
      for (const hook of this.cushionHooks) {
        hook(ball)
      }
    }
  }

  /**
   * 判断球在与某条库边垂直方向上的坐标是否落在袋口豁口内
   * @param perpendicularCoord 球在与库边垂直方向上的坐标
   *   - top/bottom 库边：传入 ball.position.x
   *   - left/right 库边：传入 ball.position.y
   * @param side 哪条库边
   * @returns true 表示该位置在豁口内，库边应放行（不反弹）
   */
  private isInCushionGap(perpendicularCoord: number, side: 'top' | 'bottom' | 'left' | 'right'): boolean {
    if (side === 'top' || side === 'bottom') {
      // 长边库边：左角袋 + 中袋 + 右角袋 三个豁口
      if (perpendicularCoord < CORNER_MOUTH_HALF_WIDTH) return true
      if (perpendicularCoord > TABLE_WIDTH - CORNER_MOUTH_HALF_WIDTH) return true
      if (Math.abs(perpendicularCoord - TABLE_WIDTH / 2) < SIDE_MOUTH_HALF_WIDTH) return true
    } else {
      // 短边库边（左/右）：仅两端角袋豁口，无中袋
      if (perpendicularCoord < CORNER_MOUTH_HALF_WIDTH) return true
      if (perpendicularCoord > TABLE_HEIGHT - CORNER_MOUTH_HALF_WIDTH) return true
    }
    return false
  }

  // ==================== 工具方法 ====================

  isInsideTable(position: Vector2): boolean {
    return (
      position.x - BALL_RADIUS >= 0 &&
      position.x + BALL_RADIUS <= TABLE_WIDTH &&
      position.y - BALL_RADIUS >= 0 &&
      position.y + BALL_RADIUS <= TABLE_HEIGHT
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

  /** 检查位置是否在袋口内（防止放在袋口上） */
  isInsideAnyPocket(position: Vector2): boolean {
    return POCKET_POSITIONS.some((pocketPos, i) => {
      const radius = i === 1 || i === 4 ? SIDE_POCKET_RADIUS : CORNER_POCKET_RADIUS
      return position.distFrom(pocketPos) <= radius
    })
  }
}
