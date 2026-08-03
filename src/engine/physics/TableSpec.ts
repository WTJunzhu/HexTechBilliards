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

// 袋口检测半径 — 球心距袋口中心 <= 此值即进袋
// 中式八球袋口比美式稍大，需足够大使球进入袋口区域时被捕获
// 角袋：豁口边缘(1.5) + 球半径(1.0)的斜边 ≈ 1.80，取 1.9 留余量
// 中袋：豁口边缘(1.3) + 球半径(1.0)的斜边 ≈ 1.64，取 1.7 留余量
export const CORNER_POCKET_RADIUS = 1.9 // 角袋检测半径
export const SIDE_POCKET_RADIUS = 1.7    // 中袋检测半径

// 库边袋口豁口半宽 — 库边在袋口附近打开的缺口半宽
// 球进入此区域时库边不反弹，可滚入袋口
// 必须 <= 对应袋口检测半径，确保豁口内的球都能被捕获
export const CORNER_MOUTH_HALF_WIDTH = 1.5 // 角袋豁口半宽
export const SIDE_MOUTH_HALF_WIDTH = 1.3   // 中袋豁口半宽

// 袋口位置（球桌内侧坐标）
// 角袋位于球桌四角；中袋位于长边库线上（非桌外）
export const POCKET_POSITIONS: Vector2[] = [
  new Vector2(0, 0),                          // 左上角袋
  new Vector2(TABLE_WIDTH / 2, 0),            // 上中袋
  new Vector2(TABLE_WIDTH, 0),                // 右上角袋
  new Vector2(0, TABLE_HEIGHT),              // 左下角袋
  new Vector2(TABLE_WIDTH / 2, TABLE_HEIGHT),// 下中袋
  new Vector2(TABLE_WIDTH, TABLE_HEIGHT),    // 右下角袋
]

// 物理常数
export const FRICTION = 0.99      // 每帧速度衰减（桌面摩擦）
export const COLLISION_LOSS = 0.01  // 碰撞能量损失（极小）
export const CUSHION_LOSS = 0.05    // 库边碰撞能量损失（极小）
export const MIN_VELOCITY = 0.005   // 停止判定阈值（接近零）
export const MAX_SHOT_POWER = 8    // 最大击球力度

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
