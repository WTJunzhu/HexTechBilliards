import { Vector2 } from '../physics/Vector2'
import { shotSpeed } from '../physics/TableSpec'

/**
 * 球杆控制器 - 管理瞄准、蓄力和击球
 *
 * 操作方式（参考常见手机台球游戏）：
 * - 桌面：点击某处 → 瞄准该点；按住拖动 → 绕白球旋转瞄准方向
 * - 微调条：左右拖动做精细角度调整
 * - 力度条：拖动蓄力，松手出杆；拖回起点（力度低于阈值）松手即取消
 */
export class CueController {
  /** 瞄准角度（弧度） */
  public aimAngle: number = 0

  /** 当前力度 (0-1) */
  public power: number = 0

  /** 击球点偏移（-1~1，相对最大塞位）：x 右为正，y 高杆为正 */
  public spinX = 0
  public spinY = 0

  /** 是否正在蓄力 */
  public isPowering = false

  /** 白球位置 */
  public cueBallPosition: Vector2 = Vector2.zero

  /** 力度低于此值松手视为取消 */
  public static readonly MIN_SHOT_POWER = 0.05

  /** 微调条：每像素旋转的弧度（约 0.1°） */
  private static readonly FINE_TUNE_RAD_PER_PX = 0.0018

  /** 移动超过此像素数视为拖动，否则视为点击 */
  private static readonly TAP_SLOP_PX = 6

  /** 桌面拖动状态 */
  private tableDrag: { startPixel: Vector2; lastGame: Vector2; dragging: boolean } | null = null

  /** 回调：击球 */
  public onShoot: ((power: number, angle: number, spinX: number, spinY: number) => void) | null = null

  setCueBallPosition(pos: Vector2): void {
    this.cueBallPosition = pos
  }

  /** 瞄准某个点 */
  aimAt(target: Vector2): void {
    const diff = target.subtract(this.cueBallPosition)
    if (diff.length > 0) this.aimAngle = diff.angle
  }

  /** 旋转瞄准方向 */
  rotate(deltaAngle: number): void {
    this.aimAngle += deltaAngle
  }

  // ==================== 桌面瞄准手势 ====================

  startTableDrag(gamePos: Vector2, pixelPos: Vector2): void {
    this.tableDrag = { startPixel: pixelPos, lastGame: gamePos, dragging: false }
  }

  moveTableDrag(gamePos: Vector2, pixelPos: Vector2): void {
    const drag = this.tableDrag
    if (!drag) return
    if (!drag.dragging && pixelPos.distFrom(drag.startPixel) > CueController.TAP_SLOP_PX) {
      drag.dragging = true
    }
    if (drag.dragging) {
      // 手指绕白球扫过的角度 = 球杆旋转的角度，手指不必压在目标上
      const prev = drag.lastGame.subtract(this.cueBallPosition)
      const curr = gamePos.subtract(this.cueBallPosition)
      if (prev.length > 0.5 && curr.length > 0.5) {
        let delta = curr.angle - prev.angle
        if (delta > Math.PI) delta -= Math.PI * 2
        if (delta < -Math.PI) delta += Math.PI * 2
        this.rotate(delta)
      }
    }
    drag.lastGame = gamePos
  }

  endTableDrag(): void {
    const drag = this.tableDrag
    this.tableDrag = null
    if (drag && !drag.dragging) this.aimAt(drag.lastGame)
  }

  // ==================== 微调 ====================

  fineTune(deltaPixels: number): void {
    this.rotate(deltaPixels * CueController.FINE_TUNE_RAD_PER_PX)
  }

  // ==================== 加塞 ====================

  /** 设置击球点，超出圆形塞位范围时收回到边缘 */
  setSpin(x: number, y: number): void {
    const length = Math.hypot(x, y)
    const scale = length > 1 ? 1 / length : 1
    this.spinX = x * scale
    this.spinY = y * scale
  }

  // ==================== 蓄力 ====================

  startPower(): void {
    this.isPowering = true
    this.power = 0
  }

  setPower(power: number): void {
    if (!this.isPowering) return
    this.power = Math.max(0, Math.min(power, 1))
  }

  /** 松手：力度足够则出杆，否则取消。返回是否出杆 */
  releasePower(): boolean {
    const shot = this.isPowering && this.power >= CueController.MIN_SHOT_POWER
    if (shot) {
      this.onShoot?.(shotSpeed(this.power), this.aimAngle, this.spinX, this.spinY)
    }
    this.cancelPower()
    return shot
  }

  cancelPower(): void {
    this.isPowering = false
    this.power = 0
  }

  /** 中断所有进行中的操作（换手、阶段切换时调用） */
  reset(): void {
    this.tableDrag = null
    this.cancelPower()
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
