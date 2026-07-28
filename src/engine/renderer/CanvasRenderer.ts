/**
 * Canvas渲染器 - 在Canvas 2D上绘制球桌、球、球杆和特效
 *
 * 支持两种模式：
 * 1. H5标准Canvas模式（直接使用HTMLCanvasElement）
 * 2. uni-app Canvas模式（通过uni.createCanvasContext）
 *
 * 球桌居中绘制：在 canvas 中留出四周 margin，球桌居中显示
 * 坐标转换：toPixel/toGame 均考虑 tableOffsetX/Y 偏移
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

export type SpinType = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D | null = null
  private canvasWidth: number = 0
  private canvasHeight: number = 0
  private scale: number = RENDER_SCALE
  private forceFields: ForceField[] = []

  /** 球桌在 canvas 中的偏移（居中留白） */
  private tableOffsetX: number = 0
  private tableOffsetY: number = 0

  /** 瞄准线 */
  public aimLine: { start: Vector2; end: Vector2 } | null = null

  /** 球杆信息 */
  public cueStick: { position: Vector2; angle: number; power: number; visible: boolean; shooting: boolean; shootProgress: number } = {
    position: Vector2.zero,
    angle: 0,
    power: 0,
    visible: false,
    shooting: false,
    shootProgress: 0,
  }

  /** 击球部位 */
  public spinType: SpinType = 'center'

  /**
   * 使用标准 CanvasRenderingContext2D 初始化
   */
  init(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.ctx = ctx
    this.canvasWidth = width
    this.canvasHeight = height

    // 计算球桌总尺寸（含库边）
    const totalWidth = TABLE_WIDTH + CUSHION_WIDTH * 2
    const totalHeight = TABLE_HEIGHT + CUSHION_WIDTH * 2

    // 计算缩放：让球桌完整显示在 canvas 中，不留多余 margin
    // 分别按宽度和高度计算，取较小值确保不溢出
    const scaleByWidth = width / totalWidth
    const scaleByHeight = height / totalHeight
    this.scale = Math.min(scaleByWidth, scaleByHeight) * 0.98 // 留 2% 呼吸边距

    // 计算球桌在 canvas 中的偏移（居中）
    const renderedWidth = totalWidth * this.scale
    const renderedHeight = totalHeight * this.scale
    this.tableOffsetX = (width - renderedWidth) / 2
    this.tableOffsetY = (height - renderedHeight) / 2
  }

  setForceFields(fields: ForceField[]): void {
    this.forceFields = fields
  }

  /** 游戏坐标 → Canvas像素 */
  toPixel(pos: Vector2): Vector2 {
    return new Vector2(
      (pos.x + CUSHION_WIDTH) * this.scale + this.tableOffsetX,
      (pos.y + CUSHION_WIDTH) * this.scale + this.tableOffsetY,
    )
  }

  /** Canvas像素 → 游戏坐标 */
  toGame(pixel: Vector2): Vector2 {
    return new Vector2(
      (pixel.x - this.tableOffsetX) / this.scale - CUSHION_WIDTH,
      (pixel.y - this.tableOffsetY) / this.scale - CUSHION_WIDTH,
    )
  }

  private _firstFrame = true

  /** 开始击球动画 */
  startShootAnimation(): void {
    this.cueStick.shooting = true
    this.cueStick.shootProgress = 0
  }

  /** 完整渲染一帧 */
  render(world: PhysicsWorld): void {
    const ctx = this.ctx
    if (!ctx) return

    // 清空画布
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)

    // 绘制背景（球桌周围的深色区域）
    ctx.fillStyle = '#0a0a14'
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight)

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

    // 更新击球动画进度
    if (this.cueStick.shooting) {
      this.cueStick.shootProgress += 0.12 // 约 8 帧完成
      if (this.cueStick.shootProgress >= 1) {
        this.cueStick.shooting = false
        this.cueStick.shootProgress = 0
        this.cueStick.visible = false
      }
    }
  }

  // ==================== 球桌绘制 ====================

  private drawTable(ctx: CanvasRenderingContext2D): void {
    const totalWidth = (TABLE_WIDTH + CUSHION_WIDTH * 2) * this.scale
    const totalHeight = (TABLE_HEIGHT + CUSHION_WIDTH * 2) * this.scale

    const ox = this.tableOffsetX
    const oy = this.tableOffsetY

    // 外框（深色木纹）
    ctx.fillStyle = '#3E2723'
    ctx.fillRect(ox, oy, totalWidth, totalHeight)

    // 库边（稍浅的木色）
    const cushionInset = CUSHION_WIDTH * this.scale * 0.1
    ctx.fillStyle = '#5D4037'
    ctx.fillRect(
      ox + cushionInset, oy + cushionInset,
      totalWidth - cushionInset * 2,
      totalHeight - cushionInset * 2,
    )

    // 台面（绿色）
    const tableX = ox + CUSHION_WIDTH * this.scale
    const tableY = oy + CUSHION_WIDTH * this.scale
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
    const isShooting = this.cueStick.shooting
    const shootProgress = this.cueStick.shootProgress

    const cueLength = 25 * this.scale
    const cueWidth = 1.5 * this.scale

    // 基础间距：球杆尖端到球表面的距离（像素）
    // 这个值确保杆头始终在白球外部，清晰可见
    const baseGap = BALL_RADIUS * this.scale * 1.5
    // 蓄力拉杆距离：力度越大，球杆越远离球
    const pullBackDist = power * this.scale * 4

    // 击球动画：球杆冲向球
    let animOffset = 0
    if (isShooting) {
      // 动画：从当前位置（远离球）冲到球表面附近
      if (shootProgress < 0.5) {
        // 前半段：向后拉杆（拉得更远，蓄力感）
        const t = shootProgress / 0.5
        animOffset = pullBackDist * t * 0.5 // 向后多拉一点
      } else {
        // 后半段：快速前冲到球附近
        const t = (shootProgress - 0.5) / 0.5
        animOffset = pullBackDist * 0.5 - (baseGap + pullBackDist * 0.5) * t
      }
    }

    // 球杆尖端（杆头）到白球中心的距离
    // 方向：angle + PI = 白球后方（远离目标方向）
    const tipDistFromCenter = BALL_RADIUS * this.scale + baseGap + pullBackDist + animOffset

    // 球杆放置位置：从白球中心向 angle+PI 方向偏移 tipDistFromCenter
    const offsetX = Math.cos(angle + Math.PI) * tipDistFromCenter
    const offsetY = Math.sin(angle + Math.PI) * tipDistFromCenter

    ctx.save()
    ctx.translate(cuePos.x + offsetX, cuePos.y + offsetY)
    // 关键修复：rotate(angle + PI) 让 x轴正方向指向白球后方
    // 这样 x=0 是杆头（靠近白球），x=cueLength 是杆尾（远离白球）
    ctx.rotate(angle + Math.PI)

    // 球杆主体（从杆头细端到杆尾粗端）
    const gradient = ctx.createLinearGradient(0, 0, cueLength, 0)
    gradient.addColorStop(0, '#3E2723')    // 杆头（细端）- 深棕色皮头
    gradient.addColorStop(0.03, '#FFE0B2') // 皮头白色
    gradient.addColorStop(0.08, '#8D6E63') // 接口铜环
    gradient.addColorStop(0.25, '#D7CCC8') // 前节浅木色
    gradient.addColorStop(0.6, '#A1887F')  // 中段木色
    gradient.addColorStop(0.85, '#5D4037') // 后节深木色
    gradient.addColorStop(1, '#3E2723')    // 杆尾（粗端）- 最深棕色

    ctx.beginPath()
    // 杆头（细端，靠近白球）
    ctx.moveTo(0, -cueWidth / 8)
    ctx.lineTo(cueLength * 0.15, -cueWidth / 6)
    ctx.lineTo(cueLength * 0.3, -cueWidth / 5)
    ctx.lineTo(cueLength * 0.6, -cueWidth / 3)
    // 杆尾（粗端）
    ctx.lineTo(cueLength, -cueWidth / 2)
    ctx.lineTo(cueLength, cueWidth / 2)
    ctx.lineTo(cueLength * 0.6, cueWidth / 3)
    ctx.lineTo(cueLength * 0.3, cueWidth / 5)
    ctx.lineTo(cueLength * 0.15, cueWidth / 6)
    ctx.lineTo(0, cueWidth / 8)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 0.5
    ctx.stroke()

    // 杆头白色皮头标记
    ctx.beginPath()
    ctx.arc(0, 0, cueWidth / 10, 0, Math.PI * 2)
    ctx.fillStyle = '#FFE0B2'
    ctx.fill()

    ctx.restore()
  }

  // ==================== 力场特效绘制 ====================

  private drawForceFields(ctx: CanvasRenderingContext2D): void {
    // 海克斯力场视觉占位，后续实现
  }
}
