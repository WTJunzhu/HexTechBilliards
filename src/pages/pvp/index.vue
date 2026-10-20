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
          {{ players[currentPlayerIndex].name }} 的回合{{ turnSuffix }}
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
      <!-- 瞄准操作：微调条 + 力度条 -->
      <view class="aim-controls" v-if="showAimControls">
        <view class="spin-picker" ref="spinPicker"
          @touchstart.stop.prevent="onSpinStart" @mousedown.stop.prevent="onSpinStart">
          <view class="spin-dot" :style="spinDotStyle"></view>
        </view>
        <view class="fine-tune" @touchstart.stop.prevent="onFineTuneStart" @mousedown.stop.prevent="onFineTuneStart">
          <view class="fine-tune-ticks" :style="{ backgroundPosition: fineTuneOffset + 'px 0' }"></view>
          <text class="control-label">◀ 微调 ▶</text>
        </view>
        <view class="power-track" ref="powerTrack"
          @touchstart.stop.prevent="onPowerStart" @mousedown.stop.prevent="onPowerStart">
          <view class="power-bar-fill" :style="{ width: powerPercent + '%' }"></view>
          <text class="control-label">{{ powerLabel }}</text>
        </view>
      </view>
      <!-- 自由球：拖动桌面移动白球，确认后放下 -->
      <view class="aim-controls" v-else-if="showPlacementControls">
        <text class="placement-hint">{{ placementValid ? '拖动桌面移动白球' : '该位置不可放置' }}</text>
        <view class="confirm-btn" :class="{ disabled: !placementValid }" @tap="confirmPlacement">
          <text>确认放置</text>
        </view>
      </view>
      <!-- 其他阶段显示提示 -->
      <view class="aim-controls placeholder" v-else>
        <text class="power-placeholder">{{ phaseHint }}</text>
      </view>

      <view class="bottom-controls">
        <!-- 双方剩余目标球 -->
        <view class="pocketed-display">
          <view class="pocketed-row" v-for="row in targetRows" :key="row.index"
            :class="{ current: row.index === currentPlayerIndex }">
            <text class="pocketed-label">{{ row.label }}</text>
            <view class="pocketed-balls-row">
              <view class="mini-ball" v-for="b in row.balls" :key="b.number"
                :class="{ stripe: b.stripe }"
                :style="b.stripe ? { borderColor: b.color } : { backgroundColor: b.color }">
                <text class="mini-ball-num">{{ b.number }}</text>
              </view>
              <text class="pocketed-empty" v-if="row.hint">{{ row.hint }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 本地双人换手确认：遮罩会阻断桌面上的所有操作 -->
    <view class="turn-handoff-overlay" v-if="showTurnHandoff">
      <view class="turn-handoff-card">
        <text class="turn-handoff-eyebrow">本地双人对战</text>
        <text class="turn-handoff-title">轮到 {{ players[currentPlayerIndex].name }}</text>
        <text class="turn-handoff-copy">请将设备交给对方后，再继续操作。</text>
        <view class="turn-handoff-btn" @tap="confirmTurnHandoff">
          <text>我已准备好</text>
        </view>
      </view>
    </view>

    <!-- 游戏结束弹窗 -->
    <view class="game-over-overlay" v-if="phase === 'game_over'">
      <view class="game-over-card">
        <text class="game-over-title">游戏结束</text>
        <text class="game-over-winner" v-if="winner !== null">{{ players[winner].name }} 获胜!</text>
        <text class="game-over-reason">{{ winReason }}</text>
        <view class="game-over-status" v-if="isOnlineMode && opponentDisconnected">
          <text>对手已断开连接</text>
        </view>
        <view class="game-over-btn" v-else-if="isOnlineMode && opponentRequestedRematch" @tap="acceptRematch">
          <text style="color: #fff; font-size: 30rpx;">接受再来一局</text>
        </view>
        <view class="game-over-status" v-else-if="isOnlineMode && rematchRequested">
          <text>已发送请求，等待对手确认...</text>
        </view>
        <view class="game-over-btn" v-else-if="isOnlineMode" @tap="requestRematch">
          <text style="color: #fff; font-size: 30rpx;">请求再来一局</text>
        </view>
        <view class="game-over-btn" @tap="restart" v-else>
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../../stores/gameStore'
import { CanvasRenderer } from '../../engine/renderer/CanvasRenderer'
import { CueController } from '../../engine/input/CueController'
import { AudioEngine } from '../../engine/audio/AudioEngine'
import { Vector2 } from '../../engine/physics/Vector2'
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, POCKETS, BREAK_LINE_X } from '../../engine/physics/TableSpec'
import { POCKET_NAMES } from '../../engine/game/GameState'

/** 点击袋口中心多远以内算选中该袋口（游戏单位） */
const POCKET_TAP_RADIUS = 5

const gameStore = useGameStore()
const renderer = new CanvasRenderer()
const cueController = new CueController()
const audioEngine = new AudioEngine()

const powerPercent = ref(0)
const fineTuneOffset = ref(0)
const powering = ref(false)
const spin = ref({ x: 0, y: 0 })
const spinPicker = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const placementValid = ref(false)
const showTurnHandoff = ref(false)
const canvasWrapper = ref<HTMLElement | null>(null)
const powerTrack = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
let animationFrameId = 0
let lastFrameTime = 0
let canvasReady = false
let canvasEl: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let logicalWidth = 0
let logicalHeight = 0

/** 当前进行中的拖动操作（桌面瞄准 / 摆放白球 / 微调 / 蓄力 / 选击球点） */
let activeDrag: 'table' | 'place' | 'breakCue' | 'fineTune' | 'power' | 'spin' | null = null
let spinPickerRect: DOMRect | null = null
let dragLastPixel = Vector2.zero
let powerTrackRect: DOMRect | null = null

// 从store访问（storeToRefs 保持响应式）
const {
  phase, players, currentPlayerIndex, turnCount, winner, winReason, foulMessage, calledPocket,
  isOnlineMode, myPlayerIndex, networkStatus,
  opponentDisconnected, rematchRequested, opponentRequestedRematch,
} = storeToRefs(gameStore)

/** 在线模式下是否是我的回合 */
const isMyTurnInOnline = computed(() => {
  if (!isOnlineMode.value) return true
  return currentPlayerIndex.value === myPlayerIndex.value
})

/** 是否可以操作（换手遮罩未显示，且在线模式下轮到我） */
const canAct = computed(() => !showTurnHandoff.value && isMyTurnInOnline.value)

const isAimPhase = computed(() => phase.value === 'aiming' || phase.value === 'break_shot')
const showAimControls = computed(() => canAct.value && isAimPhase.value)
const showPlacementControls = computed(() => canAct.value && phase.value === 'ball_in_hand')

/** 本组已清完、需要指定8号球袋口（依赖 turnCount/phase 刷新） */
const mustCallPocket = computed(() => {
  void turnCount.value
  void phase.value
  return isAimPhase.value && gameStore.needsCalledPocket()
})

const powerLabel = computed(() => {
  if (mustCallPocket.value && calledPocket.value === null) return '先点击袋口指定8号球'
  if (!powering.value) return '拖动蓄力 →'
  if (powerPercent.value < CueController.MIN_SHOT_POWER * 100) return '松手取消'
  return `力度 ${Math.round(powerPercent.value)}%`
})

/** 击球点红点位置：圆心为中杆，向上高杆、向下低杆 */
const spinDotStyle = computed(() => ({
  left: `${50 + spin.value.x * 40}%`,
  top: `${50 - spin.value.y * 40}%`,
}))

const networkStatusText = computed(() => {
  switch (networkStatus.value) {
    case 'connected': return '在线'
    case 'disconnected': return '断线'
    case 'reconnecting': return '重连中...'
    default: return ''
  }
})

/** 回合标题后缀：开球提示 / 指袋状态 */
const turnSuffix = computed(() => {
  if (phase.value === 'break_shot') return ' · 开球（可拖动白球）'
  if (mustCallPocket.value) {
    return calledPocket.value === null ? ' · 点击袋口指定8号球' : ` · 8号指定${POCKET_NAMES[calledPocket.value]}`
  }
  return ''
})

/** 阶段提示文字 */
const phaseHint = computed(() => {
  switch (phase.value) {
    case 'balls_moving': return '球在运动中...'
    case 'ball_in_hand': return isMyTurnInOnline.value ? '' : '对手放置白球...'
    case 'game_over': return '游戏结束'
    default: return isMyTurnInOnline.value ? '' : '等待对手击球...'
  }
})

/**
 * 双方剩余目标球（物理世界不是响应式的，依赖 turnCount/phase 在回合结束时刷新）
 * 未分组时提示分组规则；已分组显示本组剩余球，清完后显示 8 号
 */
const targetRows = computed(() => {
  void turnCount.value
  void phase.value
  return players.value.map(player => {
    const groupName = player.group === 'solid' ? '全色' : player.group === 'stripe' ? '花色' : '未分组'
    const balls = player.group === 'none'
      ? []
      : gameStore.ruleEngine.getTargetBalls(gameStore.physicsWorld.balls, player)
        .map(b => ({ number: b.number, color: b.color, stripe: b.isStripe }))
    return {
      index: player.index,
      label: `${player.name} · ${groupName}`,
      balls,
      hint: player.group === 'none' ? '开球后第一个合法进球决定球组' : '',
    }
  })
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
  showTurnHandoff.value = false
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('resize', onResize)
  nextTick(() => {
    setTimeout(() => {
      createCanvas()
      if (canvasReady) {
        enterPhase()
        gameLoop()
      }
    }, 300)
  })
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('resize', onResize)
  clearTimeout(resizeTimer)
  if (gameStore.isOnlineMode) {
    gameStore.leaveOnlineMode()
  }
})

/** 窗口尺寸或横竖屏变化后重建画布（防抖，等布局稳定） */
let resizeTimer: ReturnType<typeof setTimeout> | undefined
function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (!canvasReady) return
    // 中断进行中的拖动：旧画布坐标已失效
    activeDrag = null
    cueController.reset()
    powering.value = false
    powerPercent.value = 0
    createCanvas()
  }, 150)
}

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
  // 绝对定位：画布尺寸不参与布局，窗口缩小时容器能先缩小，再按新尺寸重建画布
  canvasEl.style.position = 'absolute'
  canvasEl.style.left = '0'
  canvasEl.style.top = '0'
  canvasEl.style.touchAction = 'none'

  ctx = canvasEl.getContext('2d')!
  if (!ctx) {
    console.error('[Canvas] Failed to get 2d context')
    return
  }
  ctx.scale(dpr, dpr)

  renderer.init(ctx, logicalWidth, logicalHeight)
  gameStore.physicsWorld.clearHooks()
  gameStore.physicsWorld.addPostCollisionHook((ball1, ball2) => audioEngine.playBallCollision(ball1, ball2))
  gameStore.physicsWorld.addPocketHook(() => audioEngine.playPocket())
  canvasReady = true

  canvasWrapper.value.appendChild(canvasEl)

  console.log('[Canvas] Created native canvas:', logicalWidth, 'x', logicalHeight, 'dpr:', dpr)

  // 鼠标 move/up 监听在 window 上，拖出画布后仍能收到
  canvasEl.addEventListener('mousedown', onCanvasMouseDown)
  canvasEl.addEventListener('touchstart', onCanvasTouchStart, { passive: false })

  // 击球回调
  cueController.onShoot = (power, angle, spinX, spinY) => {
    if (!canAct.value || !isAimPhase.value) return
    renderer.startShootAnimation()
    audioEngine.playCueShot(power)
    gameStore.shoot(power, angle, spinX, spinY)
  }
}

function gameLoop(now: number = performance.now()) {
  const frameSeconds = lastFrameTime ? (now - lastFrameTime) / 1000 : 0
  lastFrameTime = now
  gameStore.update(frameSeconds)
  if (canvasReady && ctx) {
    const cueBall = gameStore.physicsWorld.balls.find(b => b.isCue && b.active)

    // 轮到我操作时高亮可击打的目标球
    const showTargets = isMyTurnInOnline.value && !showTurnHandoff.value
      && (isAimPhase.value || phase.value === 'ball_in_hand')
    renderer.pocketCall = showTargets && mustCallPocket.value
      ? { called: calledPocket.value }
      : null
    renderer.breakArea = showTargets && phase.value === 'break_shot'
    renderer.highlightBalls = showTargets
      ? new Set(gameStore.ruleEngine.getTargetBalls(gameStore.physicsWorld.balls, gameStore.currentPlayer()).map(b => b.number))
      : new Set()

    // 瞄准阶段一直显示球杆和瞄准线（击球动画期间也显示球杆）
    if (cueBall && isMyTurnInOnline.value && isAimPhase.value && !showTurnHandoff.value) {
      cueController.setCueBallPosition(cueBall.position)
      renderer.cueStick.visible = true
      renderer.cueStick.position = cueBall.position
      renderer.cueStick.angle = cueController.aimAngle
      renderer.cueStick.power = cueController.power
      renderer.aimLine = { start: cueBall.position, end: cueController.getAimLineEnd() }
    } else {
      renderer.aimLine = null
      if (!renderer.cueStick.shooting) renderer.cueStick.visible = false
    }

    renderer.render(gameStore.physicsWorld)
  }
  animationFrameId = requestAnimationFrame(gameLoop)
}

// === 阶段切换 ===

/** 进入新阶段时重置输入，并准备默认瞄准方向 / 白球摆放位置 */
function enterPhase() {
  cueController.reset()
  activeDrag = null
  powering.value = false
  powerPercent.value = 0
  renderer.placementPreview = null
  // 每杆开始时击球点回到中杆
  cueController.setSpin(0, 0)
  spin.value = { x: 0, y: 0 }

  const cueBall = gameStore.physicsWorld.balls.find(b => b.isCue)
  if (!cueBall) return

  if (isAimPhase.value && cueBall.active) {
    cueController.setCueBallPosition(cueBall.position)
    aimAtNearestTarget(cueBall.position)
  } else if (phase.value === 'ball_in_hand' && isMyTurnInOnline.value) {
    const start = cueBall.active ? cueBall.position : new Vector2(BREAK_LINE_X, TABLE_HEIGHT / 2)
    setPlacementPreview(start)
  }
}

/** 默认瞄准离白球最近的可击打目标球 */
function aimAtNearestTarget(from: Vector2) {
  const targets = gameStore.ruleEngine.getTargetBalls(gameStore.physicsWorld.balls, gameStore.currentPlayer())
  let nearest: Vector2 | null = null
  for (const ball of targets) {
    if (!nearest || ball.position.distFrom(from) < nearest.distFrom(from)) nearest = ball.position
  }
  if (nearest) cueController.aimAt(nearest)
}

watch([phase, currentPlayerIndex], () => {
  if (canvasReady) enterPhase()
})

// 本地双人：换手时显示遮罩（开局和重开不显示）
watch(currentPlayerIndex, (nextPlayer, previousPlayer) => {
  if (isOnlineMode.value || nextPlayer === previousPlayer) return
  if (turnCount.value === 0 || phase.value === 'game_over') return
  showTurnHandoff.value = true
})

// === 自由球摆放 ===

function setPlacementPreview(position: Vector2) {
  // 限制在台面内，避免白球被拖出桌外
  const clamped = new Vector2(
    Math.min(Math.max(position.x, BALL_RADIUS), TABLE_WIDTH - BALL_RADIUS),
    Math.min(Math.max(position.y, BALL_RADIUS), TABLE_HEIGHT - BALL_RADIUS),
  )
  const valid = gameStore.isValidCueBallPosition(clamped)
  renderer.placementPreview = { position: clamped, valid }
  placementValid.value = valid
}

function confirmPlacement() {
  const preview = renderer.placementPreview
  if (!preview?.valid) return
  gameStore.placeCueBall(preview.position)
}

// === 画布输入 ===

function canvasPoint(clientX: number, clientY: number): Vector2 {
  const rect = canvasEl!.getBoundingClientRect()
  return new Vector2(clientX - rect.left, clientY - rect.top)
}

function onCanvasMouseDown(e: MouseEvent) {
  void audioEngine.unlock()
  handlePointerStart(canvasPoint(e.clientX, e.clientY))
}

function onCanvasTouchStart(e: TouchEvent) {
  void audioEngine.unlock()
  e.preventDefault()
  const touch = e.touches[0]
  handlePointerStart(canvasPoint(touch.clientX, touch.clientY))
}

function handlePointerStart(pixelPos: Vector2) {
  if (!canAct.value || activeDrag) return
  dragLastPixel = pixelPos

  if (phase.value === 'ball_in_hand') {
    activeDrag = 'place'
    return
  }
  if (!isAimPhase.value) return
  const gamePos = renderer.toGame(pixelPos)

  // 打8号球：点击袋口附近即指定袋口
  if (mustCallPocket.value) {
    const pocket = POCKETS.findIndex(p => p.holeCenter.distFrom(gamePos) < POCKET_TAP_RADIUS)
    if (pocket >= 0) {
      gameStore.callPocket(pocket)
      return
    }
  }

  // 开球前：按住白球可在开球线后拖动摆放
  const cueBall = gameStore.physicsWorld.balls.find(b => b.isCue && b.active)
  if (phase.value === 'break_shot' && cueBall && cueBall.position.distFrom(gamePos) < BALL_RADIUS * 2.5) {
    activeDrag = 'breakCue'
    setPlacementPreview(cueBall.position)
    return
  }

  {
    activeDrag = 'table'
    cueController.startTableDrag(renderer.toGame(pixelPos), pixelPos)
  }
}

// === 微调条 / 力度条输入 ===

function eventClientPoint(e: TouchEvent | MouseEvent): Vector2 {
  const point = 'touches' in e ? (e.touches[0] ?? e.changedTouches[0]) : e
  return new Vector2(point.clientX, point.clientY)
}

function onFineTuneStart(e: TouchEvent | MouseEvent) {
  void audioEngine.unlock()
  if (!showAimControls.value || activeDrag) return
  activeDrag = 'fineTune'
  dragLastPixel = eventClientPoint(e)
}

function onSpinStart(e: TouchEvent | MouseEvent) {
  void audioEngine.unlock()
  if (!showAimControls.value || activeDrag) return
  const picker = spinPicker.value
  const el = (picker && '$el' in picker ? picker.$el : picker) as HTMLElement | null
  spinPickerRect = el?.getBoundingClientRect() ?? null
  activeDrag = 'spin'
  updateSpin(eventClientPoint(e))
}

/** 按手指在击球点选择器中的位置设置塞 */
function updateSpin(client: Vector2) {
  const rect = spinPickerRect
  if (!rect) return
  const radius = rect.width * 0.4
  const x = (client.x - (rect.left + rect.width / 2)) / radius
  const y = -(client.y - (rect.top + rect.height / 2)) / radius
  cueController.setSpin(x, y)
  spin.value = { x: cueController.spinX, y: cueController.spinY }
}

function onPowerStart(e: TouchEvent | MouseEvent) {
  void audioEngine.unlock()
  if (!showAimControls.value || activeDrag) return
  if (mustCallPocket.value && calledPocket.value === null) return
  const track = powerTrack.value
  const el = (track && '$el' in track ? track.$el : track) as HTMLElement | null
  powerTrackRect = el?.getBoundingClientRect() ?? null
  activeDrag = 'power'
  dragLastPixel = eventClientPoint(e)
  cueController.startPower()
  powering.value = true
  powerPercent.value = 0
}

// === 统一的拖动处理（触摸在 document 上监听，鼠标在 window 上监听） ===

function handleDragMove(client: Vector2, canvasPixel: Vector2 | null) {
  switch (activeDrag) {
    case 'table':
      if (canvasPixel) cueController.moveTableDrag(renderer.toGame(canvasPixel), canvasPixel)
      break
    case 'place':
    case 'breakCue': {
      if (!canvasPixel || !renderer.placementPreview) break
      // 相对拖动：手指不必压在白球上，避免遮挡
      const delta = renderer.toGame(canvasPixel).subtract(renderer.toGame(dragLastPixel))
      setPlacementPreview(renderer.placementPreview.position.add(delta))
      dragLastPixel = canvasPixel
      break
    }
    case 'fineTune': {
      const dx = client.x - dragLastPixel.x
      cueController.fineTune(dx)
      fineTuneOffset.value += dx
      dragLastPixel = client
      break
    }
    case 'spin':
      updateSpin(client)
      break
    case 'power': {
      // 从按下位置向右拖，拖满力度条宽度 = 满力；拖回起点 = 取消
      const width = Math.max(powerTrackRect?.width ?? 200, 1)
      cueController.setPower((client.x - dragLastPixel.x) / (width * 0.9))
      powerPercent.value = cueController.power * 100
      break
    }
  }
}

function handleDragEnd() {
  const drag = activeDrag
  activeDrag = null
  if (drag === 'table') cueController.endTableDrag()
  if (drag === 'breakCue') {
    // 松手时位置合法就放下，否则白球留在原位
    const preview = renderer.placementPreview
    if (preview?.valid) gameStore.placeCueBall(preview.position)
    renderer.placementPreview = null
  }
  if (drag === 'power') {
    cueController.releasePower()
    powering.value = false
    powerPercent.value = 0
  }
}

function onMouseMove(e: MouseEvent) {
  if (!activeDrag) return
  const client = new Vector2(e.clientX, e.clientY)
  handleDragMove(client, canvasEl ? canvasPoint(e.clientX, e.clientY) : null)
}

function onMouseUp() {
  if (activeDrag) handleDragEnd()
}

function onDocumentTouchMove(e: TouchEvent) {
  if (!activeDrag) return
  e.preventDefault()
  const touch = e.touches[0]
  handleDragMove(new Vector2(touch.clientX, touch.clientY), canvasEl ? canvasPoint(touch.clientX, touch.clientY) : null)
}

function onDocumentTouchEnd(e: TouchEvent) {
  if (activeDrag && e.touches.length === 0) handleDragEnd()
}

document.addEventListener('touchmove', onDocumentTouchMove, { passive: false })
document.addEventListener('touchend', onDocumentTouchEnd)
document.addEventListener('touchcancel', onDocumentTouchEnd)
onUnmounted(() => {
  document.removeEventListener('touchmove', onDocumentTouchMove)
  document.removeEventListener('touchend', onDocumentTouchEnd)
  document.removeEventListener('touchcancel', onDocumentTouchEnd)
})

function confirmTurnHandoff() {
  showTurnHandoff.value = false
}

function restart() {
  showTurnHandoff.value = false
  gameStore.initGame()
}

function requestRematch() {
  gameStore.requestRematch()
}

function acceptRematch() {
  gameStore.acceptRematch()
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
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* 底部面板 */
.bottom-panel {
  flex-shrink: 0;
  background-color: rgba(20, 20, 40, 0.95);
  border-top: 1rpx solid rgba(100, 100, 255, 0.15);
  padding: 6rpx 20rpx calc(10rpx + env(safe-area-inset-bottom));
}

/* 击球点选择器：白球示意图，红点为杆头击球位置 */
.spin-picker {
  position: relative;
  flex-shrink: 0;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ffffff, #d8d8e0 70%, #a0a0b0);
  touch-action: none;
}

.spin-dot {
  position: absolute;
  width: 14rpx;
  height: 14rpx;
  margin: -7rpx 0 0 -7rpx;
  border-radius: 50%;
  background-color: #e53935;
  box-shadow: 0 0 4rpx rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

/* 瞄准操作区：微调条 + 力度条 */
.aim-controls {
  display: flex;
  align-items: center;
  gap: 16rpx;
  height: 72rpx;
}

.aim-controls.placeholder {
  justify-content: center;
}

.fine-tune,
.power-track {
  position: relative;
  height: 64rpx;
  border-radius: 12rpx;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #262645;
  border: 1rpx solid rgba(100, 100, 255, 0.3);
  touch-action: none;
  user-select: none;
}

.fine-tune {
  flex: 2;
}

.power-track {
  flex: 3;
}

.fine-tune-ticks {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.18) 0 1px, transparent 1px 10px);
}

.power-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #4caf50, #ff9800, #f44336);
}

.control-label {
  position: relative;
  font-size: 22rpx;
  color: #e0e0ff;
  pointer-events: none;
}

.placement-hint {
  flex: 1;
  font-size: 22rpx;
  color: #ffd93d;
}

.confirm-btn {
  padding: 14rpx 36rpx;
  border-radius: 12rpx;
  background-color: #4caf50;
  color: #fff;
  font-size: 24rpx;
}

.confirm-btn.disabled {
  background-color: #444466;
  color: #888;
}

.power-placeholder {
  font-size: 20rpx;
  color: #666688;
}

/* 底部控制区 */
.bottom-controls {
  display: flex;
  padding-top: 8rpx;
}

/* 已进球展示 */
.pocketed-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-height: 0;
}

.pocketed-row.current .pocketed-label {
  color: #ffd93d;
}

.pocketed-empty {
  font-size: 18rpx;
  color: #666688;
}

.pocketed-row {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.pocketed-label {
  font-size: 18rpx;
  color: #8888aa;
  min-width: 150rpx;
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

/* 本地双人换手确认 */
.turn-handoff-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  background: rgba(4, 7, 16, 0.9);
  backdrop-filter: blur(8px);
}

.turn-handoff-card {
  width: min(560rpx, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 54rpx 42rpx 42rpx;
  border: 2rpx solid rgba(123, 158, 255, 0.4);
  border-radius: 24rpx;
  background: linear-gradient(145deg, #202445, #11152b);
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.45);
}

.turn-handoff-eyebrow {
  color: #8ea8ff;
  font-size: 22rpx;
  letter-spacing: 3rpx;
}

.turn-handoff-title {
  margin-top: 18rpx;
  color: #f1f4ff;
  font-size: 42rpx;
  font-weight: bold;
}

.turn-handoff-copy {
  margin-top: 18rpx;
  color: #adb6d9;
  font-size: 25rpx;
  text-align: center;
}

.turn-handoff-btn {
  width: 100%;
  margin-top: 44rpx;
  padding: 22rpx 0;
  border-radius: 12rpx;
  background: linear-gradient(90deg, #315ccf, #5a7cf0);
  color: #fff;
  font-size: 30rpx;
  font-weight: bold;
  text-align: center;
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

.game-over-status {
  margin-bottom: 28rpx;
  color: #aeb8dd;
  font-size: 24rpx;
  text-align: center;
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
