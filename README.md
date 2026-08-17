# DouyinLiveInfo

> 抖音直播间信息获取工具 — 实时弹幕监听、数据统计、直播录制、AI 分析

[![Release](https://img.shields.io/badge/Release-v2.8.0-blue?logo=github)](https://github.com/coolestgaim/douyin-live-info-master/releases)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-CC%20BY--NC%204.0-orange)

---

## 🚀 功能特色

| 功能 | 说明 |
| ------------ | --------------------------------------- |
| **🎯 多房间管理** | 同时添加多个直播间，批量获取房间信息，实时追踪在线状态 |
| **💬 实时弹幕** | WebSocket 连接监听弹幕、礼物、点赞、进房、关注等消息 |
| **📊 数据仪表盘** | 各房间弹幕/礼物/点赞/进房/关注数据实时聚合统计 |
| **🔍 弹幕过滤** | 按消息类型和房间筛选，历史弹幕搜索，导出 CSV/JSON |
| **🎥 直播录制** | 调用内置 ffmpeg 录制直播流，支持 MP3/MP4/WAV/FLV 格式 |
| **📁 录制管理** | 历史录制记录面板，同房间多次录制不覆盖，一键打开文件夹 |
| **🤖 AI 分析** | 下播后自动分析直播数据，用 DashScope API 生成智能总结 |
| **🪟 弹幕浮窗** | 透明可筛选的悬浮窗，直播时浮在桌面上实时查看弹幕 |
| **🔐 卡密验证** | HMAC-SHA256 离线签名验签，支持黑名单吊销，保护软件授权 |
| **💾 本地存储** | SQLite 本地存储所有弹幕记录，无需联网即可查看历史 |
| **🌙 暗色主题** | 深色 UI，基于 Naive UI 组件库，护眼设计 |

---

## 📸 截图

| 仪表盘 | 弹幕采集 |
| ------------------------------------ | ------------------------------------ |
| ![](docs/screenshots/Pasted%20image%2020260714171254.png) | ![](docs/screenshots/Pasted%20image%2020260714171326.png) |

| 录制管理 | 弹幕管理 |
| ------------------------------------ | ------------------------------------ |
| ![](docs/screenshots/Pasted%20image%2020260714171439.png) | ![](docs/screenshots/Pasted%20image%2020260714171357.png) |

| 快捷回复 |
| ------------------------------------ |
| ![](docs/screenshots/Pasted%20image%2020260714172325.png) |

## 🛠 技术栈

| 层 | 技术 |
| --------- | -------------------------- |
| **前端框架** | Vue 3 + Pinia + Vue Router |
| **UI 组件** | Naive UI |
| **语言** | TypeScript / JavaScript |
| **桌面壳** | Electron 33 |
| **构建工具** | Vite 6 + electron-builder |
| **数据库** | sql.js (SQLite) |
| **协议解析** | Protobuf |
| **流媒体** | ffmpeg (内置) |
| **AI 接口** | DashScope (通义千问视觉模型) |

---

## 📥 快速安装

### 下载即用

从 [Releases](https://github.com/coolestgaim/douyin-live-info-master/releases) 下载最新版：

- **`DouyinLiveInfo Setup x.x.x.exe`** — 安装版（推荐）
- **`DouyinLiveInfo-x.x.x-Portable.exe`** — 便携版（免安装，U盘即插即用）

> 📌 便携版已内置 ffmpeg，拿到任何 Windows 电脑上即可使用录制功能。

### 环境要求（开发者）

- Node.js >= 18
- npm >= 9

```bash
npm install
npm run electron:dev    # 开发模式
npm run electron:build  # 构建打包
```

构建产物在 `release/` 目录。

---

## 📖 使用说明

### 基本流程

1. **添加直播间** — 在「直播间」页面粘贴抖音直播间链接，支持多个链接换行输入
2. **获取信息** — 点击「获取信息」拉取房间状态和直播流地址
3. **连接弹幕** — 点击「全部连接」开始接收弹幕消息
4. **查看弹幕** — 在「弹幕」页面实时查看和按条件筛选消息
5. **开始录制** — 在「录制」页面点击录制按钮，支持单个或批量录制

### 卡密验证（可选）

本工具内置卡密验证系统，用于授权管理：

- `keygen/gen-key.js` — 命令行生成卡密
- `keygen/卡密生成器.html` — GUI 卡密生成工具
- `keygen/admin.html` / `admin_v2.html` — 管理后台（生成+吊销+黑名单）
- 算法：HMAC-SHA256，离线验签，无需联网

### AI 分析配置

在「设置」页面填入 DashScope API Key，即可在下播后自动生成直播数据分析报告。

---

## ⚠️ 免责声明

1. 本工具仅供 **学习和技术研究** 使用，请勿用于任何商业用途或违法行为。
2. 使用本工具所产生的一切后果由使用者自行承担。
3. 本工具不存储、不传播任何直播内容，仅采集公开的弹幕互动数据。
4. 请遵守相关平台的使用条款和当地法律法规。
5. **本工具完全免费，如您是付费购买的本软件，证明您已经上当受骗。**

## 📄 许可证

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)

本作品采用 知识共享署名-非商业性使用 4.0 国际许可协议进行许可。
