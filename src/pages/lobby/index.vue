<template>
  <view class="lobby-page">
    <!-- 顶部标题 -->
    <view class="lobby-header">
      <text class="lobby-title">🎱 在线对战大厅</text>
    </view>

    <!-- 玩家名称输入 -->
    <view class="name-input-area" v-if="step === 'input_name'">
      <view class="back-home-btn" @tap="goHome">
        <text style="color: #8888aa; font-size: 24rpx;">&larr; 返回首页</text>
      </view>
      <view class="input-card">
        <text class="input-label">输入你的昵称</text>
        <input
          class="name-input"
          v-model="playerName"
          placeholder="请输入昵称"
          maxlength="12"
          :focus="true"
        />
        <view class="input-btn" @tap="confirmName">
          <text style="color: #fff; font-size: 28rpx;">确认</text>
        </view>
      </view>
    </view>

    <!-- 选择操作：创建 / 加入 -->
    <view class="action-area" v-if="step === 'choose_action'">
      <view class="action-card create-card" @tap="onCreateRoom">
        <text class="action-icon">🏠</text>
        <text class="action-title">创建房间</text>
        <text class="action-desc">生成房间号，邀请好友加入</text>
      </view>

      <view class="action-card join-card" @tap="step = 'join_room'">
        <text class="action-icon">🚪</text>
        <text class="action-title">加入房间</text>
        <text class="action-desc">输入房间号，加入好友的房间</text>
      </view>

      <view class="back-btn" @tap="step = 'input_name'">
        <text style="color: #8888aa; font-size: 24rpx;">← 返回修改昵称</text>
      </view>
    </view>

    <!-- 加入房间 - 输入房间号 -->
    <view class="join-area" v-if="step === 'join_room'">
      <view class="input-card">
        <text class="input-label">输入房间号</text>
        <input
          class="room-input"
          v-model="inputRoomId"
          placeholder="6位数字房间号"
          type="number"
          maxlength="6"
          :focus="true"
        />
        <view class="join-btns">
          <view class="input-btn secondary" @tap="step = 'choose_action'">
            <text style="color: #aaa; font-size: 26rpx;">取消</text>
          </view>
          <view class="input-btn" @tap="onJoinRoom">
            <text style="color: #fff; font-size: 26rpx;">加入</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 等待房间 - 房主视角 -->
    <view class="waiting-area" v-if="step === 'waiting_host'">
      <view class="waiting-card">
        <text class="waiting-title">房间已创建</text>
        <view class="room-id-display">
          <text class="room-id-label">房间号</text>
          <text class="room-id-value">{{ roomId }}</text>
        </view>
        <text class="waiting-hint">将房间号分享给好友即可开始对战</text>

        <!-- 玩家列表 -->
        <view class="player-list">
          <view class="player-row" :class="{ ready: true }">
            <text class="player-row-name">🏠 {{ playerName }}（你）</text>
            <text class="player-row-status ready-text">房主</text>
          </view>
          <view class="player-row" v-if="opponentName">
            <text class="player-row-name">🎮 {{ opponentName }}</text>
            <text class="player-row-status" :class="opponentReady ? 'ready-text' : 'waiting-text'">
              {{ opponentReady ? '已准备' : '未准备' }}
            </text>
          </view>
          <view class="player-row empty-row" v-else>
            <text class="player-row-name" style="color: #555;">等待对手加入...</text>
          </view>
        </view>

        <!-- 操作按钮 -->
        <view class="waiting-actions" v-if="opponentName && opponentReady">
          <view class="input-btn start-btn" @tap="onStartGame">
            <text style="color: #fff; font-size: 30rpx;">⚔️ 开始游戏！</text>
          </view>
        </view>

        <view class="waiting-actions" v-else-if="opponentName && !opponentReady">
          <text class="waiting-hint">等待对手准备...</text>
        </view>

        <view class="waiting-actions" v-else>
          <text class="waiting-hint pulse">等待对手加入房间...</text>
        </view>

        <!-- 准备按钮 -->
        <view class="ready-area" v-if="opponentName && !isReady">
          <view class="input-btn ready-btn" @tap="onReady">
            <text style="color: #fff; font-size: 28rpx;">✋ 准备</text>
          </view>
        </view>

        <!-- 离开房间 -->
        <view class="leave-btn" @tap="onLeaveRoom">
          <text style="color: #ff6b6b; font-size: 24rpx;">离开房间</text>
        </view>
      </view>
    </view>

    <!-- 等待房间 - 加入者视角 -->
    <view class="waiting-area" v-if="step === 'waiting_guest'">
      <view class="waiting-card">
        <text class="waiting-title">已加入房间</text>
        <view class="room-id-display">
          <text class="room-id-label">房间号</text>
          <text class="room-id-value">{{ roomId }}</text>
        </view>

        <!-- 玩家列表 -->
        <view class="player-list">
          <view class="player-row" v-if="opponentName">
            <text class="player-row-name">🏠 {{ opponentName }}（房主）</text>
            <text class="player-row-status ready-text">房主</text>
          </view>
          <view class="player-row" :class="{ ready: isReady }">
            <text class="player-row-name">🎮 {{ playerName }}（你）</text>
            <text class="player-row-status" :class="isReady ? 'ready-text' : 'waiting-text'">
              {{ isReady ? '已准备' : '未准备' }}
            </text>
          </view>
        </view>

        <!-- 准备按钮 -->
        <view class="ready-area" v-if="!isReady">
          <view class="input-btn ready-btn" @tap="onReady">
            <text style="color: #fff; font-size: 28rpx;">✋ 准备</text>
          </view>
        </view>

        <view v-else>
          <text class="waiting-hint pulse">已准备，等待房主开始游戏...</text>
        </view>

        <!-- 离开房间 -->
        <view class="leave-btn" @tap="onLeaveRoom">
          <text style="color: #ff6b6b; font-size: 24rpx;">离开房间</text>
        </view>
      </view>
    </view>

    <!-- 连接状态指示 -->
    <view class="connection-status">
      <text class="status-dot" :class="connectionState"></text>
      <text class="status-text">{{ connectionStateText }}</text>
    </view>

    <!-- 错误提示 -->
    <view class="error-toast" v-if="errorMessage">
      <text style="color: #ff6b6b; font-size: 26rpx;">{{ errorMessage }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getNetworkManager, resetNetworkManager } from '../../network/NetworkManager'
import type { NetworkEvent } from '../../network/types'

type Step = 'input_name' | 'choose_action' | 'join_room' | 'waiting_host' | 'waiting_guest'

const step = ref<Step>('input_name')
const playerName = ref('')
const inputRoomId = ref('')
const roomId = ref('')
const isHost = ref(false)
const isReady = ref(false)
const opponentName = ref('')
const opponentReady = ref(false)
const connectionState = ref<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected')
const errorMessage = ref('')

let networkManager = getNetworkManager()

const connectionStateText = computed(() => {
  switch (connectionState.value) {
    case 'disconnected': return '未连接'
    case 'connecting': return '连接中...'
    case 'connected': return '已连接'
    case 'reconnecting': return '重连中...'
    default: return ''
  }
})

function clearError() {
  errorMessage.value = ''
}

function showError(msg: string) {
  errorMessage.value = msg
  setTimeout(clearError, 3000)
}

// ---- 事件处理 ----

function handleNetworkEvent(event: NetworkEvent) {
  switch (event.type) {
    case 'room_created':
      roomId.value = event.roomId
      step.value = 'waiting_host'
      break

    case 'room_joined':
      roomId.value = event.roomId
      isHost.value = false
      step.value = 'waiting_guest'
      // 如果房间里已有对手
      const other = event.players.find(p => p.playerId !== event.playerId)
      if (other) {
        opponentName.value = other.playerName
        opponentReady.value = other.ready
      }
      break

    case 'opponent_joined':
      opponentName.value = event.opponentName
      break

    case 'opponent_left':
      opponentName.value = ''
      opponentReady.value = false
      showError('对手已离开房间')
      break

    case 'opponent_ready':
      opponentReady.value = true
      break

    case 'game_started':
      // 跳转到 PvP 页面，携带在线模式参数
      uni.navigateTo({
        url: `/pages/pvp/index?mode=online&myIndex=${event.yourPlayerIndex}`
      })
      break

    case 'room_full':
      showError('房间已满')
      step.value = 'choose_action'
      break

    case 'room_not_found':
      showError('房间不存在')
      break

    case 'error':
      showError(event.message)
      break

    case 'connection_state':
      connectionState.value = event.state
      break

    case 'game_message':
      // 游戏消息在 PvP 页面处理
      break
  }
}

// ---- 用户操作 ----

function confirmName() {
  if (!playerName.value.trim()) {
    showError('请输入昵称')
    return
  }
  step.value = 'choose_action'
}

async function onCreateRoom() {
  try {
    connectionState.value = 'connecting'
    await networkManager.connect()
    networkManager.createRoom(playerName.value.trim())
    isHost.value = true
  } catch (err) {
    showError('连接服务器失败，请稍后再试')
  }
}

async function onJoinRoom() {
  const rid = inputRoomId.value.trim()
  if (!rid || rid.length !== 6 || !/^\d{6}$/.test(rid)) {
    showError('请输入6位数字房间号')
    return
  }

  try {
    connectionState.value = 'connecting'
    await networkManager.connect()
    networkManager.joinRoom(rid, playerName.value.trim())
  } catch (err) {
    showError('连接服务器失败，请稍后再试')
  }
}

function onReady() {
  isReady.value = true
  networkManager.ready()
}

function onStartGame() {
  networkManager.startGame()
}

function onLeaveRoom() {
  networkManager.leaveRoom()
  resetState()
  step.value = 'choose_action'
}

function goHome() {
  uni.navigateBack()
}

function resetState() {
  roomId.value = ''
  isHost.value = false
  isReady.value = false
  opponentName.value = ''
  opponentReady.value = ''
  connectionState.value = 'disconnected'
}

// ---- 生命周期 ----

onMounted(() => {
  networkManager = getNetworkManager()
  networkManager.onEvent(handleNetworkEvent)
})

onUnmounted(() => {
  networkManager.offEvent(handleNetworkEvent)
  // 如果没有在游戏中，断开连接
  if (step.value !== 'waiting_host' && step.value !== 'waiting_guest') {
    networkManager.disconnect()
  }
})
</script>

<style scoped>
.lobby-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #0d1117;
  padding: 0 30rpx;
}

.lobby-header {
  padding: 60rpx 0 30rpx;
  text-align: center;
}

.lobby-title {
  font-size: 44rpx;
  color: #e0e0ff;
  font-weight: bold;
}

/* 名称输入 */
.name-input-area,
.join-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-home-btn {
  margin-bottom: 20rpx;
  padding: 15rpx;
  text-align: center;
}

.input-card {
  width: 100%;
  max-width: 600rpx;
  background-color: #1a1a2e;
  border-radius: 20rpx;
  padding: 40rpx;
  border: 2rpx solid rgba(100, 100, 255, 0.2);
}

.input-label {
  font-size: 28rpx;
  color: #8888aa;
  margin-bottom: 20rpx;
  display: block;
}

.name-input,
.room-input {
  width: 100%;
  height: 80rpx;
  background-color: #16162a;
  border: 2rpx solid #333355;
  border-radius: 10rpx;
  padding: 0 20rpx;
  color: #e0e0ff;
  font-size: 30rpx;
  margin-bottom: 30rpx;
}

.input-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx 0;
  background-color: #0d47a1;
  border-radius: 10rpx;
  width: 100%;
}

.input-btn.secondary {
  background-color: #333355;
  flex: 1;
  margin-right: 20rpx;
}

.join-btns {
  display: flex;
  gap: 20rpx;
}

.join-btns .input-btn:not(.secondary) {
  flex: 1;
}

/* 选择操作 */
.action-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30rpx;
}

.action-card {
  width: 100%;
  max-width: 600rpx;
  padding: 40rpx;
  border-radius: 20rpx;
  background-color: #1a1a2e;
  border: 2rpx solid rgba(100, 100, 255, 0.2);
  text-align: center;
}

.action-card:active {
  transform: scale(0.98);
  border-color: rgba(100, 100, 255, 0.5);
}

.action-icon {
  font-size: 60rpx;
  display: block;
  margin-bottom: 15rpx;
}

.action-title {
  font-size: 36rpx;
  color: #e0e0ff;
  font-weight: bold;
  display: block;
  margin-bottom: 10rpx;
}

.action-desc {
  font-size: 22rpx;
  color: #8888aa;
  display: block;
}

.back-btn {
  margin-top: 20rpx;
  padding: 15rpx;
}

/* 等待房间 */
.waiting-area {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 40rpx;
}

.waiting-card {
  width: 100%;
  max-width: 600rpx;
  background-color: #1a1a2e;
  border-radius: 20rpx;
  padding: 40rpx;
  border: 2rpx solid rgba(100, 100, 255, 0.2);
}

.waiting-title {
  font-size: 36rpx;
  color: #e0e0ff;
  font-weight: bold;
  text-align: center;
  display: block;
  margin-bottom: 30rpx;
}

.room-id-display {
  text-align: center;
  margin-bottom: 30rpx;
}

.room-id-label {
  font-size: 22rpx;
  color: #8888aa;
  display: block;
  margin-bottom: 10rpx;
}

.room-id-value {
  font-size: 56rpx;
  color: #ffd700;
  font-weight: bold;
  letter-spacing: 12rpx;
  display: block;
}

.waiting-hint {
  font-size: 22rpx;
  color: #8888aa;
  text-align: center;
  display: block;
  margin: 20rpx 0;
}

.waiting-hint.pulse {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* 玩家列表 */
.player-list {
  margin: 20rpx 0;
}

.player-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 15rpx;
  border-radius: 10rpx;
  margin-bottom: 10rpx;
  background-color: #16162a;
}

.player-row.ready {
  border-left: 4rpx solid #4caf50;
}

.player-row-name {
  font-size: 26rpx;
  color: #e0e0ff;
}

.player-row-status {
  font-size: 22rpx;
}

.ready-text {
  color: #4caf50;
}

.waiting-text {
  color: #ff9800;
}

.empty-row {
  border: 2rpx dashed #333355;
  background-color: transparent;
}

/* 操作 */
.waiting-actions {
  margin-top: 20rpx;
  text-align: center;
}

.start-btn {
  background: linear-gradient(135deg, #0d47a1, #1565c0);
  margin-top: 15rpx;
}

.ready-area {
  margin-top: 20rpx;
}

.ready-btn {
  background-color: #2e7d32;
}

.leave-btn {
  margin-top: 25rpx;
  text-align: center;
  padding: 15rpx;
}

/* 连接状态 */
.connection-status {
  position: fixed;
  bottom: 40rpx;
  left: 30rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.status-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  display: inline-block;
}

.status-dot.disconnected {
  background-color: #666;
}

.status-dot.connecting {
  background-color: #ff9800;
  animation: pulse 1s ease-in-out infinite;
}

.status-dot.connected {
  background-color: #4caf50;
}

.status-dot.reconnecting {
  background-color: #ff9800;
  animation: pulse 1s ease-in-out infinite;
}

.status-text {
  font-size: 20rpx;
  color: #8888aa;
}

/* 错误提示 */
.error-toast {
  position: fixed;
  top: 60rpx;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(30, 30, 60, 0.95);
  padding: 20rpx 40rpx;
  border-radius: 10rpx;
  border: 2rpx solid rgba(255, 107, 107, 0.3);
  z-index: 100;
}
</style>
