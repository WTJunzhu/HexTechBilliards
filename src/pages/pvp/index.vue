<template>
  <view class="pvp-page">
    <!-- HUD -->
    <view class="game-hud">
      <view class="player-info left" :class="{ active: currentPlayerIndex === 0 }">
        <text class="player-name">{{ players[0].name }}</text>
        <text class="player-group" v-if="players[0].group !== 'none'">
          {{ players[0].group === 'solid' ? '全色球' : '花色球' }}
        </text>
        <text class="player-score">{{ players[0].pocketedCount }}/7</text>
        <text class="player-you" v-if="isOnlineMode && myPlayerIndex === 0">你</text>
      </view>

      <view class="turn-info">
        <text class="turn-text" v-if="foulMessage" style="color: #ff6b6b;">{{ foulMessage }}</text>
        <text class="turn-text" v-else-if="phase === 'ball_in_hand'" style="color: #ffd93d;">
          {{ isMyTurnInOnline ? '请放置白球' : '对手放置白球...' }}
        </text>
        <text class="turn-text" v-else-if="phase === 'game_over'" style="color: #6bcb77;">
          {{ winner !== null ? players[winner].name + ' 获胜!' : '' }}
        </text>
        <text class="turn-text" v-else-if="isOnlineMode && !isMyTurnInOnline" style="color: #8888aa;">
          等待对手击球...
        </text>
        <text class="turn-text" v-else>
          {{ players[currentPlayerIndex].name }} 的回合
        </text>
        <text class="turn-count">回合 {{ turnCount }}</text>
      </view>

      <view class="player-info right" :class="{ active: currentPlayerIndex === 1 }">
        <text class="player-name">{{ players[1].name }}</text>
        <text class="player-group" v-if="players[1].group !== 'none'">
          {{ players[1].group === 'solid' ? '全色球' : '花色球' }}
        </text>
        <text class="player-score">{{ players[1].pocketedCount }}/7</text>
        <text class="player-you" v-if="isOnlineMode && myPlayerIndex === 1">你</text>
      </view>
    </view>

    <!-- 在线状态条 -->
    <view class="online-status-bar" v-if="isOnlineMode">
      <text class="online-dot" :class="networkStatus"></text>
      <text class="online-status-text">{{ networkStatusText }}</text>
    </view>

    <!-- Canvas 游戏区域 -->
    <view class="canvas-container">
      <div class="canvas-wrapper" ref="canvasWrapper"></div>
    </view>

    <!-- 底部控制面板 -->
    <view class="bottom-panel">
      <!-- 蓄力条 -->
      <view class="power-bar-container" v-if="canAim && (phase === 'aiming' || phase === 'break_shot')">
        <view class="power-bar-bg">
          <view class="power-bar-fill" :style="{ width: powerPercent + '%' }"></view>
        </view>
        <text class="power-text">{{ Math.round(powerPercent) }}%</text>
      </view>
      <!-- 非瞄准时显示提示 -->
      <view class="power-bar-container placeholder" v-else>
        <text class="power-placeholder">{{ phaseHint }}</text>
      </view>

      <view class="bottom-controls">
        <!-- 击球部位选择器 -->
        <view class="spin-selector">
          <text class="spin-label">击球部位</text>
          <view class="spin-grid">
            <view class="spin-cell" :class="{ active: spinType === 'topLeft' }" @tap="spinType = 'topLeft'"></view>
            <view class="spin-cell" :class="{ active: spinType === 'top' }" @tap="spinType = 'top'"></view>
            <view class="spin-cell" :class="{ active: spinType === 'topRight' }" @tap="spinType = 'topRight'"></view>
            <view class="spin-cell" :class="{ active: spinType === 'left' }" @tap="spinType = 'left'"></view>
            <view class="spin-center" :class="{ active: spinType === 'center' }" @tap="spinType = 'center'"></view>
            <view class="spin-cell" :class="{ active: spinType === 'right' }" @tap="spinType = 'right'"></view>
            <view class="spin-cell" :class="{ active: spinType === 'bottomLeft' }" @tap="spinType = 'bottomLeft'"></view>
            <view class="spin-cell" :class="{ active: spinType === 'bottom' }" @tap="spinType = 'bottom'"></view>
            <view class="spin-cell" :class="{ active: spinType === 'bottomRight' }" @tap="spinType = 'bottomRight'"></view>
          </view>
        </view>

        <!-- 已进球展示 -->
        <view class="pocketed-display">
          <view class="pocketed-row">
            <text class="pocketed-label">全色</text>
            <view class="pocketed-balls-row">
              <view class="mini-ball" v-for="b in solidPocketedBalls" :key="b.number"
                :style="{ backgroundColor: b.color }">
                <text class="mini-ball-num">{{ b.number }}</text>
              </view>
            </view>
          </view>
          <view class="pocketed-row">
            <text class="pocketed-label">花色</text>
            <view class="pocketed-balls-row">
              <view class="mini-ball stripe" v-for="b in stripePocketedBalls" :key="b.number"
                :style="{ borderColor: b.color }">
                <text class="mini-ball-num">{{ b.number }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 游戏结束弹窗 -->
    <view class="game-over-overlay" v-if="phase === 'game_over'">
      <view class="game-over-card">
        <text class="game-over-title">游戏结束</text>
        <text class="game-over-winner">{{ players[winner!].name }} 获胜!</text>
        <text class="game-over-reason">{{ winReason }}</text>
        <view class="game-over-btn" @tap="restart" v-if="!isOnlineMode">
          <text style="color: #fff; font-size: 30rpx;">再来一局</text>
        </view>
        <view class="game-over-btn secondary" @tap="goHome">
          <text style="color: #aaa; font-size: 30rpx;">返回首页</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import { CanvasRenderer } from '../../engine/renderer/CanvasRenderer'
import { CueController } from '../../engine/input/CueController'
import { Vector2 } from '../../engine/physics/Vector2'
import { TABLE_WIDTH, TABLE_HEIGHT, CUSHION_WIDTH, BallColor, isSolidBall, isStripeBall } from '../../engine/physics/TableSpec'

type SpinType = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

const gameStore = useGameStore()
const renderer = new CanvasRenderer()
const cueController = new CueController()

const powerPercent = ref(0)
const spinType = ref<SpinType>('center')
const canvasWrapper = ref<HTMLElement | null>(null)
let animationFrameId = 0
let canvasReady = false
let canvasEl: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let scale = 1
let logicalWidth = 0
let logicalHeight = 0

// 从store访问
const phase = gameStore.phase
const players = gameStore.players
const currentPlayerIndex = gameStore.currentPlayerIndex
const turnCount = gameStore.turnCount
const winner = gameStore.winner
const winReason = gameStore.winReason
const foulMessage = gameStore.foulMessage
const isOnlineMode = gameStore.isOnlineMode
const myPlayerIndex = gameStore.myPlayerIndex
const networkStatus = gameStore.networkStatus

/** 在线模式下是否是我的回合 */
const isMyTurnInOnline = computed(() => {
  if (!isOnlineMode.value) return true
  return gameStore.isMyTurn()
})

/** 是否可以瞄准/击球（在线模式下仅我的回合可操作） */
const canAim = computed(() => {
  if (!isOnlineMode.value) return true
  return gameStore.isMyTurn()
})

const networkStatusText = computed(() => {
  switch (networkStatus.value) {
    case 'connected': return '在线'
    case 'disconnected': return '断线'
    case 'reconnecting': return '重连中...'
    default: return ''
  }
})

/** 阶段提示文字 */
const phaseHint = computed(() => {
  switch (phase.value) {
    case 'moving': return '球在运动中...'
    case 'ball_in_hand': return isMyTurnInOnline.value ? '点击桌面放置白球' : '对手放置白球...'
    case 'game_over': return '游戏结束'
    default: return ''
  }
})

/** 已进袋的全色球 */
const solidPocketedBalls = computed(() => {
  return gameStore.physicsWorld.balls
    .filter(b => !b.active && isSolidBall(b.number))
    .map(b => ({ number: b.number, color: b.color }))
})

/** 已进袋的花色球 */
const stripePocketedBalls = computed(() => {
  return gameStore.physicsWorld.balls
    .filter(b => !b.active && isStripeBall(b.number))
    .map(b => ({ number: b.number, color: b.color }))
})

// ---- 页面参数解析 ----

function parsePageOptions() {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage?.options || currentPage?.$page?.options || {}

  if (options.mode === 'online' && options.myIndex !== undefined) {
    const myIndex = parseInt(options.myIndex, 10)
    gameStore.initOnlineMode(myIndex)
  } else {
    gameStore.initGame()
  }
}

onMounted(() => {
  parsePageOptions()
  nextTick(() => {
    setTimeout(() => {
      createCanvas()
      if (canvasReady) {
        gameLoop()
      }
    }, 300)
  })
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  if (gameStore.isOnlineMode) {
    gameStore.leaveOnlineMode()
  }
})

/** 创建原生Canvas元素并插入到容器中 */
function createCanvas() {
  if (!canvasWrapper.value) {
    console.error('[Canvas] Wrapper element not found')
    return
  }

  canvasWrapper.value.innerHTML = ''

  canvasEl = document.createElement('canvas')
  // Canvas 宽度 = 容器宽度，高度 = 容器高度（由CSS flex布局自动填满）
  const containerWidth = canvasWrapper.value.clientWidth || window.innerWidth
  const containerHeight = canvasWrapper.value.clientHeight || Math.floor(window.innerHeight * 0.6)

  logicalWidth = containerWidth
  logicalHeight = containerHeight

  const dpr = window.devicePixelRatio || 1
  canvasEl.width = logicalWidth * dpr
  canvasEl.height = logicalHeight * dpr
  canvasEl.style.width = logicalWidth + 'px'
  canvasEl.style.height = logicalHeight + 'px'
  canvasEl.style.display = 'block'
  canvasEl.style.touchAction = 'none'

  ctx = canvasEl.getContext('2d')!
  if (!ctx) {
    console.error('[Canvas] Failed to get 2d context')
    return
  }
  ctx.scale(dpr, dpr)

  const totalTableWidth = TABLE_WIDTH + CUSHION_WIDTH * 2
  scale = logicalWidth / (totalTableWidth + 4)

  renderer.init(ctx, logicalWidth, logicalHeight)
  canvasReady = true

  canvasWrapper.value.appendChild(canvasEl)

  console.log('[Canvas] Created native canvas:', logicalWidth, 'x', logicalHeight,
    'dpr:', dpr, 'scale:', scale.toFixed(2))

  // 事件监听
  canvasEl.addEventListener('mousedown', onMouseDown)
  canvasEl.addEventListener('mousemove', onMouseMove)
  canvasEl.addEventListener('mouseup', onMouseUp)
  canvasEl.addEventListener('touchstart', onTouchStart, { passive: false })
  canvasEl.addEventListener('touchmove', onTouchMove, { passive: false })
  canvasEl.addEventListener('touchend', onTouchEnd)

  // 击球回调
  cueController.onShoot = (power, angle) => {
    const currentPhase = gameStore.phase
    if (isOnlineMode.value && !gameStore.isMyTurn()) return
    if (currentPhase === 'aiming' || currentPhase === 'break_shot') {
      // 启动击球动画
      renderer.startShootAnimation()
      gameStore.shoot(power, angle)
    }
  }

  cueController.onUpdateAim = () => {
    if (isOnlineMode.value && !gameStore.isMyTurn()) return
    const cueBall = gameStore.physicsWorld.balls.find(b => b.isCue && b.active)
    renderer.aimLine = {
      start: cueBall?.position || Vector2.zero,
      end: cueController.getAimLineEnd(),
    }
  }

  cueController.onUpdatePower = (power) => {
    powerPercent.value = power * 100
  }
}

function gameLoop() {
  gameStore.update()
  if (canvasReady && ctx) {
    const currentPhase = gameStore.phase
    const isMyTurnNow = !isOnlineMode.value || gameStore.isMyTurn()
    const cueBall = gameStore.physicsWorld.balls.find(b => b.isCue && b.active)

    // 只在我的回合显示球杆和瞄准线（击球动画期间也显示）
    const isCueVisible = cueBall && isMyTurnNow && (
      currentPhase === 'aiming' || currentPhase === 'break_shot' || renderer.cueStick.shooting
    )

    if (isCueVisible) {
      renderer.cueStick.visible = true
      renderer.cueStick.position = cueBall!.position
      renderer.cueStick.angle = cueController.aimAngle
      renderer.cueStick.power = cueController.power
      renderer.spinType = spinType.value
    } else {
      if (!renderer.cueStick.shooting) {
        renderer.cueStick.visible = false
        renderer.aimLine = null
      }
    }

    renderer.render(gameStore.physicsWorld as any)
  }
  animationFrameId = requestAnimationFrame(gameLoop)
}

// === 输入处理 ===

function onMouseDown(e: MouseEvent) {
  if (isOnlineMode.value && !gameStore.isMyTurn()) return
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  handleInputStart(new Vector2(e.clientX - rect.left, e.clientY - rect.top))
}

function onMouseMove(e: MouseEvent) {
  if (isOnlineMode.value && !gameStore.isMyTurn()) return
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  handleInputMove(new Vector2(e.clientX - rect.left, e.clientY - rect.top))
}

function onMouseUp() {
  if (isOnlineMode.value && !gameStore.isMyTurn()) return
  handleInputEnd()
}

function onTouchStart(e: TouchEvent) {
  if (isOnlineMode.value && !gameStore.isMyTurn()) return
  e.preventDefault()
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  const touch = e.touches[0]
  handleInputStart(new Vector2(touch.clientX - rect.left, touch.clientY - rect.top))
}

function onTouchMove(e: TouchEvent) {
  if (isOnlineMode.value && !gameStore.isMyTurn()) return
  e.preventDefault()
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  const touch = e.touches[0]
  handleInputMove(new Vector2(touch.clientX - rect.left, touch.clientY - rect.top))
}

function onTouchEnd() {
  if (isOnlineMode.value && !gameStore.isMyTurn()) return
  handleInputEnd()
}

function handleInputStart(pixelPos: Vector2) {
  const gamePos = renderer.toGame(pixelPos)
  const currentPhase = gameStore.phase

  if (currentPhase === 'ball_in_hand') {
    gameStore.placeCueBall(gamePos)
  } else if (currentPhase === 'aiming' || currentPhase === 'break_shot') {
    const cueBall = gameStore.physicsWorld.balls.find(b => b.isCue && b.active)
    if (cueBall) {
      cueController.setCueBallPosition(cueBall.position)
      cueController.startAim(gamePos)
    }
  }
}

function handleInputMove(pixelPos: Vector2) {
  const currentPhase = gameStore.phase
  if (currentPhase !== 'aiming' && currentPhase !== 'break_shot') return

  const gamePos = renderer.toGame(pixelPos)

  if (cueController.isAiming && !cueController.isPowering) {
    const diff = gamePos.subtract(cueController.cueBallPosition)
    const dot = diff.normalized.dot(Vector2.fromAngle(cueController.aimAngle + Math.PI))
    if (dot > 0.5) {
      cueController.startPower()
    }
  }

  cueController.moveAim(gamePos)
}

function handleInputEnd() {
  if (cueController.isAiming || cueController.isPowering) {
    cueController.endShot()
  }
}

function restart() {
  gameStore.initGame()
}

function goHome() {
  if (gameStore.isOnlineMode) {
    gameStore.leaveOnlineMode()
  }
  uni.navigateBack()
}
</script>

<style scoped>
.pvp-page {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background-color: #0a0a14;
  overflow: hidden;
}

.game-hud {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6rpx 16rpx;
  height: 80rpx;
  background-color: rgba(20, 20, 40, 0.95);
  flex-shrink: 0;
  border-bottom: 1rpx solid rgba(100, 100, 255, 0.15);
}

.player-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  min-width: 140rpx;
}

.player-info.active {
  background-color: rgba(100, 100, 255, 0.2);
  border: 1rpx solid rgba(100, 100, 255, 0.5);
}

.player-name {
  font-size: 22rpx;
  color: #e0e0ff;
  font-weight: bold;
}

.player-group {
  font-size: 18rpx;
  color: #8888aa;
}

.player-score {
  font-size: 18rpx;
  color: #aaaacc;
}

.player-you {
  font-size: 16rpx;
  color: #4caf50;
  margin-top: 2rpx;
}

.turn-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.turn-text {
  font-size: 22rpx;
  color: #e0e0ff;
  font-weight: bold;
}

.turn-count {
  font-size: 16rpx;
  color: #666688;
}

/* 在线状态条 */
.online-status-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rpx 16rpx;
  background-color: rgba(20, 20, 40, 0.7);
  gap: 8rpx;
}

.online-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
}

.online-dot.connected { background-color: #4caf50; }
.online-dot.disconnected { background-color: #f44336; }
.online-dot.reconnecting {
  background-color: #ff9800;
  animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.online-status-text {
  font-size: 18rpx;
  color: #8888aa;
}

/* Canvas 区域 */
.canvas-container {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #0a0a14;
  min-height: 0;
  overflow: hidden;
}

.canvas-wrapper {
  width: 100%;
  height: 100%;
}

/* 底部面板 */
.bottom-panel {
  flex-shrink: 0;
  background-color: rgba(20, 20, 40, 0.95);
  border-top: 1rpx solid rgba(100, 100, 255, 0.15);
  padding: 6rpx 20rpx 10rpx;
}

/* 蓄力条 */
.power-bar-container {
  display: flex;
  align-items: center;
  padding: 4rpx 0;
  height: 36rpx;
}

.power-bar-container.placeholder {
  justify-content: center;
}

.power-bar-bg {
  flex: 1;
  height: 14rpx;
  background-color: #333355;
  border-radius: 7rpx;
  overflow: hidden;
}

.power-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #ff9800, #f44336);
  border-radius: 7rpx;
  transition: width 0.05s;
}

.power-text {
  margin-left: 12rpx;
  font-size: 20rpx;
  color: #e0e0ff;
  min-width: 50rpx;
}

.power-placeholder {
  font-size: 20rpx;
  color: #666688;
}

/* 底部控制区 */
.bottom-controls {
  display: flex;
  gap: 20rpx;
  padding-top: 8rpx;
}

/* 击球部位选择器 */
.spin-selector {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}

.spin-label {
  font-size: 18rpx;
  color: #8888aa;
  margin-bottom: 2rpx;
}

.spin-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 3rpx;
  width: 110rpx;
  height: 110rpx;
}

.spin-cell {
  width: 34rpx;
  height: 34rpx;
  border-radius: 3rpx;
  background-color: #1a1a30;
  border: 1rpx solid #333355;
}

.spin-cell.active {
  background-color: rgba(100, 100, 255, 0.4);
  border-color: rgba(100, 100, 255, 0.8);
}

.spin-center {
  width: 34rpx;
  height: 34rpx;
  border-radius: 17rpx;
  background-color: #1a1a30;
  border: 2rpx solid #444466;
}

.spin-center.active {
  background-color: rgba(255, 255, 255, 0.9);
  border-color: #ffffff;
}

/* 已进球展示 */
.pocketed-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-height: 0;
}

.pocketed-row {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.pocketed-label {
  font-size: 16rpx;
  color: #8888aa;
  min-width: 40rpx;
}

.pocketed-balls-row {
  display: flex;
  gap: 3rpx;
  flex-wrap: wrap;
}

.mini-ball {
  width: 28rpx;
  height: 28rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1a1a30;
  position: relative;
}

.mini-ball.stripe {
  background-color: #ffffff;
  border-width: 3rpx;
  border-style: solid;
}

.mini-ball-num {
  font-size: 14rpx;
  color: #000000;
  font-weight: bold;
}

/* 游戏结束弹窗 */
.game-over-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 100;
}

.game-over-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 50rpx;
  background-color: #1a1a2e;
  border-radius: 20rpx;
  border: 2rpx solid rgba(100, 100, 255, 0.3);
}

.game-over-title {
  font-size: 44rpx;
  color: #ffd700;
  margin-bottom: 20rpx;
}

.game-over-winner {
  font-size: 36rpx;
  color: #e0e0ff;
  margin-bottom: 10rpx;
}

.game-over-reason {
  font-size: 24rpx;
  color: #8888aa;
  margin-bottom: 40rpx;
}

.game-over-btn {
  padding: 20rpx 60rpx;
  background-color: #0d47a1;
  border-radius: 10rpx;
  margin-bottom: 15rpx;
}

.game-over-btn.secondary {
  background-color: #333355;
}
</style>
