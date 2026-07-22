/**
 * 游戏状态枚举
 */
export enum GamePhase {
  IDLE = 'idle',               // 空闲（未开始）
  BREAK_SHOT = 'break_shot',   // 开球
  AIMING = 'aiming',           // 瞄准中
  POWER = 'power',             // 蓄力中
  SHOOTING = 'shooting',       // 击球执行
  BALLS_MOVING = 'balls_moving', // 球运动中
  TURN_END = 'turn_end',       // 回合结束判定
  BALL_IN_HAND = 'ball_in_hand', // 自由球放置
  GAME_OVER = 'game_over',     // 游戏结束
}

/**
 * 回合结果
 */
export interface TurnResult {
  /** 进袋的球号列表 */
  pocketedBalls: number[]
  /** 是否犯规 */
  foul: boolean
  /** 犯规原因 */
  foulReason?: string
  /** 第一个被碰到的球号（用于犯规判定） */
  firstHitBall: number | null
  /** 白球是否进袋 */
  cueBallPocketed: boolean
  /** 8号球是否进袋 */
  eightBallPocketed: boolean
}

/**
 * 球组类型
 */
export enum BallGroup {
  NONE = 'none',     // 未分配
  SOLID = 'solid',   // 全色球 (1-7)
  STRIPE = 'stripe', // 花色球 (9-15)
}

/**
 * 玩家数据
 */
export interface Player {
  index: number
  name: string
  group: BallGroup
  pocketedCount: number  // 已进的己方球数
}

/**
 * 游戏状态
 */
export interface GameStateData {
  phase: GamePhase
  players: Player[]
  currentPlayerIndex: number
  turnCount: number
  groupsAssigned: boolean  // 球组是否已分配
  turnResult: TurnResult | null
  winner: number | null    // 获胜玩家index
  winReason: string | null
}
