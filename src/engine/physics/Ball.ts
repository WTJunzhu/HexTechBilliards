import { Vector2 } from './Vector2'
import {
  BALL_RADIUS, ROLLING_DECEL, LINEAR_DRAG, SLIDING_DECEL, SIDE_SPIN_DECEL, MIN_VELOCITY,
  MAX_TIP_OFFSET, BallColor, isSolidBall, isStripeBall, isEightBall, isCueBall } from './TableSpec'

export enum BallState {
  ACTIVE = 'active',     // 在台面上
  POCKETED = 'pocketed', // 已进袋
  PLACING = 'placing',   // 正在放置（犯规后自由球）
}

export class Ball {
  /** 球号 (0=白球, 1-7=全色, 8=黑球, 9-15=花色) */
  public number: number

  /** 位置（游戏坐标） */
  public position: Vector2

  /** 速度（游戏坐标/秒） */
  public velocity: Vector2

  /**
   * 滚动旋转（绕水平轴），用"纯滚动时对应的速度"表示：rollSpin = R·(ωy, -ωx)
   * rollSpin 与 velocity 相等即纯滚动；不等时球与台呢之间打滑
   * 高杆：rollSpin 比 velocity 更向前；低杆：rollSpin 指向后方
   */
  public rollSpin: Vector2

  /**
   * 侧旋（绕竖直轴），同样乘以半径换算为速度单位：sideSpin = R·ωz
   * 正方向为 x→y 旋转（屏幕上顺时针）。右塞使球俯视逆时针自转，即 sideSpin < 0
   */
  public sideSpin: number

  /** 球状态 */
  public state: BallState

  /** 半径 */
  public readonly radius: number = BALL_RADIUS

  constructor(number: number, position: Vector2) {
    this.number = number
    this.position = position.clone()
    this.velocity = Vector2.zero
    this.rollSpin = Vector2.zero
    this.sideSpin = 0
    this.state = BallState.ACTIVE
  }

  /** 是否可见（在台面上） */
  get active(): boolean {
    return this.state === BallState.ACTIVE
  }

  /** 是否运动中 */
  get moving(): boolean {
    // 原地回旋的球（如低杆打停后正在回拉）也算运动中
    return this.active && (this.velocity.length > MIN_VELOCITY || this.rollSpin.length > MIN_VELOCITY)
  }

  /** 是否为白球 */
  get isCue(): boolean {
    return isCueBall(this.number)
  }

  /** 是否为全色球（1-7） */
  get isSolid(): boolean {
    return isSolidBall(this.number)
  }

  /** 是否为花色球（9-15） */
  get isStripe(): boolean {
    return isStripeBall(this.number)
  }

  /** 是否为8号球 */
  get isEight(): boolean {
    return isEightBall(this.number)
  }

  /** 球颜色 */
  get color(): string {
    if (this.number === 0) return BallColor.WHITE
    const colorMap: Record<number, string> = {
      1: BallColor.SOLID_1, 2: BallColor.SOLID_2, 3: BallColor.SOLID_3,
      4: BallColor.SOLID_4, 5: BallColor.SOLID_5, 6: BallColor.SOLID_6,
      7: BallColor.SOLID_7, 8: BallColor.EIGHT,
      9: BallColor.STRIPE_9, 10: BallColor.STRIPE_10, 11: BallColor.STRIPE_11,
      12: BallColor.STRIPE_12, 13: BallColor.STRIPE_13, 14: BallColor.STRIPE_14,
      15: BallColor.STRIPE_15,
    }
    return colorMap[this.number] || BallColor.WHITE
  }

  /**
   * 击球
   * @param spinX 击球点水平偏移（-1 左 ~ 1 右，相对最大塞位）
   * @param spinY 击球点竖直偏移（-1 低杆 ~ 1 高杆，相对最大塞位）
   *
   * 球杆冲量作用在偏离球心 h 处时，实心球获得 ω = 5·V·h / (2R²)，
   * 换算成速度单位即 2.5·h/R·V；h = 0.4R 时恰好为纯滚动
   */
  shoot(power: number, angle: number, spinX = 0, spinY = 0): void {
    const direction = Vector2.fromAngle(angle)
    this.velocity = direction.multiply(power)
    this.rollSpin = direction.multiply(2.5 * spinY * MAX_TIP_OFFSET * power)
    // 右塞：力矩 r×F 使球逆着 x→y 方向自转
    this.sideSpin = -2.5 * spinX * MAX_TIP_OFFSET * power
  }

  /** 仅更新位置（子步进内部用，不含摩擦和停止判定） */
  updatePosition(dt: number): void {
    if (!this.active) return
    this.position = this.position.add(this.velocity.multiply(dt))
  }

  /**
   * 台面摩擦：分滑动和滚动两个阶段
   *
   * 滑动：接触点相对台呢的滑移 = velocity - rollSpin。滑动摩擦力恒定、方向与滑移相反，
   *   使速度减少 μg·dt，同时使 rollSpin 增加 2.5·μg·dt（实心球 I = 2/5·mR²），
   *   滑移以 3.5·μg 的速率归零，之后进入纯滚动。
   *   低杆打中目标球后速度清零而 rollSpin 仍向后，滑动摩擦便把白球拉回来。
   * 滚动：速度按滚动阻力衰减，rollSpin 跟随速度。
   */
  applyFriction(dt: number): void {
    if (!this.active) return

    const slip = this.velocity.subtract(this.rollSpin)
    const slipSpeed = slip.length
    const slipChange = 3.5 * SLIDING_DECEL * dt

    if (slipSpeed > slipChange) {
      const slipDir = slip.divide(slipSpeed)
      this.velocity = this.velocity.subtract(slipDir.multiply(SLIDING_DECEL * dt))
      this.rollSpin = this.rollSpin.add(slipDir.multiply(2.5 * SLIDING_DECEL * dt))
    } else {
      // 本步内滑移归零：按角动量守恒（相对接触点）得到纯滚动速度
      if (slipSpeed > 0) {
        this.velocity = this.velocity.multiply(5 / 7).add(this.rollSpin.multiply(2 / 7))
      }
      const speed = this.velocity.length
      const newSpeed = speed - (ROLLING_DECEL + LINEAR_DRAG * speed) * dt
      this.velocity = newSpeed < MIN_VELOCITY ? Vector2.zero : this.velocity.multiply(newSpeed / speed)
      this.rollSpin = this.velocity
    }

    // 侧旋在台面上以恒定速率衰减；球停下后侧旋不再影响任何东西
    const sideDecay = SIDE_SPIN_DECEL * dt
    this.sideSpin = Math.abs(this.sideSpin) <= sideDecay ? 0 : this.sideSpin - Math.sign(this.sideSpin) * sideDecay
    if (!this.moving) {
      this.velocity = Vector2.zero
      this.rollSpin = Vector2.zero
      this.sideSpin = 0
    }
  }

  /** 清除运动状态 */
  stop(): void {
    this.velocity = Vector2.zero
    this.rollSpin = Vector2.zero
    this.sideSpin = 0
  }

  /** 进袋 */
  pocket(): void {
    this.state = BallState.POCKETED
    this.stop()
  }

  /** 重新放置（犯规后自由球） */
  place(position: Vector2): void {
    this.position = position.clone()
    this.stop()
    this.state = BallState.ACTIVE
  }

  /** 重置 */
  reset(position: Vector2): void {
    this.position = position.clone()
    this.stop()
    this.state = BallState.ACTIVE
  }
}
