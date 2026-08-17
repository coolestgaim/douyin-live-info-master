# AGENTS.md — 给 AI 代理的项目说明

> 任何 AI 编码代理（Claude Code、Codex、Cursor、WorkBuddy 等）打开本项目时，请先阅读本文档。

## 项目简介

抖音直播控场助手（douyin-live-info）— Electron 33 + Vue 3 + Pinia + Naive UI 桌面工具。
品牌名：**灼灼直播控场**。

- 版本：**v2.8.0**（免费开放版，2026-08-17）
- 技术栈：Electron 33.4 / Vue 3.5 / Pinia 2.2 / Naive UI 2.40 / Vite 6.4 / TypeScript 5
- 主进程代码：`electron/`（main.ts + preload.ts + ipc-handlers.ts + services/）
- 渲染进程代码：`src/`（views/ + stores/ + components/）
- 仓库：`coolestgaim/douyin-live-info-master`（已转私有）

## 📖 必读文档（按优先级）

1. **`docs/交接文档-新会话使用.md`** — ⭐ 最完整交接文档（陷阱、模块、IPC 全清单）
2. `docs/项目文档.md` — 完整功能与架构说明（人类友好）
3. `docs/版本历史与回退指南.md` — 各版本特性 + 回退方法
4. `README.md` — 项目门面（截图、功能介绍）

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
6. **快捷回复当前为手机卡片版**（单区域编辑/发送 + SVG 复制键 hover 浮现），勿回退
7. **录制分段模式**：`outputPath` 含 `%03d` pattern，`updateFileSize` 扫描目录统计 prefix_NNN.ext 文件
8. **磁盘缓存**：electron:dev 加 `--disk-cache-size=0` + main.ts `appendSwitch('disk-cache-size','0')`，避免 Chromium 缓存锁导致黑屏

## 已移除的模块（勿恢复）

- ❌ **卡密授权系统**（v2.8.0 移除）：`license.ts` / `license-online.ts` / `LicenseView.vue` / `server/` / `keygen/` / `keys/`
- ❌ **识图功能**（v2.6.0 移除）：OfflineDataView + DashScope API
- ❌ **tingwu 分支代码**（v2.6.0 移除）

## 关键文件位置

- 卡密备份（如果需要恢复）：`D:/Hermes/license-backup-20260817/`
- userData（运行时）：`AppData/Roaming/douyin-live-info/`
- 部署产物：`release/v2.8.0/DouyinLiveInfo-2.8.0-Portable.exe`

## Git 状态

- 远程仓库：https://github.com/coolestgaim/douyin-live-info-master.git（私有）
- token 有效（ghp_Vkz 开头，已有 workflow 限制：无 workflow scope）
- 当前 HEAD：`7a1c4f2`（v2.8.0）
- 详见 `docs/交接文档-新会话使用.md` 末尾
