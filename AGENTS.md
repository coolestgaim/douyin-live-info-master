# AGENTS.md — 给 AI 代理的项目说明

> 任何 AI 编码代理（Claude Code、Codex、Cursor、Hermes 等）打开本项目时，请先阅读本文档。

## 项目简介

抖音直播控场助手（douyin-live-info）— Electron 33 + Vue 3 + Pinia + Naive UI 桌面工具。
功能：抖音直播间弹幕实时监听、数据统计、直播录制（ffmpeg）、快捷回复控场、卡密授权。

- 版本：v2.7.0
- 技术栈：Electron 33.4 / Vue 3.5 / Pinia 2.2 / Naive UI 2.40 / Vite 6.4 / TypeScript 5
- 主进程代码：`electron/`（main.ts + preload.ts + ipc-handlers.ts + services/）
- 渲染进程代码：`src/`（views/ + stores/ + components/）
- 卡密工具：`keygen/`（独立 HTML）
- 在线验证服务：`server/`

## 📖 必读文档（按优先级）

1. **`docs/交接文档-新会话使用.md`** — ⭐ 最完整交接文档：
   - 新会话提示词（开篇可直接用）
   - 当前 git 状态与待办事项（远程分支清理、token 失效等）
   - 全部功能模块详解、IPC 通道清单、数据存储位置
   - 12 条已知开发陷阱（必读，避免踩坑）
   - 打包发布流程（版本号 4 处同步）
2. `docs/项目完整文档.md` — 功能与架构总览（v2.7.0 早期版）

## 常用命令

```bash
npm run build           # 构建验证（vue-tsc → vite → tsc 三阶段，必须通过）
npm run electron:dev    # 开发模式（注意：dist/ 存在时会加载旧构建，先删 dist）
npm run electron:build  # 打包 → release/<version>/（版本号文件夹，不覆盖旧包）
```

## ⚠️ 关键注意事项

1. **开发前删除 `dist/ dist-electron/`** — 否则 Electron 加载旧生产构建，源码改动无效
2. **视图必须 v-show 常驻 DOM**（App.vue）— webview 离开 DOM 会重载丢登录
3. **Pinia localStorage 加载**必须用默认值补齐字段，否则全页空白无报错
4. **禁止 watch(store, {deep:true}) 持久化** — 初始化无限循环
5. **发布前同步版本号 4 处**：package.json / AppSidebar.vue / AboutView.vue / README.md
6. 快捷回复当前为**手机卡片版**（编辑/发送Tab），勿回退到简单版
7. 识图功能（OfflineDataView + DashScope API）**已删除**，勿恢复

## Git 状态提醒

- 远程仓库：https://github.com/coolestgaim/douyin-live-info-master.git
- 待办：GitHub token 已失效需重新生成；远程 4 个旧分支待删除
- 详见交接文档「十二、待办事项」
