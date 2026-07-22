/**
 * 游戏核心类型定义
 */

// Re-export types with proper type-only exports
export type { ForceField, BaseForceField, GravityWell, AccelerationZone, TableTilt } from '../engine/physics/ForceField'
export type { GamePhase, BallGroup, Player, TurnResult, GameStateData } from '../engine/game/GameState'
export type { InputEvent, InputHandler } from '../engine/input/CueController'

// Re-export value exports (classes and constants)
export { Vector2 } from '../engine/physics/Vector2'
export { Ball, BallState } from '../engine/physics/Ball'
export { PhysicsWorld } from '../engine/physics/PhysicsWorld'
export { RuleEngine } from '../engine/game/RuleEngine'
export { CanvasRenderer } from '../engine/renderer/CanvasRenderer'
export { CueController } from '../engine/input/CueController'

import {
  TABLE_WIDTH, TABLE_HEIGHT, CUSHION_WIDTH,
  BALL_RADIUS, BALL_DIAMETER,
  CORNER_POCKET_RADIUS, SIDE_POCKET_RADIUS,
} from '../engine/physics/TableSpec'

/** 游戏配置 */
export interface GameConfig {
  tableWidth: number
  tableHeight: number
  cushionWidth: number
  ballRadius: number
  cornerPocketRadius: number
  sidePocketRadius: number
}

/** 默认游戏配置（中式八球） */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  tableWidth: TABLE_WIDTH,
  tableHeight: TABLE_HEIGHT,
  cushionWidth: CUSHION_WIDTH,
  ballRadius: BALL_RADIUS,
  cornerPocketRadius: CORNER_POCKET_RADIUS,
  sidePocketRadius: SIDE_POCKET_RADIUS,
}
