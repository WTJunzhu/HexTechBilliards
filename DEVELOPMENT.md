# HexTechBilliards - 开发规划

## 项目概述

- **游戏名称**：HexTechBilliards（海克斯科技台球）
- **核心概念**：中式八球 + 海克斯科技（随机技能系统）
- **目标平台**：H5浏览器 + 微信小程序（uni-app跨平台）
- **两种模式**：真人对战（PvP）+ BOSS挑战（肉鸽）

## 技术栈

| 模块 | 选型 |
|------|------|
| 前端框架 | uni-app + Vue 3 + TypeScript |
| 构建工具 | Vite (uni-app内置) |
| 状态管理 | Pinia |
| 物理引擎 | 基于参考项目改造的轻量2D台球物理 |
| 渲染引擎 | Canvas 2D |
| 音效 | uni-app音频API |

## 参考项目

### [henshmi/Classic-8-Ball-Pool](https://github.com/henshmi/Classic-8-Ball-Pool) ⭐288
- TypeScript + Canvas 2D
- ⚠️ **注意：这是美式8球，不是中式八球！**
- 借鉴：2D碰撞物理、游戏主循环架构、输入系统
- **不借鉴**：规则细节（中式八球规则需另行实现）

### [tailuge/billiards](https://github.com/tailuge/billiards) ⭐200+
- TypeScript + Three.js (WebGL 3D)
- 借鉴：碰撞数学公式参考
- 不直接使用（3D/WebGL不符合方案）

---

## ⚠️ 中式八球 vs 美式8球 — 关键差异

开发物理引擎和规则引擎时，**必须**注意以下差异：

### 球桌差异
| 特征 | 中式八球 | 美式8球 |
|------|---------|--------|
| 球桌尺寸 | 2540mm × 1270mm (9尺) | 2740mm × 1370mm (9尺) |
| 袋口形状 | 圆角袋口（袋口较大） | 直角袋口（袋口较小） |
| 袋口数量 | 6个（四角+两侧） | 6个（四角+两侧） |
| 台面颜色 | 绿色 | 绿色/蓝色 |

### 球差异
| 特征 | 中式八球 | 美式8球 |
|------|---------|--------|
| 球数 | 16球（白球+15目标球） | 16球（白球+15目标球） |
| 球组 | 全色球(1-7) + 花色球(9-15) + 8号 | 实心球(1-7) + 条纹球(9-15) + 8号 |
| 球径 | 57.15mm | 57.15mm |

### 开球摆放差异
| 特征 | 中式八球 | 美式8球 |
|------|---------|--------|
| 三角形顶球 | 任意 | 1号球 |
| 8号球位置 | 三角形中心 | 三角形中心 |
| 底边两角 | 必须一全色一花色 | 必须一角实心一角条纹 |
| 其他球 | 随机 | 尽量交替 |

### 规则差异
| 规则 | 中式八球 | 美式8球 |
|------|---------|--------|
| 开球后球组归属 | 开球进球不决定球组，此后第一个合法进球决定 | 开球进球可决定球组（部分规则） |
| 犯规后自由球 | **全桌自由球**（任意放置白球） | 部分规则仅允许开球线后放置 |
| 同时打进双方球 | 合法，但换手 | 合法，但换手 |
| 打8号球犯规 | 直接输局 | 直接输局 |
| 未碰到任何球 | 犯规 | 犯规 |
| 白球进袋 | 犯规，对手自由球 | 犯规，对手自由球 |
| 指袋打8号 | 需要指袋 | 部分规则需要指袋 |

---

## Phase 1：基础台球（MVP）

### 目标
可玩的中式八球基础游戏（双人本地对战）

### 任务清单

#### 1. 项目初始化
- [ ] 使用 degit 创建 uni-app + Vue 3 + TS 项目
- [ ] 安装 Pinia
- [ ] 配置 pages.json 页面路由
- [ ] 创建基础目录结构

#### 2. 物理引擎（`src/engine/physics/`）
基于 Classic-8-Ball-Pool 的2D物理改造，但按中式八球规格：
- [ ] `Vector2.ts` — 2D向量工具类
- [ ] `Ball.ts` — 球实体（位置、速度、半径、状态）
- [ ] `PhysicsWorld.ts` — 物理主循环
  - [ ] 运动模拟（速度更新 + 摩擦衰减）
  - [ ] 球-球弹性碰撞（法线/切线分解）
  - [ ] 球-边碰撞（矩形边界反弹 + 能量损失）
  - [ ] 进袋判定（6个袋口距离检测）
  - [ ] 停止判定（速度阈值）
  - [ ] ⚠️ 中式八球球桌尺寸（2540×1270mm比例）
  - [ ] ⚠️ 中式八球袋口（圆角袋口，较大）
- [ ] `ForceField.ts` — 力场系统接口（为Phase2海克斯预留Hook）
- [ ] 固定时间步长模拟

#### 3. Canvas渲染器（`src/engine/renderer/`）
- [ ] `CanvasRenderer.ts` — 渲染主循环
- [ ] `TableRenderer.ts` — 球桌绘制
  - [ ] 绿色台面
  - [ ] 中式八球袋口形状（圆角）
  - [ ] 边框装饰
- [ ] `BallRenderer.ts` — 球绘制
  - [ ] 全色球(1-7) — 单色+数字
  - [ ] 花色球(9-15) — 条纹+数字
  - [ ] 8号球 — 黑色
  - [ ] 白球
- [ ] `CueRenderer.ts` — 球杆绘制

#### 4. 输入系统（`src/engine/input/`）
- [ ] `CueController.ts` — 球杆操控
  - [ ] 触摸/鼠标瞄准（方向线预览）
  - [ ] 拉杆蓄力（力度条UI）
  - [ ] 击球执行
- [ ] `TouchAdapter.ts` — 触摸/鼠标统一适配

#### 5. 游戏规则引擎（`src/engine/game/`）
**⚠️ 中式八球规则，不是美式8球！**
- [ ] `GameState.ts` — 游戏状态机
  - [ ] AIMING — 瞄准中
  - [ ] POWER — 蓄力中
  - [ ] SHOOTING — 击球执行
  - [ ] BALLS_MOVING — 球运动中
  - [ ] TURN_END — 回合结束判定
  - [ ] GAME_OVER — 游戏结束
- [ ] `TurnManager.ts` — 回合管理
  - [ ] 双人轮流
  - [ ] 连续击球（进己方球继续）
- [ ] `RuleEngine.ts` — ⚠️ **中式八球规则**
  - [ ] 开球规则（三角形摆放：8号居中，底边两角一全色一花色）
  - [ ] 开球进球不决定球组
  - [ ] 第一个合法进球决定球组归属
  - [ ] 犯规判定（白球进袋、未碰己方球、先碰对方球等）
  - [ ] 犯规后全桌自由球
  - [ ] 打8号球犯规判负
  - [ ] 清完己方球后打8号球获胜
- [ ] `ScoreManager.ts` — 得分/进度管理

#### 6. 基础UI（Vue组件）
- [ ] `pages/index/` — 首页（模式选择占位）
- [ ] `pages/pvp/` — PvP游戏页
- [ ] `components/game/BilliardTable.vue` — Canvas + 游戏集成
- [ ] `components/game/GameHUD.vue` — 游戏状态HUD
- [ ] `components/common/` — 通用UI组件

### 项目目录结构

```
src/
├── pages/
│   ├── index/                  # 首页
│   └── pvp/                    # PvP对战页
├── components/
│   ├── game/
│   │   ├── BilliardTable.vue   # Canvas球桌组件
│   │   └── GameHUD.vue         # 游戏HUD
│   └── common/
├── engine/
│   ├── physics/
│   │   ├── Vector2.ts          # 2D向量
│   │   ├── Ball.ts             # 球实体
│   │   ├── PhysicsWorld.ts     # 物理世界
│   │   ├── Collision.ts        # 碰撞检测
│   │   ├── TableSpec.ts        # ⚠️ 中式八球球桌规格
│   │   └── ForceField.ts       # 力场接口(Hex Hook)
│   ├── renderer/
│   │   ├── CanvasRenderer.ts   # 渲染主循环
│   │   ├── TableRenderer.ts    # 球桌渲染
│   │   ├── BallRenderer.ts     # 球渲染
│   │   └── CueRenderer.ts      # 球杆渲染
│   ├── game/
│   │   ├── GameState.ts        # 状态机
│   │   ├── TurnManager.ts      # 回合管理
│   │   ├── RuleEngine.ts       # ⚠️ 中式八球规则
│   │   └── ScoreManager.ts     # 得分管理
│   └── input/
│       ├── CueController.ts    # 球杆操控
│       └── TouchAdapter.ts     # 输入适配
├── stores/
│   └── gameStore.ts            # Pinia游戏状态
├── types/
│   └── game.ts                 # 类型定义
├── App.vue
├── main.ts
├── manifest.json
├── pages.json
└── uni.scss
```

---

## Phase 2-5 概要（后续详细规划）

### Phase 2：海克斯系统
- 海克斯注册表与定义
- 海克斯获取机制（3选1、回合触发等）
- 海克斯效果实现（增益、减益、环境、被动）
- 海克斯物理扩展（力场系统、传送门等）
- 海克斯手牌UI与使用交互

### Phase 3：PvP模式完善
- 双人同屏交互打磨
- 回合切换动画
- 音效系统
- UI美化

### Phase 4：BOSS挑战模式
- Boss基类与AI框架
- 5个Boss实现
- 肉鸽海克斯选择
- 海克斯Build协同
- 无尽模式

### Phase 5：打磨与小程序适配
- 教程引导
- 设置页面
- 小程序适配测试
- 性能优化
