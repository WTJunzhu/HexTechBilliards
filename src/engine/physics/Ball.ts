import { Vector2 } from './Vector2'
import { BALL_RADIUS, FRICTION, MIN_VELOCITY, BallColor, isSolidBall, isStripeBall, isEightBall, isCueBall } from './TableSpec'

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

  /** 速度（游戏坐标/帧） */
  public velocity: Vector2

  /** 球状态 */
  public state: BallState

  /** 半径 */
  public readonly radius: number = BALL_RADIUS

  constructor(number: number, position: Vector2) {
    this.number = number
    this.position = position.clone()
    this.velocity = Vector2.zero
    this.state = BallState.ACTIVE
  }

  /** 是否可见（在台面上） */
  get active(): boolean {
    return this.state === BallState.ACTIVE
  }

  /** 是否运动中 */
  get moving(): boolean {
    return this.active && this.velocity.length > MIN_VELOCITY
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

  /** 击球 */
  shoot(power: number, angle: number): void {
    this.velocity = Vector2.fromAngle(angle, power)
  }

  /** 更新位置（物理步进） */
  update(): void {
    if (!this.active || !this.moving) return

    // 位置更新
    this.position = this.position.add(this.velocity)

    // 摩擦衰减
    this.velocity = this.velocity.multiply(FRICTION)

    // 停止判定
    if (this.velocity.length < MIN_VELOCITY) {
      this.velocity = Vector2.zero
    }
  }

  /** 进袋 */
  pocket(): void {
    this.state = BallState.POCKETED
    this.velocity = Vector2.zero
  }

  /** 重新放置（犯规后自由球） */
  place(position: Vector2): void {
    this.position = position.clone()
    this.velocity = Vector2.zero
    this.state = BallState.ACTIVE
  }

  /** 重置 */
  reset(position: Vector2): void {
    this.position = position.clone()
    this.velocity = Vector2.zero
    this.state = BallState.ACTIVE
  }
}
