<template>
  <view class="home-page">
    <view class="title-area">
      <text class="game-title">🎱 HexTechBilliards</text>
      <text class="game-subtitle">海克斯科技台球</text>
    </view>

    <view class="mode-buttons">
      <view class="mode-btn online-btn" @tap="startOnline">
        <text class="mode-icon">🌐</text>
        <text class="mode-name">在线对战</text>
        <text class="mode-desc">远程联机 · 创建/加入房间</text>
      </view>

      <view class="mode-btn ai-btn">
        <text class="mode-icon">🤖</text>
        <text class="mode-name">人机对战</text>
        <view class="difficulty-row">
          <view class="difficulty-btn" v-for="d in difficulties" :key="d.key" @tap="startAI(d.key)">
            <text>{{ d.label }}</text>
          </view>
        </view>
      </view>

      <view class="mode-btn practice-btn" @tap="startPractice">
        <text class="mode-icon">🎯</text>
        <text class="mode-name">练习模式</text>
        <text class="mode-desc">单人自由击球 · 不判犯规</text>
      </view>

      <view class="mode-btn pvp-btn" @tap="startLocalPvP">
        <text class="mode-icon">⚔️</text>
        <text class="mode-name">本地对战</text>
        <text class="mode-desc">双人同屏 · 传递手机</text>
      </view>

      <view class="mode-btn boss-btn" @tap="comingSoon">
        <text class="mode-icon">👾</text>
        <text class="mode-name">BOSS挑战</text>
        <text class="mode-desc">肉鸽模式（开发中）</text>
      </view>
    </view>

    <view class="footer">
      <text class="footer-text">中式八球 · 人机 / 练习 / 本地 / 在线</text>
    </view>
  </view>
</template>

<script setup lang="ts">
function startOnline() {
  uni.navigateTo({ url: '/pages/lobby/index' })
}

const difficulties = [
  { key: 'easy', label: '简单' },
  { key: 'normal', label: '普通' },
  { key: 'hard', label: '困难' },
]

function startLocalPvP() {
  uni.navigateTo({ url: '/pages/pvp/index?mode=local' })
}

function startAI(difficulty: string) {
  uni.navigateTo({ url: `/pages/pvp/index?mode=ai&difficulty=${difficulty}` })
}

function startPractice() {
  uni.navigateTo({ url: '/pages/pvp/index?mode=practice' })
}

function comingSoon() {
  uni.showToast({
    title: 'BOSS挑战模式开发中...',
    icon: 'none',
  })
}
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(180deg, #0d1117 0%, #1a1a2e 50%, #16213e 100%);
  padding: 40rpx;
}

.title-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 80rpx;
}

.game-title {
  font-size: 56rpx;
  font-weight: bold;
  color: #e0e0ff;
  text-shadow: 0 0 20rpx rgba(100, 100, 255, 0.5);
}

.game-subtitle {
  font-size: 28rpx;
  color: #8888aa;
  margin-top: 10rpx;
  letter-spacing: 4rpx;
}

.mode-buttons {
  display: flex;
  flex-direction: column;
  gap: 30rpx;
  width: 100%;
  max-width: 600rpx;
}

.mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx;
  border-radius: 20rpx;
  transition: all 0.3s;
}

.online-btn {
  background: linear-gradient(135deg, #0a3d2a 0%, #1b5e20 100%);
  border: 2rpx solid rgba(100, 255, 150, 0.3);
}

.online-btn:active {
  transform: scale(0.98);
  background: linear-gradient(135deg, #0d4a30 0%, #2e7d32 100%);
}

.pvp-btn {
  background: linear-gradient(135deg, #1a3a5c 0%, #0d47a1 100%);
  border: 2rpx solid rgba(100, 180, 255, 0.3);
}

.pvp-btn:active {
  transform: scale(0.98);
  background: linear-gradient(135deg, #0d3a6c 0%, #1565c0 100%);
}

.ai-btn {
  background: linear-gradient(135deg, #4a2a10 0%, #a35a12 100%);
  border: 2rpx solid rgba(255, 180, 100, 0.3);
}

.difficulty-row {
  display: flex;
  gap: 20rpx;
  margin-top: 8rpx;
}

.difficulty-btn {
  padding: 10rpx 32rpx;
  border-radius: 12rpx;
  background-color: rgba(0, 0, 0, 0.3);
  border: 1rpx solid rgba(255, 255, 255, 0.25);
  color: #fff;
  font-size: 26rpx;
}

.difficulty-btn:active {
  background-color: rgba(255, 255, 255, 0.2);
}

.practice-btn {
  background: linear-gradient(135deg, #10404a 0%, #00838f 100%);
  border: 2rpx solid rgba(100, 230, 255, 0.3);
}

.practice-btn:active {
  transform: scale(0.98);
}

.boss-btn {
  background: linear-gradient(135deg, #3a1a3c 0%, #6a1b9a 100%);
  border: 2rpx solid rgba(200, 100, 255, 0.3);
  opacity: 0.7;
}

.mode-icon {
  font-size: 60rpx;
  margin-bottom: 10rpx;
}

.mode-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #ffffff;
  margin-bottom: 8rpx;
}

.mode-desc {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.6);
}

.footer {
  margin-top: 80rpx;
}

.footer-text {
  font-size: 22rpx;
  color: #555577;
}
</style>
