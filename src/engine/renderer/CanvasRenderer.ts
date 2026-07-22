/**
 * Canvas渲染器 - 在Canvas 2D上绘制球桌、球、球杆和特效
 *
 * 支持两种模式：
 * 1. H5标准Canvas模式（直接使用HTMLCanvasElement）
 * 2. uni-app Canvas模式（通过uni.createCanvasContext）
 */
import { Vector2 } from '../physics/Vector2'
import type { Ball } from '../physics/Ball'
import {
  TABLE_WIDTH, TABLE_HEIGHT, CUSHION_WIDTH,
  POCKET_POSITIONS, CORNER_POCKET_RADIUS, SIDE_POCKET_RADIUS,
  BALL_RADIUS, BallColor, RENDER_SCALE, updateRenderScale,
} from '../physics/TableSpec'
import type { PhysicsWorld } from '../physics/PhysicsWorld'
import type { ForceField } from '../physics/ForceField'

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D | null = null
  private canvasWidth: number = 0
  private canvasHeight: number = 0
  private scale: number = RENDER_SCALE
  private forceFields: ForceField[] = []

  /** 瞄准线 */
  public aimLine: { start: Vector2; end: Vector2 } | null = null

  /** 球杆信息 */
  public cueStick: { position: Vector2; angle: number; power: number; visible: boolean } = {
    position: Vector2.zero,
    angle: 0,
    power: 0,
    visible: false,
  }

  /**
   * 使用标准 CanvasRenderingContext2D 初始化
   */
  init(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.ctx = ctx
    this.canvasWidth = width
    this.canvasHeight = height

    // 根据canvas尺寸计算缩放
    const totalWidth = TABLE_WIDTH + CUSHION_WIDTH * 2
    this.scale = width / totalWidth
  }

  setForceFields(fields: ForceField[]): void {
    this.forceFields = fields
  }

  /** 游戏坐标 → Canvas像素 */
  toPixel(pos: Vector2): Vector2 {
    return new Vector2(
      (pos.x + CUSHION_WIDTH) * this.scale,
      (pos.y + CUSHION_WIDTH) * this.scale,
    )
  }

  /** Canvas像素 → 游戏坐标 */
  toGame(pixel: Vector2): Vector2 {
    return new Vector2(
      pixel.x / this.scale - CUSHION_WIDTH,
      pixel.y / this.scale - CUSHION_WIDTH,
    )
  }

  private _firstFrame = true

  /** 完整渲染一帧 */
  render(world: PhysicsWorld): void {
    const ctx = this.ctx
    if (!ctx) return

    // 清空画布
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)

    // 绘制球桌
    this.drawTable(ctx)

    // 绘制力场特效（海克斯效果视觉）
    this.drawForceFields(ctx)

    // 绘制瞄准线
    this.drawAimLine(ctx)

    // 绘制球
    for (const ball of world.balls) {
      if (ball.active) {
        this.drawBall(ctx, ball)
      }
    }

    if (this._firstFrame) {
      console.log('[Renderer] Initialized successfully')
      this._firstFrame = false
    }

    // 绘制球杆
    if (this.cueStick.visible) {
      this.drawCueStick(ctx)
    }
  }

  // ==================== 球桌绘制 ====================

  private drawTable(ctx: CanvasRenderingContext2D): void {
    const totalWidth = (TABLE_WIDTH + CUSHION_WIDTH * 2) * this.scale
    const totalHeight = (TABLE_HEIGHT + CUSHION_WIDTH * 2) * this.scale

    // 外框（深色木纹）
    ctx.fillStyle = '#3E2723'
    ctx.fillRect(0, 0, totalWidth, totalHeight)

    // 库边（稍浅的木色）
    const cushionInset = CUSHION_WIDTH * this.scale * 0.1
    ctx.fillStyle = '#5D4037'
    ctx.fillRect(
      cushionInset, cushionInset,
      totalWidth - cushionInset * 2,
      totalHeight - cushionInset * 2,
    )

    // 台面（绿色）
    const tableX = CUSHION_WIDTH * this.scale
    const tableY = CUSHION_WIDTH * this.scale
    const tableW = TABLE_WIDTH * this.scale
    const tableH = TABLE_HEIGHT * this.scale
    ctx.fillStyle = '#1B5E20'
    ctx.fillRect(tableX, tableY, tableW, tableH)

    // 台面细微纹理
    ctx.fillStyle = 'rgba(0,0,0,0.05)'
    for (let i = 0; i < tableW; i += this.scale * 4) {
      ctx.fillRect(tableX + i, tableY, 1, tableH)
    }

    // 袋口
    for (let i = 0; i < POCKET_POSITIONS.length; i++) {
      const pocketPos = this.toPixel(POCKET_POSITIONS[i])
      const radius = (i === 1 || i === 4 ? SIDE_POCKET_RADIUS : CORNER_POCKET_RADIUS) * this.scale
      ctx.beginPath()
      ctx.arc(pocketPos.x, pocketPos.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = '#0D0D0D'
      ctx.fill()

      // 袋口圆角装饰
      ctx.beginPath()
      ctx.arc(pocketPos.x, pocketPos.y, radius + this.scale * 0.5, 0, Math.PI * 2)
      ctx.strokeStyle = '#2C1810'
      ctx.lineWidth = this.scale * 0.3
      ctx.stroke()
    }

    // 开球线（中式八球：距顶边1/4处画一条线）
    const breakLineY = tableY + TABLE_HEIGHT * this.scale * 0.25
    ctx.beginPath()
    ctx.moveTo(tableX, breakLineY)
    ctx.lineTo(tableX + tableW, breakLineY)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.stroke()

    // 中心点
    const centerX = tableX + tableW / 2
    const centerY = tableY + tableH / 2
    ctx.beginPath()
    ctx.arc(centerX, centerY, this.scale * 0.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fill()
  }

  // ==================== 球绘制 ====================

  private drawBall(ctx: CanvasRenderingContext2D, ball: Ball): void {
    const pos = this.toPixel(ball.position)
    const radius = ball.radius * this.scale

    // 球阴影
    ctx.beginPath()
    ctx.arc(pos.x, pos.y + this.scale * 0.2, radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()

    // 球体
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)

    if (ball.isStripe) {
      // 花色球：白底 + 彩色条纹
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      // 条纹
      ctx.save()
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = ball.color
      ctx.fillRect(
        pos.x - radius,
        pos.y - radius * 0.45,
        radius * 2,
        radius * 0.9,
      )
      ctx.restore()
    } else {
      // 全色球 & 白球 & 8号球
      ctx.fillStyle = ball.color
      ctx.fill()
    }

    // 球上数字
    if (ball.number > 0) {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()

      ctx.fillStyle = '#000000'
      ctx.font = `bold ${Math.max(radius * 0.65, 8)}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ball.number.toString(), pos.x, pos.y)
    }

    // 高光
    ctx.beginPath()
    ctx.arc(pos.x - radius * 0.25, pos.y - radius * 0.25, radius * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fill()
  }

  // ==================== 瞄准线绘制 ====================

  private drawAimLine(ctx: CanvasRenderingContext2D): void {
    if (!this.aimLine) return

    const start = this.toPixel(this.aimLine.start)
    const end = this.toPixel(this.aimLine.end)

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 5])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // ==================== 球杆绘制 ====================

  private drawCueStick(ctx: CanvasRenderingContext2D): void {
    const cuePos = this.toPixel(this.cueStick.position)
    const angle = this.cueStick.angle
    const power = this.cueStick.power
    const pullBack = power * this.scale * 0.5

    const cueLength = 25 * this.scale
    const cueWidth = 1.5 * this.scale

    // 球杆拉杆偏移
    const offsetX = Math.cos(angle + Math.PI) * (pullBack + BALL_RADIUS * this.scale + 2)
    const offsetY = Math.sin(angle + Math.PI) * (pullBack + BALL_RADIUS * this.scale + 2)

    ctx.save()
    ctx.translate(cuePos.x + offsetX, cuePos.y + offsetY)
    ctx.rotate(angle)

    // 球杆主体
    const gradient = ctx.createLinearGradient(0, 0, cueLength, 0)
    gradient.addColorStop(0, '#4E342E')
    gradient.addColorStop(0.1, '#FFE0B2')
    gradient.addColorStop(0.3, '#EFEBE9')
    gradient.addColorStop(1, '#5D4037')

    ctx.beginPath()
    ctx.moveTo(0, -cueWidth / 6)
    ctx.lineTo(cueLength, -cueWidth / 2)
    ctx.lineTo(cueLength, cueWidth / 2)
    ctx.lineTo(0, cueWidth / 6)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 0.5
    ctx.stroke()

    ctx.restore()
  }

  // ==================== 力场特效绘制 ====================

  private drawForceFields(ctx: CanvasRenderingContext2D): void {
    // 海克斯力场视觉占位，后续实现
  }
}
