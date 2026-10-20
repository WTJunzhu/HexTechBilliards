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
  POCKETS, CUSHION_SEGMENTS, BREAK_LINE_X, closestPointOnSegment,
  BALL_RADIUS, BALL_DIAMETER, RENDER_SCALE, updateRenderScale,
} from '../physics/TableSpec'
import type { PhysicsWorld } from '../physics/PhysicsWorld'
import type { ForceField } from '../physics/ForceField'

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D | null = null
  private canvasWidth: number = 0
  private canvasHeight: number = 0
  private scale: number = RENDER_SCALE
  private forceFields: ForceField[] = []

  /** 球桌在 canvas 中的偏移（居中留白），以未旋转的布局计算 */
  private tableOffsetX: number = 0
  private tableOffsetY: number = 0

  /**
   * 竖屏时把球桌逆时针旋转 90° 竖放（开球区在下方），让球显示得更大。
   * 所有绘制都在未旋转的布局里进行，由 canvas 变换统一旋转；输入坐标在 toGame 中反变换。
   */
  public rotated = false

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

  /** 自由球摆放预览（存在时白球画在预览位置） */
  public placementPreview: { position: Vector2; valid: boolean } | null = null

  /** 指袋模式：所有袋口显示可选提示，已指定的袋口高亮；null 表示不需要指袋 */
  public pocketCall: { called: number | null } | null = null

  /** 开球前高亮开球区（开球线左侧） */
  public breakArea = false

  /** 当前玩家可击打的目标球号，绘制时加光圈提示 */
  public highlightBalls: Set<number> = new Set()

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

    // 画布比球桌更"竖"时旋转球桌，此时布局的宽高对调
    this.rotated = height > width
    const layoutWidth = this.rotated ? height : width
    const layoutHeight = this.rotated ? width : height

    // 计算缩放：让球桌完整显示在 canvas 中，不留多余 margin
    // 分别按宽度和高度计算，取较小值确保不溢出
    const scaleByWidth = layoutWidth / totalWidth
    const scaleByHeight = layoutHeight / totalHeight
    this.scale = Math.min(scaleByWidth, scaleByHeight) * 0.98 // 留 2% 呼吸边距

    // 计算球桌在 canvas 中的偏移（居中）
    const renderedWidth = totalWidth * this.scale
    const renderedHeight = totalHeight * this.scale
    this.tableOffsetX = (layoutWidth - renderedWidth) / 2
    this.tableOffsetY = (layoutHeight - renderedHeight) / 2
  }

  setForceFields(fields: ForceField[]): void {
    this.forceFields = fields
  }

  /** 游戏坐标 → 布局像素（未旋转；绘制时由 canvas 变换负责旋转） */
  toPixel(pos: Vector2): Vector2 {
    return new Vector2(
      (pos.x + CUSHION_WIDTH) * this.scale + this.tableOffsetX,
      (pos.y + CUSHION_WIDTH) * this.scale + this.tableOffsetY,
    )
  }

  /** Canvas像素（屏幕上看到的位置） → 游戏坐标 */
  toGame(pixel: Vector2): Vector2 {
    // 反变换：屏幕 (px, py) ← 布局 (lx, ly) 经 translate(0, H) + rotate(-90°) 得到 (ly, H - lx)
    if (this.rotated) pixel = new Vector2(this.canvasHeight - pixel.y, pixel.x)
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
  render(world: PhysicsWorld, dt = 0): void {
    this.updateOrientations(world, dt)
    const ctx = this.ctx
    if (!ctx) return

    // 清空画布
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)

    // 绘制背景（球桌周围的深色区域）
    ctx.fillStyle = '#0a0a14'
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight)

    ctx.save()
    if (this.rotated) {
      ctx.translate(0, this.canvasHeight)
      ctx.rotate(-Math.PI / 2)
    }

    // 绘制球桌
    this.drawTable(ctx)

    if (this.breakArea) this.drawBreakArea(ctx)
    if (this.pocketCall) this.drawPocketCall(ctx, this.pocketCall.called)

    // 绘制力场特效（海克斯效果视觉）
    this.drawForceFields(ctx)

    // 绘制瞄准线与预测轨迹
    this.drawAimLine(ctx, world)

    // 落袋中的球（画在台面球之下）
    this.drawPocketAnimations(ctx)

    // 目标球光圈（画在球下方）
    for (const ball of world.balls) {
      if (ball.active && this.highlightBalls.has(ball.number)) {
        this.drawTargetHighlight(ctx, ball)
      }
    }

    // 绘制球
    for (const ball of world.balls) {
      if (ball.active && !(ball.isCue && this.placementPreview)) {
        this.drawBall(ctx, ball)
      }
    }

    // 自由球摆放预览
    if (this.placementPreview) {
      this.drawPlacementPreview(ctx, world)
    }

    if (this._firstFrame) {
      console.log('[Renderer] Initialized successfully')
      this._firstFrame = false
    }

    // 绘制球杆
    if (this.cueStick.visible) {
      this.drawCueStick(ctx)
    }
    ctx.restore()

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

    const tableX = ox + CUSHION_WIDTH * this.scale
    const tableY = oy + CUSHION_WIDTH * this.scale
    const tableW = TABLE_WIDTH * this.scale
    const tableH = TABLE_HEIGHT * this.scale

    // 库边胶条（深绿），袋口处被袋洞切开
    const rail = CUSHION_WIDTH * this.scale * 0.55
    ctx.fillStyle = '#145218'
    ctx.fillRect(tableX - rail, tableY - rail, tableW + rail * 2, tableH + rail * 2)

    // 袋洞：整圆先画黑，台面多边形再盖住袋口线以内的部分，只露出袋口线外侧
    for (const pocket of POCKETS) {
      const center = this.toPixel(pocket.holeCenter)
      ctx.beginPath()
      ctx.arc(center.x, center.y, pocket.holeRadius * this.scale, 0, Math.PI * 2)
      ctx.fillStyle = '#0D0D0D'
      ctx.fill()
    }

    // 台面（绿色）：库边线段的端点首尾相连，角袋处被袋口线切掉
    const outline = this.feltOutline()
    ctx.beginPath()
    outline.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
    ctx.closePath()
    ctx.fillStyle = '#1B5E20'
    ctx.fill()

    // 台面细微纹理
    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgba(0,0,0,0.05)'
    for (let i = 0; i < tableW; i += this.scale * 8) {
      ctx.fillRect(tableX + i, tableY, 1, tableH)
    }
    ctx.restore()

    // 库边边缘高光，袋角处的圆头即物理上的袋角
    ctx.strokeStyle = 'rgba(160, 230, 160, 0.35)'
    ctx.lineWidth = Math.max(1, this.scale * 0.12)
    ctx.lineCap = 'round'
    for (const segment of CUSHION_SEGMENTS) {
      const a = this.toPixel(segment.a)
      const b = this.toPixel(segment.b)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'

    // 开球线：球桌横放，位于左侧 1/4 处的竖线（白球开球位置）
    const breakLineX = this.toPixel(new Vector2(BREAK_LINE_X, 0)).x
    ctx.beginPath()
    ctx.moveTo(breakLineX, tableY)
    ctx.lineTo(breakLineX, tableY + tableH)
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

  /** 台面轮廓：沿顺时针依次连接各袋口的两个袋角 */
  private feltOutline(): Vector2[] {
    // POCKETS 顺序：左上、上中、右上、左下、下中、右下；按顺时针重排
    const order = [0, 1, 2, 5, 4, 3]
    const points: Vector2[] = []
    for (const index of order) {
      const pocket = POCKETS[index]
      // 每个袋口的两个袋角按顺时针方向排列（inward 逆时针旋转 90° 为前进方向）
      const forward = new Vector2(-pocket.inward.y, pocket.inward.x).negate
      const [first, second] = pocket.mouthB.subtract(pocket.mouthA).dot(forward) > 0
        ? [pocket.mouthA, pocket.mouthB]
        : [pocket.mouthB, pocket.mouthA]
      points.push(this.toPixel(first), this.toPixel(second))
    }
    return points
  }

  // ==================== 球绘制 ====================

  /**
   * 绘制一颗球。球面纹理（底色、条纹、号码圆）按球的三维朝向逐像素渲染到小画布上，
   * 朝向随球的旋转更新，因此能看到球在滚动、低杆时反向旋转等效果
   */
  private drawBall(
    ctx: CanvasRenderingContext2D,
    ball: Ball,
    opts: { position?: Vector2; radiusScale?: number; alpha?: number } = {},
  ): void {
    const pos = this.toPixel(opts.position ?? ball.position)
    const radius = ball.radius * this.scale * (opts.radiusScale ?? 1)
    const visual = this.getVisual(ball)

    ctx.save()
    ctx.globalAlpha = opts.alpha ?? 1

    // 球阴影（光源固定在屏幕上方，旋转时换算回布局方向）
    const shadow = this.screenToLayoutDir(0, radius * 0.2)
    ctx.beginPath()
    ctx.arc(pos.x + shadow.x, pos.y + shadow.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()

    // 球体纹理
    const sprite = this.getBallSprite(ball, visual, ball.radius * this.scale)
    if (sprite) {
      ctx.drawImage(sprite, pos.x - radius, pos.y - radius, radius * 2, radius * 2)
    } else {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = ball.color
      ctx.fill()
    }

    // 号码：跟随号码圆的位置，转到侧面时缩小变淡，转到背面不画
    if (ball.number > 0) {
      const m = visual.m
      // 号码圆中心在球体坐标 (0,0,-1)，世界坐标为 M 第三列取反
      const sx = -m[2], sy = -m[5], facing = m[8]
      if (facing > 0.35) {
        ctx.globalAlpha = (opts.alpha ?? 1) * Math.min(1, (facing - 0.35) / 0.35)
        ctx.fillStyle = '#000000'
        ctx.font = `bold ${Math.max(radius * 0.62 * facing, 6)}px Arial`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.save()
        ctx.translate(pos.x + sx * radius, pos.y + sy * radius)
        // 球桌旋转时把数字转回正向
        if (this.rotated) ctx.rotate(Math.PI / 2)
        ctx.fillText(ball.number.toString(), 0, 0)
        ctx.restore()
        ctx.globalAlpha = opts.alpha ?? 1
      }
    }

    // 高光（屏幕左上方）
    const shine = this.screenToLayoutDir(-radius * 0.3, -radius * 0.3)
    ctx.beginPath()
    ctx.arc(pos.x + shine.x, pos.y + shine.y, radius * 0.28, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fill()
    ctx.restore()
  }

  // ==================== 球的三维朝向 ====================

  /**
   * 每颗球的朝向矩阵 M（球体坐标 → 世界坐标，行优先 3×3）与纹理缓存。
   * 世界坐标：x 右、y 下、z 指向屏幕里（台面方向），观察者看到 z < 0 的半球。
   * 以 Ball 对象为键：重新摆球会生成新对象，朝向自动复位（号码朝上）
   */
  private visuals = new WeakMap<Ball, { m: number[]; sprite: HTMLCanvasElement | null; dirty: boolean; size: number }>()

  private getVisual(ball: Ball) {
    let visual = this.visuals.get(ball)
    if (!visual) {
      visual = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], sprite: null, dirty: true, size: 0 }
      this.visuals.set(ball, visual)
    }
    return visual
  }

  /**
   * 按球的角速度推进朝向。rollSpin 是"纯滚动对应的速度"，换算角速度 ω = (vy, -vx, sideSpin) / R
   * （推导：滚动时与台面接触点静止，ω × (R·ẑ) = -v）
   */
  private updateOrientations(world: PhysicsWorld, dt: number): void {
    if (dt <= 0) return
    for (const ball of world.balls) {
      if (!ball.active) continue
      const wx = ball.rollSpin.y / ball.radius
      const wy = -ball.rollSpin.x / ball.radius
      const wz = ball.sideSpin / ball.radius
      const w = Math.hypot(wx, wy, wz)
      if (w < 1e-6) continue
      const visual = this.getVisual(ball)
      visual.m = multiply3(rotationMatrix(wx / w, wy / w, wz / w, w * dt), visual.m)
      orthonormalize(visual.m)
      visual.dirty = true
    }
  }

  /** 逐像素渲染球面纹理（只在朝向或尺寸变化时重绘） */
  private getBallSprite(ball: Ball, visual: { m: number[]; sprite: HTMLCanvasElement | null; dirty: boolean; size: number }, radius: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    const size = Math.max(8, Math.ceil(radius * 2 * dpr))
    if (visual.sprite && !visual.dirty && visual.size === size) return visual.sprite

    const canvas = visual.sprite ?? document.createElement('canvas')
    if (canvas.width !== size) {
      canvas.width = size
      canvas.height = size
    }
    const spriteCtx = canvas.getContext('2d')
    if (!spriteCtx) return null
    const image = spriteCtx.createImageData(size, size)
    const data = image.data
    const base = hexToRgb(ball.isCue ? '#f5f5f0' : ball.color)
    const m = visual.m
    const half = size / 2

    for (let j = 0; j < size; j++) {
      const y = (j + 0.5 - half) / half
      for (let i = 0; i < size; i++) {
        const x = (i + 0.5 - half) / half
        const r2 = x * x + y * y
        const k = (j * size + i) * 4
        if (r2 >= 1) {
          data[k + 3] = 0
          continue
        }
        const z = -Math.sqrt(1 - r2)
        // 球体坐标 = Mᵀ · 世界坐标
        const bx = m[0] * x + m[3] * y + m[6] * z
        const by = m[1] * x + m[4] * y + m[7] * z
        const bz = m[2] * x + m[5] * y + m[8] * z

        let r = base[0], g = base[1], b = base[2]
        const onNumberDisc = ball.number > 0 && -bz > 0.917
        const offStripe = ball.isStripe && Math.abs(by) > 0.45
        if (onNumberDisc || offStripe) {
          r = 250; g = 250; b = 245
        }
        // 训练母球：上下左右前后六个方向各一个红点，便于看清白球的旋转
        if (ball.isCue && Math.max(Math.abs(bx), Math.abs(by), Math.abs(bz)) > CUE_DOT_COS) {
          r = 214; g = 40; b = 40
        }
        // 简单的球面明暗：边缘稍暗
        const shade = 0.62 + 0.38 * -z
        data[k] = r * shade
        data[k + 1] = g * shade
        data[k + 2] = b * shade
        // 边缘抗锯齿
        data[k + 3] = Math.min(1, (1 - Math.sqrt(r2)) * half + 0.5) * 255
      }
    }
    spriteCtx.putImageData(image, 0, 0)
    visual.sprite = canvas
    visual.size = size
    visual.dirty = false
    return canvas
  }

  // ==================== 落袋动画 ====================

  private pocketAnimations: { ball: Ball; from: Vector2; to: Vector2; start: number }[] = []
  private static readonly POCKET_ANIM_MS = 380

  /** 球落袋时调用：球从落袋位置滑向袋洞中心并缩小消失 */
  notifyPocketed(ball: Ball, pocketIndex: number): void {
    const pocket = POCKETS[pocketIndex]
    if (!pocket) return
    this.pocketAnimations.push({ ball, from: ball.position.clone(), to: pocket.holeCenter, start: performance.now() })
  }

  private drawPocketAnimations(ctx: CanvasRenderingContext2D): void {
    const now = performance.now()
    this.pocketAnimations = this.pocketAnimations.filter(anim => {
      const t = (now - anim.start) / CanvasRenderer.POCKET_ANIM_MS
      // 动画结束，或球已被重新摆上台面（白球自由球）
      if (t >= 1 || anim.ball.active) return false
      const eased = 1 - (1 - t) * (1 - t)
      this.drawBall(ctx, anim.ball, {
        position: Vector2.lerp(anim.from, anim.to, eased),
        radiusScale: 1 - 0.45 * eased,
        alpha: 1 - 0.8 * t,
      })
      return true
    })
  }

  /** 开球区：开球线左侧淡色覆盖 */
  private drawBreakArea(ctx: CanvasRenderingContext2D): void {
    const topLeft = this.toPixel(new Vector2(0, 0))
    const bottomRight = this.toPixel(new Vector2(BREAK_LINE_X, TABLE_HEIGHT))
    // 裁剪到台面轮廓内，避免盖住角袋
    ctx.save()
    const outline = this.feltOutline()
    ctx.beginPath()
    outline.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
    ctx.closePath()
    ctx.clip()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
    ctx.restore()
  }

  /** 指袋：未指定时所有袋口画虚线圈提示可点；已指定的袋口画实心高亮圈 */
  private drawPocketCall(ctx: CanvasRenderingContext2D, called: number | null): void {
    POCKETS.forEach((pocket, i) => {
      if (called !== null && i !== called) return
      const center = this.toPixel(pocket.holeCenter)
      ctx.beginPath()
      ctx.arc(center.x, center.y, (pocket.holeRadius + 0.6) * this.scale, 0, Math.PI * 2)
      ctx.lineWidth = Math.max(2, this.scale * 0.25)
      if (called === null) {
        ctx.strokeStyle = 'rgba(255, 217, 61, 0.7)'
        ctx.setLineDash([6, 5])
      } else {
        ctx.strokeStyle = 'rgba(255, 217, 61, 1)'
      }
      ctx.stroke()
      ctx.setLineDash([])
    })
  }

  /** 屏幕上的偏移方向 → 布局坐标中的偏移（旋转时 屏幕 (dx, dy) 对应 布局 (-dy, dx)） */
  private screenToLayoutDir(dx: number, dy: number): Vector2 {
    return this.rotated ? new Vector2(-dy, dx) : new Vector2(dx, dy)
  }

  /** 目标球外圈的柔和光环 */
  private drawTargetHighlight(ctx: CanvasRenderingContext2D, ball: Ball): void {
    const pos = this.toPixel(ball.position)
    const radius = ball.radius * this.scale
    const glow = ctx.createRadialGradient(pos.x, pos.y, radius * 0.9, pos.x, pos.y, radius * 1.6)
    glow.addColorStop(0, 'rgba(255, 230, 120, 0.75)')
    glow.addColorStop(1, 'rgba(255, 230, 120, 0)')
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, radius * 1.6, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()
  }

  // ==================== 瞄准线绘制 ====================

  private drawAimLine(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
    if (!this.aimLine) return

    const origin = this.aimLine.start
    const direction = this.aimLine.end.subtract(origin).normalized
    if (direction.length === 0) return

    const ballHit = this.findFirstBallHit(origin, direction, world)
    const trace = this.traceToRail(origin, direction)

    if (ballHit && ballHit.distance <= trace.distance) {
      this.drawDashedSegment(ctx, origin, ballHit.point, 'rgba(255,255,255,0.78)', 1.5)
      this.drawGhostBall(ctx, ballHit.point)

      // 等质量球的碰撞预测：目标球沿两球中心连线前进，一直画到库边或袋口
      const normal = ballHit.ball.position.subtract(ballHit.point).normalized
      const objectTrace = this.traceToRail(ballHit.ball.position, normal)
      const potted = objectTrace.pocket !== null
      this.drawDashedSegment(ctx, ballHit.ball.position, objectTrace.point,
        potted ? 'rgba(120,230,140,0.95)' : 'rgba(255,211,77,0.9)', 1.8)
      if (potted) this.drawPocketTarget(ctx, objectTrace.pocket!)

      // 白球沿切线方向分离
      const tangentVelocity = direction.subtract(normal.multiply(direction.dot(normal)))
      if (tangentVelocity.length > 0.08) {
        const cueEnd = ballHit.point.add(tangentVelocity.normalized.multiply(7))
        this.drawDashedSegment(ctx, ballHit.point, cueEnd, 'rgba(121,196,255,0.8)', 1.2)
      }
      return
    }

    this.drawDashedSegment(ctx, origin, trace.point, 'rgba(255,255,255,0.78)', 1.5)
    if (trace.pocket !== null) {
      // 白球直接进袋
      this.drawGhostBall(ctx, trace.point, 'rgba(255,107,107,0.8)')
      return
    }
    this.drawGhostBall(ctx, trace.point)
    const reflectedEnd = trace.point.add(trace.reflect.multiply(12))
    this.drawDashedSegment(ctx, trace.point, reflectedEnd, 'rgba(121,196,255,0.8)', 1.4)
  }

  /** 球影：白球撞击时所在位置的空心圆 */
  private drawGhostBall(ctx: CanvasRenderingContext2D, position: Vector2, color = 'rgba(255,255,255,0.75)'): void {
    const pixel = this.toPixel(position)
    ctx.beginPath()
    ctx.arc(pixel.x, pixel.y, BALL_RADIUS * this.scale, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  /** 预测会进袋时高亮该袋口 */
  private drawPocketTarget(ctx: CanvasRenderingContext2D, pocketIndex: number): void {
    const pocket = POCKETS[pocketIndex]
    const center = this.toPixel(pocket.holeCenter)
    ctx.beginPath()
    ctx.arc(center.x, center.y, (pocket.holeRadius + 0.3) * this.scale, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(120,230,140,0.95)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  /**
   * 球心沿直线前进，直到碰库或进入袋口。
   * 碰到的位置附近没有库边线段（落在袋口缺口里）时，改为求与袋口线的交点，视为进袋
   */
  private traceToRail(origin: Vector2, direction: Vector2): {
    point: Vector2; distance: number; pocket: number | null; reflect: Vector2
  } {
    const hit = this.findCushionHit(origin, direction)
    const touchesCushion = CUSHION_SEGMENTS.some(
      segment => closestPointOnSegment(hit.point, segment.a, segment.b).distFrom(hit.point) < BALL_RADIUS + 0.05,
    )
    if (touchesCushion) return { point: hit.point, distance: hit.distance, pocket: null, reflect: hit.direction }

    let best: { point: Vector2; distance: number; pocket: number } | null = null
    POCKETS.forEach((pocket, index) => {
      const t = raySegmentIntersection(origin, direction, pocket.mouthA, pocket.mouthB)
      if (t !== null && (!best || t < best.distance)) {
        best = { point: origin.add(direction.multiply(t)), distance: t, pocket: index }
      }
    })
    if (best) return { ...(best as { point: Vector2; distance: number; pocket: number }), reflect: direction }
    // 打在袋角上：停在碰撞点，不预测反弹
    return { point: hit.point, distance: hit.distance, pocket: null, reflect: hit.direction }
  }

  private drawDashedSegment(
    ctx: CanvasRenderingContext2D,
    start: Vector2,
    end: Vector2,
    color: string,
    width: number,
  ): void {
    const pixelStart = this.toPixel(start)
    const pixelEnd = this.toPixel(end)
    ctx.beginPath()
    ctx.moveTo(pixelStart.x, pixelStart.y)
    ctx.lineTo(pixelEnd.x, pixelEnd.y)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.setLineDash([6, 5])
    ctx.stroke()
    ctx.setLineDash([])
  }

  private findFirstBallHit(origin: Vector2, direction: Vector2, world: PhysicsWorld): {
    ball: Ball
    point: Vector2
    distance: number
  } | null {
    let closest: { ball: Ball; point: Vector2; distance: number } | null = null

    for (const ball of world.balls) {
      if (!ball.active || ball.position.equals(origin)) continue
      const toBall = ball.position.subtract(origin)
      const projectedDistance = toBall.dot(direction)
      if (projectedDistance <= 0) continue

      const perpendicularDistanceSq = toBall.lengthSq - projectedDistance * projectedDistance
      const collisionRadius = BALL_DIAMETER
      const discriminant = collisionRadius * collisionRadius - perpendicularDistanceSq
      if (discriminant < 0) continue

      const impactDistance = projectedDistance - Math.sqrt(discriminant)
      if (impactDistance <= 0 || (closest && impactDistance >= closest.distance)) continue
      closest = {
        ball,
        point: origin.add(direction.multiply(impactDistance)),
        distance: impactDistance,
      }
    }

    return closest
  }

  private findCushionHit(origin: Vector2, direction: Vector2): { point: Vector2; direction: Vector2; distance: number } {
    const left = BALL_RADIUS
    const right = TABLE_WIDTH - BALL_RADIUS
    const top = BALL_RADIUS
    const bottom = TABLE_HEIGHT - BALL_RADIUS
    const candidates: { distance: number; normal: Vector2 }[] = []

    if (direction.x > 0) candidates.push({ distance: (right - origin.x) / direction.x, normal: new Vector2(-1, 0) })
    if (direction.x < 0) candidates.push({ distance: (left - origin.x) / direction.x, normal: new Vector2(1, 0) })
    if (direction.y > 0) candidates.push({ distance: (bottom - origin.y) / direction.y, normal: new Vector2(0, -1) })
    if (direction.y < 0) candidates.push({ distance: (top - origin.y) / direction.y, normal: new Vector2(0, 1) })

    const hit = candidates
      .filter(candidate => candidate.distance > 0)
      .sort((a, b) => a.distance - b.distance)[0]

    // direction 不可能为零；该兜底仅防止未来调用方传入非法数值。
    if (!hit) return { point: origin, direction, distance: 0 }
    return {
      point: origin.add(direction.multiply(hit.distance)),
      direction: direction.reflect(hit.normal).normalized,
      distance: hit.distance,
    }
  }

  // ==================== 球杆绘制 ====================

  private drawCueStick(ctx: CanvasRenderingContext2D): void {
    const cuePos = this.toPixel(this.cueStick.position)
    const angle = this.cueStick.angle
    const power = this.cueStick.power
    const isShooting = this.cueStick.shooting
    const shootProgress = this.cueStick.shootProgress

    const cueLength = 40 * this.scale
    const cueWidth = 1.2 * this.scale

    // 基础间距：球杆尖端到球表面的距离（像素）
    // 这个值确保杆头始终在白球外部，清晰可见
    const baseGap = BALL_RADIUS * this.scale * 1.5
    // 蓄力拉杆距离：力度越大，球杆越远离球
    const pullBackDist = power * this.scale * 8

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

  // ==================== 自由球预览 ====================

  private drawPlacementPreview(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
    const preview = this.placementPreview!
    const cueBall = world.balls.find(ball => ball.isCue)
    if (!cueBall) return

    ctx.save()
    ctx.globalAlpha = preview.valid ? 1 : 0.55
    this.drawBall(ctx, cueBall, { position: preview.position })
    ctx.restore()

    // 合法：绿色描边；不合法：红色描边
    const pixel = this.toPixel(preview.position)
    ctx.beginPath()
    ctx.arc(pixel.x, pixel.y, BALL_RADIUS * this.scale * 1.35, 0, Math.PI * 2)
    ctx.strokeStyle = preview.valid ? 'rgba(107,203,119,0.95)' : 'rgba(255,107,107,0.95)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // ==================== 力场特效绘制 ====================

  private drawForceFields(ctx: CanvasRenderingContext2D): void {
    // 海克斯力场视觉占位，后续实现
  }
}

// ==================== 三维旋转工具 ====================

/** 绕单位轴 (x, y, z) 旋转 angle 的矩阵（Rodrigues 公式，行优先） */
function rotationMatrix(x: number, y: number, z: number, angle: number): number[] {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ]
}

function multiply3(a: number[], b: number[]): number[] {
  const out = new Array(9)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
    }
  }
  return out
}

/** 消除累积误差：对列向量做 Gram-Schmidt 正交化 */
function orthonormalize(m: number[]): void {
  let ax = m[0], ay = m[3], az = m[6]
  let len = Math.hypot(ax, ay, az)
  ax /= len; ay /= len; az /= len
  let bx = m[1], by = m[4], bz = m[7]
  const d = ax * bx + ay * by + az * bz
  bx -= d * ax; by -= d * ay; bz -= d * az
  len = Math.hypot(bx, by, bz)
  bx /= len; by /= len; bz /= len
  m[0] = ax; m[3] = ay; m[6] = az
  m[1] = bx; m[4] = by; m[7] = bz
  m[2] = ay * bz - az * by
  m[5] = az * bx - ax * bz
  m[8] = ax * by - ay * bx
}

/** 射线 origin + t·dir 与线段 ab 的交点参数 t（不相交返回 null） */
function raySegmentIntersection(origin: Vector2, dir: Vector2, a: Vector2, b: Vector2): number | null {
  const ab = b.subtract(a)
  const denom = dir.cross(ab)
  if (Math.abs(denom) < 1e-9) return null
  const ao = a.subtract(origin)
  const t = ao.cross(ab) / denom
  const u = ao.cross(dir) / denom
  return t > 0 && u >= 0 && u <= 1 ? t : null
}

/** 母球红点大小：点中心与球面点夹角的余弦阈值（约 0.2 个半径） */
const CUE_DOT_COS = Math.sqrt(1 - 0.2 * 0.2)

const rgbCache = new Map<string, [number, number, number]>()
function hexToRgb(color: string): [number, number, number] {
  let rgb = rgbCache.get(color)
  if (!rgb) {
    const hex = color.startsWith('#') ? color.slice(1) : 'ffffff'
    rgb = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
    rgbCache.set(color, rgb)
  }
  return rgb
}
