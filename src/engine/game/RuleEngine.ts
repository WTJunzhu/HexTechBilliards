import type { Ball } from '../physics/Ball'
import { BallGroup } from './GameState'
import { POCKET_NAMES } from './GameState'
import type { TurnResult, Player, ShotInfo } from './GameState'
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
 * 3. 任何犯规后对手获得全桌自由球
 * 4. 打8号球犯规直接判负
 * 5. 开球打进8号球重新摆球开球
 * 6. 开球须至少 4 颗目标球碰库或有目标球落袋
 * 7. 碰到目标球后须有球落袋或碰库
 * 8. 打8号球须指定袋口，且须在本组清完后单独一杆打进
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
    shot: ShotInfo,
  ): TurnResult {
    const result: TurnResult = {
      pocketedBalls: [],
      foul: false,
      firstHitBall,
      cueBallPocketed: false,
      eightBallPocketed: false,
    }

    // 分类本回合进袋的球
    for (const ball of pocketedBallsThisFrame) {
      result.pocketedBalls.push(ball.number)
      if (isCueBall(ball.number)) result.cueBallPocketed = true
      if (isEightBall(ball.number)) result.eightBallPocketed = true
    }

    // 同一杆可能有多种犯规，只提示优先级最高的一条
    const foulReason = this.findFoul(result, balls, firstHitBall, currentPlayer, shot)
    if (foulReason) {
      result.foul = true
      result.foulReason = foulReason
    }

    return result
  }

  /**
   * 犯规判定，返回犯规原因（无犯规返回 null）
   *
   * 首碰规则（开球不受限制）：
   * - 未分组：任意全色/花色球均可，先碰8号犯规
   * - 已分组且本组未清完：必须先碰本组球
   * - 本组已清完：必须先碰8号球
   */
  private findFoul(
    result: TurnResult,
    balls: Ball[],
    firstHitBall: number | null,
    currentPlayer: Player,
    shot: ShotInfo,
  ): string | null {
    if (result.cueBallPocketed) return '白球进袋'
    if (firstHitBall === null) return '未碰到任何球'

    const objectBallPocketed = result.pocketedBalls.some(n => !isCueBall(n))
    if (shot.isBreakShot) {
      if (!objectBallPocketed && shot.objectBallsRailed < 4) return '开球不合法（须至少4颗球碰库或有球落袋）'
      return null
    }

    const firstHitFoul = this.findFirstHitFoul(result, balls, firstHitBall, currentPlayer)
    if (firstHitFoul) return firstHitFoul

    if (!objectBallPocketed && !shot.railAfterContact) return '碰球后无球落袋也无球碰库'
    return null
  }

  private findFirstHitFoul(
    result: TurnResult,
    balls: Ball[],
    firstHitBall: number,
    currentPlayer: Player,
  ): string | null {
    const group = currentPlayer.group
    if (group === BallGroup.NONE) {
      return isEightBall(firstHitBall) ? '未分组时先碰到8号球' : null
    }

    // 用击球前的剩余数判断：本杆打进本组最后一颗球时，首碰本组球仍然合法
    const remainingBefore = this.remainingBeforeShot(balls, group, result)

    if (remainingBefore > 0) {
      if (isEightBall(firstHitBall)) return '本组球未清完时先碰到8号球'
      if (!this.isGroupBall(firstHitBall, group)) return '先碰到对方球'
    } else if (!isEightBall(firstHitBall)) {
      return '本组球已清完，须先碰8号球'
    }
    return null
  }

  private isGroupBall(number: number, group: BallGroup): boolean {
    if (group === BallGroup.SOLID) return isSolidBall(number)
    if (group === BallGroup.STRIPE) return isStripeBall(number)
    return false
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
   * 判定是否获胜（仅在8号球进袋时分出胜负）
   *
   * 开球打进8号球不在此处理，由调用方重新摆球开球。
   * @returns 获胜玩家index，null表示未分出胜负
   */
  checkWin(
    balls: Ball[],
    currentPlayer: Player,
    otherPlayer: Player,
    turnResult: TurnResult,
    shot: ShotInfo,
  ): { winner: number; reason: string } | null {
    if (!turnResult.eightBallPocketed) return null

    const lose = (reason: string) => ({ winner: otherPlayer.index, reason })

    if (currentPlayer.group === BallGroup.NONE) {
      return lose('未分组时打进8号球')
    }
    // 击球前本组还有球：包括本组最后一颗与8号球同杆落袋
    if (this.remainingBeforeShot(balls, currentPlayer.group, turnResult) > 0) {
      return lose('本组球未清完就打进8号球')
    }
    if (turnResult.foul) {
      return lose(`打进8号球时犯规（${turnResult.foulReason}）`)
    }
    if (shot.calledPocket === null) {
      return lose('打8号球未指定袋口')
    }
    if (shot.eightBallPocket !== shot.calledPocket) {
      return lose(`8号球未进指定的${POCKET_NAMES[shot.calledPocket]}`)
    }
    return { winner: currentPlayer.index, reason: '合法打进8号球获胜' }
  }

  /** 击球前本组剩余球数 = 当前剩余 + 本杆打进的本组球 */
  private remainingBeforeShot(balls: Ball[], group: BallGroup, result: TurnResult): number {
    const pocketedOwn = result.pocketedBalls.filter(n => this.isGroupBall(n, group)).length
    return this.countRemainingBalls(balls, group) + pocketedOwn
  }

  /** 该玩家下一杆是否需要指定8号球袋口（本组已清完） */
  needsCalledPocket(balls: Ball[], player: Player): boolean {
    return player.group !== BallGroup.NONE && this.countRemainingBalls(balls, player.group) === 0
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

    // 进了己方球不换手，否则换手
    const ownBallPocketed = turnResult.pocketedBalls.some(n => this.isGroupBall(n, currentPlayer.group))
    return !ownBallPocketed
  }

  /** 计算剩余己方球数量 */
  countRemainingBalls(balls: Ball[], group: BallGroup): number {
    return balls.filter(ball => ball.active && this.isGroupBall(ball.number, group)).length
  }

  /**
   * 当前玩家可以合法首碰的球：未分组时为除8号外的所有目标球，
   * 已分组时为本组剩余球，本组清完后为8号球
   */
  getTargetBalls(balls: Ball[], player: Player): Ball[] {
    const onTable = balls.filter(ball => ball.active && !ball.isCue)
    if (player.group === BallGroup.NONE) return onTable.filter(ball => !ball.isEight)
    const own = onTable.filter(ball => this.isGroupBall(ball.number, player.group))
    return own.length > 0 ? own : onTable.filter(ball => ball.isEight)
  }

  /** 更新玩家进球计数 */
  updatePlayerScore(balls: Ball[], player: Player): void {
    if (player.group === BallGroup.NONE) return
    player.pocketedCount = 7 - this.countRemainingBalls(balls, player.group)
  }
}
