import type { Ball } from '../physics/Ball'
import { BallGroup } from './GameState'
import type { TurnResult, Player } from './GameState'
import {
  isCueBall, isSolidBall, isStripeBall, isEightBall,
} from '../physics/TableSpec'

/**
 * 中式八球规则引擎
 *
 * ⚠️ 这是中式八球规则，不是美式8球！
 *
 * 关键规则：
 * 1. 开球进球不决定球组归属
 * 2. 开球后第一个合法进球决定球组
 * 3. 犯规后对手获得全桌自由球
 * 4. 打8号球犯规直接判负
 * 5. 8号球进错袋判负
 */
export class RuleEngine {
  /**
   * 判定回合结果
   */
  evaluateTurn(
    balls: Ball[],
    pocketedBallsThisFrame: Ball[],
    firstHitBall: number | null,
    currentPlayer: Player,
    otherPlayer: Player,
    isBreakShot: boolean,
  ): TurnResult {
    const result: TurnResult = {
      pocketedBalls: [],
      foul: false,
      firstHitBall,
      cueBallPocketed: false,
      eightBallPocketed: false,
    }

    // 分类本帧进袋的球
    for (const ball of pocketedBallsThisFrame) {
      result.pocketedBalls.push(ball.number)

      if (isCueBall(ball.number)) {
        result.cueBallPocketed = true
        result.foul = true
        result.foulReason = '白球进袋（犯规）'
      }

      if (isEightBall(ball.number)) {
        result.eightBallPocketed = true
      }
    }

    // 犯规判定：未碰到任何球
    if (firstHitBall === null && !isBreakShot) {
      result.foul = true
      result.foulReason = '未碰到任何球（犯规）'
    }

    // 犯规判定：球组已分配后，第一个碰到的不是己方球
    if (firstHitBall !== null && currentPlayer.group !== BallGroup.NONE) {
      if (currentPlayer.group === BallGroup.SOLID && !isSolidBall(firstHitBall) && !isEightBall(firstHitBall)) {
        // 己方全色球未清完前先碰到花色球
        if (this.countRemainingBalls(balls, BallGroup.SOLID) > 0) {
          result.foul = true
          result.foulReason = '先碰到对方球（犯规）'
        }
      } else if (currentPlayer.group === BallGroup.STRIPE && !isStripeBall(firstHitBall) && !isEightBall(firstHitBall)) {
        if (this.countRemainingBalls(balls, BallGroup.STRIPE) > 0) {
          result.foul = true
          result.foulReason = '先碰到对方球（犯规）'
        }
      }
    }

    // 8号球进袋判定
    if (result.eightBallPocketed) {
      // 如果犯规同时8号进袋，直接判负
      if (result.foul) {
        // 已经是犯规了
      }
      // 如果己方球未清完就打进8号，判负
      if (currentPlayer.group !== BallGroup.NONE) {
        const remaining = this.countRemainingBalls(balls, currentPlayer.group)
        if (remaining > 0) {
          result.foul = true
          result.foulReason = '己方球未清完就打进8号球（犯规）'
        }
      }
    }

    return result
  }

  /**
   * 分配球组 — 中式八球规则：第一个合法进球决定球组
   *
   * ⚠️ 中式八球规则：开球进球不决定球组归属！
   * 只有开球后的第一个合法进球才决定球组。
   */
  assignGroups(
    pocketedBall: Ball,
    currentPlayer: Player,
    otherPlayer: Player,
    isBreakShot: boolean,
  ): boolean {
    // 开球进球不决定球组
    if (isBreakShot) return false

    // 只在球组未分配时分配
    if (currentPlayer.group !== BallGroup.NONE) return false

    // 第一个合法进球决定球组
    if (isSolidBall(pocketedBall.number)) {
      currentPlayer.group = BallGroup.SOLID
      otherPlayer.group = BallGroup.STRIPE
      return true
    } else if (isStripeBall(pocketedBall.number)) {
      currentPlayer.group = BallGroup.STRIPE
      otherPlayer.group = BallGroup.SOLID
      return true
    }

    // 8号球进球不分配球组
    return false
  }

  /**
   * 判定是否获胜
   * @returns 获胜玩家index，null表示未获胜
   */
  checkWin(
    balls: Ball[],
    currentPlayer: Player,
    otherPlayer: Player,
    turnResult: TurnResult,
  ): { winner: number; reason: string } | null {
    // 8号球犯规判负（对方获胜）
    if (turnResult.eightBallPocketed && turnResult.foul) {
      return { winner: otherPlayer.index, reason: '8号球犯规' }
    }

    // 己方球未清完打进8号判负
    if (turnResult.eightBallPocketed && currentPlayer.group !== BallGroup.NONE) {
      const remaining = this.countRemainingBalls(balls, currentPlayer.group)
      if (remaining > 0) {
        return { winner: otherPlayer.index, reason: '己方球未清完打进8号' }
      }
    }

    // 白球进袋同时8号球进袋
    if (turnResult.cueBallPocketed && turnResult.eightBallPocketed) {
      return { winner: otherPlayer.index, reason: '白球和8号球同时进袋' }
    }

    // 合法打进8号球获胜
    if (turnResult.eightBallPocketed && !turnResult.foul && currentPlayer.group !== BallGroup.NONE) {
      const remaining = this.countRemainingBalls(balls, currentPlayer.group)
      if (remaining === 0) {
        return { winner: currentPlayer.index, reason: '合法打进8号球获胜' }
      }
    }

    return null
  }

  /**
   * 判定是否换手
   * 中式八球：犯规换手，未进球换手，合法进球继续
   */
  shouldSwitchTurn(turnResult: TurnResult, currentPlayer: Player): boolean {
    // 犯规换手
    if (turnResult.foul) return true

    // 球组未分配时，进球换手（因为无法确定是否进了己方球）
    if (currentPlayer.group === BallGroup.NONE) {
      // 进了8号以外的球，要分配球组，不换手
      if (turnResult.pocketedBalls.some(n => !isCueBall(n) && !isEightBall(n))) {
        return false
      }
      // 没进球，换手
      return turnResult.pocketedBalls.length === 0
    }

    // 检查是否进了己方球
    const ownBallPocketed = turnResult.pocketedBalls.some(n => {
      if (isCueBall(n) || isEightBall(n)) return false
      if (currentPlayer.group === BallGroup.SOLID) return isSolidBall(n)
      if (currentPlayer.group === BallGroup.STRIPE) return isStripeBall(n)
      return false
    })

    // 进了己方球不换手，否则换手
    return !ownBallPocketed
  }

  /** 计算剩余己方球数量 */
  countRemainingBalls(balls: Ball[], group: BallGroup): number {
    return balls.filter(ball => {
      if (!ball.active) return false
      if (group === BallGroup.SOLID) return isSolidBall(ball.number)
      if (group === BallGroup.STRIPE) return isStripeBall(ball.number)
      return false
    }).length
  }

  /** 更新玩家进球计数 */
  updatePlayerScore(balls: Ball[], player: Player): void {
    if (player.group === BallGroup.NONE) return
    player.pocketedCount = 7 - this.countRemainingBalls(balls, player.group)
  }
}
