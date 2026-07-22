import { Vector2 } from './Vector2'
import type { Ball } from './Ball'

/**
 * 力场接口 - 海克斯物理扩展的Hook点
 *
 * ForceField允许海克斯效果在物理世界中施加额外力
 * 例如：引力井、加速带、桌面倾斜等
 */
export interface ForceField {
  /** 力场唯一ID */
  id: string

  /** 计算力场对某球在某位置施加的力 */
  getForce(ball: Ball): Vector2

  /** 力场是否仍然生效 */
  isActive(): boolean

  /** 力场剩余持续回合 */
  remainingTurns: number

  /** 减少持续回合 */
  decrementTurn(): void
}

/**
 * 基础力场实现
 */
export abstract class BaseForceField implements ForceField {
  public id: string
  public remainingTurns: number

  constructor(id: string, remainingTurns: number) {
    this.id = id
    this.remainingTurns = remainingTurns
  }

  abstract getForce(ball: Ball): Vector2

  isActive(): boolean {
    return this.remainingTurns > 0
  }

  decrementTurn(): void {
    if (this.remainingTurns > 0) {
      this.remainingTurns--
    }
  }
}

/**
 * 引力井 - 将球吸引向某个点
 */
export class GravityWell extends BaseForceField {
  constructor(
    id: string,
    public center: Vector2,
    public strength: number,
    remainingTurns: number,
  ) {
    super(id, remainingTurns)
  }

  getForce(ball: Ball): Vector2 {
    const direction = this.center.subtract(ball.position)
    const distance = direction.length
    if (distance < 0.5) return Vector2.zero // 避免过近时力过大
    const force = this.strength / Math.max(distance, 1)
    return direction.normalized.multiply(force)
  }
}

/**
 * 加速带 - 在某个区域内给球加速
 */
export class AccelerationZone extends BaseForceField {
  constructor(
    id: string,
    public center: Vector2,
    public radius: number,
    public acceleration: Vector2,
    remainingTurns: number,
  ) {
    super(id, remainingTurns)
  }

  getForce(ball: Ball): Vector2 {
    if (ball.position.distFrom(this.center) <= this.radius) {
      return this.acceleration
    }
    return Vector2.zero
  }
}

/**
 * 倾斜桌面 - 全局侧向力
 */
export class TableTilt extends BaseForceField {
  constructor(
    id: string,
    public tiltForce: Vector2,
    remainingTurns: number,
  ) {
    super(id, remainingTurns)
  }

  getForce(ball: Ball): Vector2 {
    return this.tiltForce
  }
}
