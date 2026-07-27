# 🎱 HexTechBilliards

海克斯科技台球 — 中式八球 + 海克斯科技（随机技能系统）

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

1. 登录 [Vercel](https://vercel.com)，导入 GitHub 仓库
2. **Framework Preset** 选 `Other`
3. **Build Command**: `npm run build:h5`
4. **Output Directory**: `dist/build/h5`
5. **环境变量** 添加：
   - `VITE_SIGNALING_URL` = `wss://hextech-billiards-server.onrender.com`
6. 点击 Deploy

### 环境变量说明

| 变量 | 位置 | 说明 |
|------|------|------|
| `VITE_SIGNALING_URL` | Vercel (前端) | 信令服务器 WebSocket 地址 |
| `PORT` | Render (后端) | Render 自动注入，无需手动配置 |

### 注意事项

- **Render 免费层冷启动**：15 分钟无请求会休眠，首次连接约 30 秒延迟
- **心跳保活**：服务器每 15s 向客户端发 ping，客户端每 25s 发心跳，防止连接超时断开
- **WebSocket 协议**：线上环境使用 `wss://`（加密），本地开发使用 `ws://`
