import { Vector2 } from './Vector2'

/**
 * 中式八球球桌规格 (Chinese 8-Ball Table Specifications)
 *
 * ⚠️ 注意：中式八球球桌与美式8球球桌有差异！
 * - 球桌内径: 2540mm × 1270mm
 * - 袋口形状: 圆角袋口（比美式直角袋口稍大）
 * - 6个袋口: 四角 + 两侧中袋
 *
 * 游戏坐标系：以球桌左上角内侧为原点
 * 单位系统：1单位 = 球半径
 *
 * 真实比例：球桌 = 球直径的 ~44倍
 * 游戏比例：球桌 = 球直径的 ~18倍 (36/2)
 * 比例系数 = 44/18 ≈ 2.44
 * 保持2:1的球桌长宽比，球在屏幕上仍清晰可见
 */

// 球的参数
export const BALL_RADIUS = 1       // 1单位 = 1个球半径
export const BALL_DIAMETER = BALL_RADIUS * 2

// 球桌参数（保持2:1比例）
// 真实比例44:22 → 游戏比例 36:18 = 2:1
export const TABLE_WIDTH = 36      // 内径宽度（球半径单位）
export const TABLE_HEIGHT = 18     // 内径高度（球半径单位）

// 库边（cushion）宽度
export const CUSHION_WIDTH = 1.5   // 库边宽度

// ==================== 袋口与库边几何 ====================
//
// 库边是一组线段，在袋口处断开，断点即袋角（jaw nose）。
// 袋口由两个袋角之间的"袋口线"定义：球心越过袋口线达到捕获深度即落袋。
// 球在越过之前仍可能撞到袋角被弹出，这就是真实台球里的"袋角拒球"。
// 物理碰撞、落袋判定、绘制与自由球合法性都使用同一套数据。

// 角袋：袋角距球桌角点的距离（沿库边）。袋口宽 = 该值 × √2 ≈ 3.4 个球半径
export const CORNER_JAW_OFFSET = 2.4
// 中袋：袋口半宽。袋口宽 3.6 个球半径（中式台球中袋略宽于角袋）
export const SIDE_MOUTH_HALF_WIDTH = 1.8
// 球心越过袋口线多深算落袋
export const CORNER_CAPTURE_DEPTH = 0.5
export const SIDE_CAPTURE_DEPTH = 0.35

export interface PocketSpec {
  /** 袋口线的两个端点（袋角） */
  mouthA: Vector2
  mouthB: Vector2
  /** 袋口线指向台面内侧的单位法向量 */
  inward: Vector2
  /** 落袋所需越过袋口线的深度 */
  captureDepth: number
  /** 绘制用的袋洞圆（经过两个袋角，只画袋口线外侧部分） */
  holeCenter: Vector2
  holeRadius: number
}

function makePocket(mouthA: Vector2, mouthB: Vector2, inward: Vector2, captureDepth: number, holeCenter: Vector2): PocketSpec {
  return { mouthA, mouthB, inward, captureDepth, holeCenter, holeRadius: holeCenter.distFrom(mouthA) }
}

const W = TABLE_WIDTH
const H = TABLE_HEIGHT
const J = CORNER_JAW_OFFSET
const S = SIDE_MOUTH_HALF_WIDTH
const D = Math.SQRT1_2
// 袋洞圆心略偏向台内，使圆只在袋口线外露出合适的大小
const CORNER_HOLE_INSET = 0.5
const SIDE_HOLE_INSET = 0.3

export const POCKETS: PocketSpec[] = [
  makePocket(new Vector2(J, 0), new Vector2(0, J), new Vector2(D, D), CORNER_CAPTURE_DEPTH,
    new Vector2(CORNER_HOLE_INSET, CORNER_HOLE_INSET)),                         // 左上角袋
  makePocket(new Vector2(W / 2 - S, 0), new Vector2(W / 2 + S, 0), new Vector2(0, 1), SIDE_CAPTURE_DEPTH,
    new Vector2(W / 2, SIDE_HOLE_INSET)),                                       // 上中袋
  makePocket(new Vector2(W - J, 0), new Vector2(W, J), new Vector2(-D, D), CORNER_CAPTURE_DEPTH,
    new Vector2(W - CORNER_HOLE_INSET, CORNER_HOLE_INSET)),                     // 右上角袋
  makePocket(new Vector2(0, H - J), new Vector2(J, H), new Vector2(D, -D), CORNER_CAPTURE_DEPTH,
    new Vector2(CORNER_HOLE_INSET, H - CORNER_HOLE_INSET)),                     // 左下角袋
  makePocket(new Vector2(W / 2 - S, H), new Vector2(W / 2 + S, H), new Vector2(0, -1), SIDE_CAPTURE_DEPTH,
    new Vector2(W / 2, H - SIDE_HOLE_INSET)),                                   // 下中袋
  makePocket(new Vector2(W, H - J), new Vector2(W - J, H), new Vector2(-D, -D), CORNER_CAPTURE_DEPTH,
    new Vector2(W - CORNER_HOLE_INSET, H - CORNER_HOLE_INSET)),                 // 右下角袋
]

export interface CushionSegment {
  a: Vector2
  b: Vector2
}

/** 库边线段（球心到线段距离小于球半径即碰库；线段端点即袋角） */
export const CUSHION_SEGMENTS: CushionSegment[] = [
  { a: new Vector2(J, 0), b: new Vector2(W / 2 - S, 0) },         // 上库左段
  { a: new Vector2(W / 2 + S, 0), b: new Vector2(W - J, 0) },     // 上库右段
  { a: new Vector2(J, H), b: new Vector2(W / 2 - S, H) },         // 下库左段
  { a: new Vector2(W / 2 + S, H), b: new Vector2(W - J, H) },     // 下库右段
  { a: new Vector2(0, J), b: new Vector2(0, H - J) },             // 左库
  { a: new Vector2(W, J), b: new Vector2(W, H - J) },             // 右库
]

/** 点到线段的最近点 */
export function closestPointOnSegment(p: Vector2, a: Vector2, b: Vector2): Vector2 {
  const ab = b.subtract(a)
  const t = Math.max(0, Math.min(1, p.subtract(a).dot(ab) / ab.lengthSq))
  return a.add(ab.multiply(t))
}

// 物理常数（时间单位：秒；速度单位：球半径/秒）
// 物理以固定步长推进，与屏幕刷新率无关
export const PHYSICS_DT = 1 / 120

// 台面摩擦：减速度 = ROLLING_DECEL + LINEAR_DRAG × 速度
// 恒定部分模拟滚动摩擦，让球干脆地停下；线性部分让高速球衰减更快
// 标定（不计库边损耗）：满力≈3.9个台长，50%≈1.4个台长，25%≈半张台，10%≈1.7个球径，满力约5.7秒停球
export const ROLLING_DECEL = 5
export const LINEAR_DRAG = 0.25

// 恢复系数：只作用于碰撞法向速度，切向速度保留
export const BALL_RESTITUTION = 0.95     // 球-球
export const CUSHION_RESTITUTION = 0.8   // 球-库边（真实约 0.75～0.85）
export const MIN_VELOCITY = 0.05    // 停止判定阈值
export const MAX_SHOT_POWER = 64    // 满力击球初速度

// 每个子步内球的最大位移，防止高速球穿过其他球
export const MAX_SUBSTEP_TRAVEL = 0.5

// 渲染缩放 - Canvas像素 / 游戏单位
// 根据设备屏幕动态计算
export let RENDER_SCALE = 8 // 1游戏单位 = 8像素（默认，会动态调整）

export function updateRenderScale(canvasWidth: number): void {
  RENDER_SCALE = canvasWidth / (TABLE_WIDTH + CUSHION_WIDTH * 2)
}

// 球的初始颜色定义（中式八球）
export enum BallColor {
  WHITE = 'white',      // 白球（母球）
  SOLID_1 = '#FDD835',  // 1号 - 黄色（全色）
  SOLID_2 = '#1565C0',  // 2号 - 蓝色（全色）
  SOLID_3 = '#D32F2F',  // 3号 - 红色（全色）
  SOLID_4 = '#6A1B9A',  // 4号 - 紫色（全色）
  SOLID_5 = '#FF6F00',  // 5号 - 橙色（全色）
  SOLID_6 = '#2E7D32',  // 6号 - 绿色（全色）
  SOLID_7 = '#6D4C41',  // 7号 - 棕色（全色）
  EIGHT = '#212121',    // 8号 - 黑色
  STRIPE_9 = '#FDD835', // 9号 - 黄色（花色/条纹）
  STRIPE_10 = '#1565C0',// 10号 - 蓝色（花色/条纹）
  STRIPE_11 = '#D32F2F',// 11号 - 红色（花色/条纹）
  STRIPE_12 = '#6A1B9A',// 12号 - 紫色（花色/条纹）
  STRIPE_13 = '#FF6F00',// 13号 - 橙色（花色/条纹）
  STRIPE_14 = '#2E7D32',// 14号 - 绿色（花色/条纹）
  STRIPE_15 = '#6D4C41',// 15号 - 棕色（花色/条纹）
}

// 球组判定
export function isSolidBall(number: number): boolean {
  return number >= 1 && number <= 7
}

export function isStripeBall(number: number): boolean {
  return number >= 9 && number <= 15
}

export function isEightBall(number: number): boolean {
  return number === 8
}

export function isCueBall(number: number): boolean {
  return number === 0
}
