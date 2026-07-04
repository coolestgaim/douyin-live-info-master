# DouyinLiveInfo

抖音直播间信息获取工具 — 实时弹幕监听、数据统计、直播录制。

![Electron](https://img.shields.io/badge/Electron-33-blue)
![Vue](https://img.shields.io/badge/Vue-3.5-green)
![License](https://img.shields.io/badge/License-CC%20BY--NC%204.0-orange)

<img width="1100" height="680" alt="1" src="https://github.com/user-attachments/assets/4435c0b4-d846-4d82-99f0-5292afabf06f" />
<img width="1100" height="680" alt="2" src="https://github.com/user-attachments/assets/05e2104a-863b-4f9d-b218-75e98d89da42" />
<img width="1100" height="680" alt="3" src="https://github.com/user-attachments/assets/45814b41-4a6f-4287-be54-01177a796bb9" />
<img width="1100" height="680" alt="4" src="https://github.com/user-attachments/assets/4c55bf5a-e207-4b62-b94d-9e21381143b6" />


## 功能

- **多房间管理** — 同时添加多个直播间，批量获取房间信息
- **实时弹幕** — WebSocket 连接监听弹幕、礼物、点赞、进房、关注等消息
- **数据统计** — 仪表盘实时聚合各房间弹幕/礼物/点赞/进房/关注数据
- **弹幕过滤** — 按消息类型和房间筛选，历史弹幕搜索、导出 CSV/JSON
- **直播录制** — 调用 ffmpeg 录制直播流，支持 MP3/MP4/WAV/FLV 格式
- **本地存储** — SQLite 本地存储弹幕记录，支持查看和导出
- **暗色主题** — 深色 UI，Naive UI 组件库

## 截图

<!-- 可自行添加截图 -->

## 技术栈

- **前端**: Vue 3 + Pinia + Vue Router + Naive UI + TypeScript
- **后端**: Electron 33
- **构建**: Vite 6 + electron-builder
- **数据库**: sql.js (SQLite)
- **其他**: WebSocket、Protobuf 解析、ffmpeg 录制

## 开发

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 下载 ffmpeg

录制功能依赖 ffmpeg。请将 `ffmpeg.exe` 放到项目根目录。

下载地址: https://ffmpeg.org/download.html

### 开发模式

```bash
npm run electron:dev
```

### 构建打包

```bash
npm run electron:build
```

产出物在 `release/` 目录：
- `DouyinLiveInfo Setup x.x.x.exe` — 安装版
- `DouyinLiveInfo-x.x.x-Portable.exe` — 便携版

## 使用说明

1. 在「直播间」页面粘贴抖音直播间链接（如 `https://live.douyin.com/123456`），支持多个链接换行输入
2. 点击「获取信息」拉取房间状态
3. 点击「全部连接」开始接收弹幕
4. 在「弹幕」页面实时查看和筛选消息
5. 在「录制」页面点击「全部录制」开始录制直播流
6. 在「设置」页面配置录制格式和保存路径

## 免责声明

1. 本工具仅供学习和技术研究使用，请勿用于任何商业用途或违法行为。
2. 使用本工具所产生的一切后果由使用者自行承担，开发者不承担任何责任。
3. 本工具不存储、不传播任何直播内容，仅采集公开的弹幕互动数据。
4. 请遵守相关平台的使用条款和当地法律法规，尊重他人隐私和知识产权。
5. 如有侵权或不妥之处，请联系作者删除。
6. **本工具完全免费，如您是付费购买的本软件，证明您已经上当受骗。**

## 许可证

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)

本作品采用 知识共享署名-非商业性使用 4.0 国际许可协议进行许可。您可以自由共享和修改，但不得用于商业目的。
