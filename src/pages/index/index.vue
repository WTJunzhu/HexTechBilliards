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
      <text class="footer-text">Phase 1 MVP · 中式八球 · 在线联机</text>
    </view>
  </view>
</template>

<script setup lang="ts">
function startOnline() {
  uni.navigateTo({ url: '/pages/lobby/index' })
}

function startLocalPvP() {
  uni.navigateTo({ url: '/pages/pvp/index' })
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
