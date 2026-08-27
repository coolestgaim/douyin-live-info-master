import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Room
  roomFetch: (urls: string[]) => ipcRenderer.invoke('room:fetch', urls),
  roomRefreshStats: (rooms: any[]) => ipcRenderer.invoke('room:refresh-stats', rooms),

  // 预约开播：主播开播后自动连弹幕 + 自动录制
  roomWatchAdd: (room: { url?: string; enterRoomId?: string; nickname?: string; quality?: string }) => ipcRenderer.invoke('room:watch-add', room),
  roomWatchRemove: (roomId: string) => ipcRenderer.invoke('room:watch-remove', roomId),
  roomWatchList: () => ipcRenderer.invoke('room:watch-list'),
  onRoomWatchStarted: (cb: (data: { roomId: string; nickname: string }) => void) => ipcRenderer.on('room:watch-started', (_e, data) => cb(data)),
  onRoomWatchStopped: (cb: (data: { roomId: string; nickname: string }) => void) => ipcRenderer.on('room:watch-stopped', (_e, data) => cb(data)),
  removeRoomWatchListeners: () => {
    ipcRenderer.removeAllListeners('room:watch-started')
    ipcRenderer.removeAllListeners('room:watch-stopped')
  },

  // Danmu
  danmuConnect: (roomId: string, nickname: string) => ipcRenderer.invoke('danmu:connect', roomId, nickname),
  danmuDisconnect: (roomId: string) => ipcRenderer.invoke('danmu:disconnect', roomId),
  danmuDisconnectAll: () => ipcRenderer.invoke('danmu:disconnect-all'),
  onDanmuMessage: (cb: (data: any) => void) => ipcRenderer.on('danmu:on-message', (_e, data) => cb(data)),
  onDanmuStatus: (cb: (data: any) => void) => ipcRenderer.on('danmu:on-status', (_e, data) => cb(data)),
  onDanmuDisconnect: (cb: (data: any) => void) => ipcRenderer.on('danmu:on-disconnect', (_e, data) => cb(data)),
  removeDanmuListeners: () => {
    ipcRenderer.removeAllListeners('danmu:on-message')
    ipcRenderer.removeAllListeners('danmu:on-status')
    ipcRenderer.removeAllListeners('danmu:on-disconnect')
  },

  // Record
  recordStartAll: (rooms: any[]) => ipcRenderer.invoke('record:start-all', rooms),
  recordStartOne: (room: any) => ipcRenderer.invoke('record:start-one', room),
  recordStopAll: () => ipcRenderer.invoke('record:stop-all'),
  recordStopOne: (roomId: string) => ipcRenderer.invoke('record:stop-one', roomId),
  recordGetState: () => ipcRenderer.invoke('record:get-state'),
  recordGetQualities: (roomId: string) => ipcRenderer.invoke('record:get-qualities', roomId),
  recordScanSessions: (nicknameHint?: string) => ipcRenderer.invoke('record:scan-sessions', nicknameHint),
  onRecordUpdate: (cb: (data: any) => void) => ipcRenderer.on('record:on-update', (_e, data) => cb(data)),
  onRecordSessionFinalized: (cb: (s: any) => void) => ipcRenderer.on('record:session-finalized', (_e, s) => cb(s)),
  removeRecordListeners: () => {
    ipcRenderer.removeAllListeners('record:on-update')
    ipcRenderer.removeAllListeners('record:session-finalized')
  },

  // Database
  dbGetRooms: () => ipcRenderer.invoke('db:get-rooms'),
  dbGetMessages: (roomId: string, typeFilter?: string, keyword?: string, username?: string) =>
    ipcRenderer.invoke('db:get-messages', roomId, typeFilter, keyword, username),
  dbClearAll: () => ipcRenderer.invoke('db:clear-all'),
  dbExportMessages: (roomId: string, nickname: string, typeFilter?: string, keyword?: string, username?: string, format?: 'csv' | 'json') =>
    ipcRenderer.invoke('db:export-messages', roomId, nickname, typeFilter, keyword, username, format),

  // Config
  configLoad: () => ipcRenderer.invoke('config:load'),
  configSave: (cfg: any) => ipcRenderer.invoke('config:save', cfg),
  configBrowsePath: () => ipcRenderer.invoke('config:browse-path'),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowPin: () => ipcRenderer.invoke('window:pin'),
  windowIsPinned: () => ipcRenderer.invoke('window:isPinned'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximizeChange: (cb: (isMax: boolean) => void) => ipcRenderer.on('window:maximize-change', (_e, isMax) => cb(isMax)),
  offWindowMaximizeChange: () => ipcRenderer.removeAllListeners('window:maximize-change'),

  // 主题切换：通知主进程转发给浮窗等子窗口
  setThemeMode: (mode: 'dark' | 'light') => ipcRenderer.send('window:set-theme', mode),

  // DeskPins
  deskpinsList: () => ipcRenderer.invoke('deskpins:list'),
  deskpinsPin: (hwnd: string) => ipcRenderer.invoke('deskpins:pin', hwnd),
  deskpinsUnpin: (hwnd: string) => ipcRenderer.invoke('deskpins:unpin', hwnd),

  // Floating danmu
  floatingOpen: () => ipcRenderer.invoke('floating:open'),
  floatingClose: () => ipcRenderer.invoke('floating:close'),
  onFloatingClosed: (cb: () => void) => ipcRenderer.on('floating:on-closed', () => cb()),
  // 弹幕回放：把回放弹幕推送到悬浮窗（模拟实时直播）
  floatingReplay: (msg: any) => ipcRenderer.send('floating:replay', msg),
  // 弹幕回放：开始前清空浮窗（只显示本次回放 CSV 的弹幕）
  floatingReplayClear: () => ipcRenderer.send('floating:replay-clear'),
  // 弹幕回放：选择本地录制视频文件
  pickVideo: () => ipcRenderer.invoke('file:pick-video'),
  // 弹幕回放：选择"录制会话文件夹"（自动匹配视频+弹幕CSV）
  pickReplayFolder: () => ipcRenderer.invoke('file:pick-folder'),
  // 弹幕回放：读取录制会话内的文本文件（CSV），主进程已限制只能在录制输出根目录内
  readTextFile: (path: string) => ipcRenderer.invoke('file:read-text', path),

  // Session
  sessionClear: (partition: string) => ipcRenderer.invoke('session:clear', partition),

  // File
  fileOpenLocation: (filePath: string) => ipcRenderer.invoke('file:open-location', filePath),
  fileDelete: (filePath: string) => ipcRenderer.invoke('file:delete', filePath),

  // FFmpeg
  ffmpegCheck: () => ipcRenderer.invoke('ffmpeg:check'),
  ffmpegInstall: () => ipcRenderer.invoke('ffmpeg:install'),
  onFfmpegProgress: (cb: (data: { pct: number; msg: string }) => void) => ipcRenderer.on('ffmpeg:progress', (_e, data) => cb(data)),

}

contextBridge.exposeInMainWorld('electronAPI', api)
