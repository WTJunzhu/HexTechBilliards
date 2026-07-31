import type { Ball } from '../physics/Ball'

/**
 * 使用 Web Audio API 合成基础台球音效。
 *
 * 不依赖外部音频文件，因此不会增加部署资源；首次用户触摸/点击后调用
 * `unlock()` 即可满足浏览器的自动播放限制。
 */
export class AudioEngine {
  private context: AudioContext | null = null
  private enabled = true
  private lastCollisionAt = 0
  private lastPocketAt = 0

  async unlock(): Promise<void> {
    if (!this.enabled) return
    const context = this.getContext()
    if (context.state === 'suspended') {
      await context.resume()
    }
  }

  playCueShot(power: number): void {
    const volume = 0.035 + Math.min(power / 8, 1) * 0.075
    this.playTone(150, 0.045, volume, 'triangle', 0.65)
  }

  playBallCollision(ball1: Ball, ball2: Ball): void {
    const now = performance.now()
    if (now - this.lastCollisionAt < 36) return
    this.lastCollisionAt = now

    const impact = ball1.velocity.subtract(ball2.velocity).length
    const volume = Math.min(0.065, 0.012 + impact * 0.009)
    this.playTone(410 + Math.min(impact * 20, 260), 0.035, volume, 'square', 0.45)
  }

  playPocket(): void {
    const now = performance.now()
    if (now - this.lastPocketAt < 100) return
    this.lastPocketAt = now
    this.playTone(110, 0.16, 0.075, 'sine', 0.28)
    this.playTone(72, 0.24, 0.05, 'triangle', 0.35, 0.045)
  }

  private getContext(): AudioContext {
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext
        || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextConstructor) {
        this.enabled = false
        throw new Error('Web Audio API is not supported in this browser.')
      }
      this.context = new AudioContextConstructor()
    }
    return this.context
  }

  private playTone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    pitchDrop: number,
    delay = 0,
  ): void {
    if (!this.enabled) return

    try {
      const context = this.getContext()
      if (context.state !== 'running') return

      const startAt = context.currentTime + delay
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, startAt)
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(30, frequency * pitchDrop),
        startAt + duration,
      )
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + duration + 0.02)
    } catch {
      // 浏览器拒绝音频或上下文已被释放时静默降级，不影响游戏主循环。
      this.enabled = false
    }
  }
}
