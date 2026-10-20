# 🎱 HexTechBilliards

海克斯科技台球 — 中式八球 + 海克斯科技（随机技能系统）

## 素材来源

项目目前不包含任何外部图片、音频或字体素材，全部由代码实时生成：

| 类型 | 来源 |
|------|------|
| 球桌、球、球杆、瞄准线等画面 | Canvas 2D 代码绘制（`src/engine/renderer/CanvasRenderer.ts`），球面纹理逐像素计算 |
| 音效（击球、碰球、撞库、落袋） | Web Audio API 振荡器实时合成（`src/engine/audio/AudioEngine.ts`），无音频文件 |
| 字体 | 系统默认字体 |
| 首页模式图标 | 系统 Emoji |
| `src/static/logo.png` | uni-app 项目模板自带的默认图标，未被引用 |

## 本地开发

### 前端

```bash
npm install
npm run dev:h5
```

### 信令服务器

```bash
cd server
npm install
npm run dev
```

信令服务器默认运行在 `ws://localhost:3001`

## 在线部署

### 架构

| 组件 | 平台 | 说明 |
|------|------|------|
| 前端 | Vercel | 静态站点托管 H5 构建产物 |
| 信令服务器 | Render | Web Service 支持 WebSocket 长连接 |

### 部署步骤

#### 1. 部署信令服务器到 Render

1. 登录 [Render](https://render.com)，点击 **New** → **Web Service**
2. 连接 GitHub 仓库 `WTJunzhu/HexTechBilliards`
3. Render 会自动检测 `render.yaml` 配置，确认即可
4. 部署完成后记下服务器地址，如 `https://hextech-billiards-server.onrender.com`
5. WebSocket 地址为 `wss://hextech-billiards-server.onrender.com`

#### 2. 部署前端到 Vercel

1. 登录 [Vercel](https://vercel.com)，**Add New Project** → 导入 GitHub 仓库 `WTJunzhu/HexTechBilliards`
2. **Configure Project** 页面设置：
   - **Framework Preset**: `Other`
   - **Build Command**: `npm run build:h5`
   - **Output Directory**: `dist/build/h5`
   - **Install Command**: `npm install`（默认即可）
3. **Environment Variables** 添加：
   - `VITE_SIGNALING_URL` = `wss://hextechbilliards.onrender.com`
4. 点击 **Deploy**
5. ⚠️ 如果构建时报 Vue peer dependency 警告，忽略即可，不影响构建

### 环境变量说明

| 变量 | 位置 | 说明 |
|------|------|------|
| `VITE_SIGNALING_URL` | Vercel (前端) | 信令服务器 WebSocket 地址 |
| `PORT` | Render (后端) | Render 自动注入，无需手动配置 |

### 注意事项

- **Render 免费层冷启动**：15 分钟无请求会休眠，首次连接约 30 秒延迟
- **心跳保活**：服务器每 15s 向客户端发 ping，客户端每 25s 发心跳，防止连接超时断开
- **WebSocket 协议**：线上环境使用 `wss://`（加密），本地开发使用 `ws://`
