import { Vector2 } from '../physics/Vector2'
import { MAX_SHOT_POWER } from '../physics/TableSpec'

/**
 * 输入适配器 - 统一触摸和鼠标事件
 */
export interface InputEvent {
  type: 'start' | 'move' | 'end'
  position: Vector2  // Canvas像素坐标
}

export type InputHandler = (event: InputEvent) => void

/**
 * 球杆控制器 - 管理瞄准和击球
 */
export class CueController {
  /** 是否正在瞄准 */
  public isAiming = false

  /** 是否正在蓄力 */
  public isPowering = false

  /** 瞄准角度 */
  public aimAngle: number = 0

  /** 击球力度 (0-1) */
  public power: number = 0

  /** 白球位置 */
  public cueBallPosition: Vector2 = Vector2.zero

  /** 触摸起始位置（Canvas像素，用于计算蓄力拖动距离） */
  private touchStartPos: Vector2 | null = null

  /** 拖动多少像素达到满力 */
  private static readonly FULL_POWER_DRAG_PX = 150

  /** 瞄准起始角度 */
  private aimStartAngle: number = 0

  /** 蓄力起始距离 */
  private powerStartDist: number = 0

  /** 回调：击球 */
  public onShoot: ((power: number, angle: number) => void) | null = null

  /** 回调：更新瞄准线 */
  public onUpdateAim: ((angle: number) => void) | null = null

  /** 回调：更新力度 */
  public onUpdatePower: ((power: number) => void) | null = null

  setCueBallPosition(pos: Vector2): void {
    this.cueBallPosition = pos
  }

  /**
   * 开始瞄准
   */
  startAim(touchPos: Vector2, pixelPos: Vector2): void {
    this.isAiming = true
    this.isPowering = false
    this.touchStartPos = pixelPos
    this.power = 0

    // 计算初始瞄准角度（白球 → 触摸点反方向）
    const diff = this.cueBallPosition.subtract(touchPos)
    this.aimAngle = diff.angle
    this.aimStartAngle = this.aimAngle
  }

  /**
   * 瞄准中移动
   */
  moveAim(touchPos: Vector2, pixelPos: Vector2): void {
    if (!this.touchStartPos) return

    if (this.isPowering) {
      // 蓄力模式：根据屏幕上的拖动距离调整力度
      const dist = pixelPos.subtract(this.touchStartPos).length
      this.power = Math.min(dist / CueController.FULL_POWER_DRAG_PX, 1)
      this.onUpdatePower?.(this.power)
    } else if (this.isAiming) {
      // 瞄准模式：根据触摸位置计算角度
      const diff = this.cueBallPosition.subtract(touchPos)
      this.aimAngle = diff.angle
      this.onUpdateAim?.(this.aimAngle)
    }
  }

  /**
   * 切换到蓄力模式（手指远离白球方向时）
   */
  startPower(): void {
    this.isPowering = true
    this.isAiming = false
  }

  /**
   * 释放/击球
   */
  endShot(): void {
    if (this.power > 0.05) {
      const actualPower = this.power * MAX_SHOT_POWER
      this.onShoot?.(actualPower, this.aimAngle)
    }

    // 重置状态
    this.isAiming = false
    this.isPowering = false
    this.touchStartPos = null
    this.power = 0
  }

  /**
   * 计算瞄准线终点
   */
  getAimLineEnd(): Vector2 {
    const lineLength = 30 // 游戏单位
    return this.cueBallPosition.add(
      Vector2.fromAngle(this.aimAngle, lineLength)
    )
  }
}
