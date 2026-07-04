import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Room
  roomFetch: (urls: string[]) => ipcRenderer.invoke('room:fetch', urls),
  roomRefreshStats: (rooms: any[]) => ipcRenderer.invoke('room:refresh-stats', rooms),

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
  onRecordUpdate: (cb: (data: any) => void) => ipcRenderer.on('record:on-update', (_e, data) => cb(data)),
  removeRecordListeners: () => ipcRenderer.removeAllListeners('record:on-update'),

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

  // Floating danmu
  floatingOpen: () => ipcRenderer.invoke('floating:open'),
  floatingClose: () => ipcRenderer.invoke('floating:close'),
  onFloatingClosed: (cb: () => void) => ipcRenderer.on('floating:on-closed', cb),

  // FFmpeg
  ffmpegCheck: () => ipcRenderer.invoke('ffmpeg:check'),
  ffmpegInstall: () => ipcRenderer.invoke('ffmpeg:install'),
  onFfmpegProgress: (cb: (data: { pct: number; msg: string }) => void) => ipcRenderer.on('ffmpeg:progress', (_e, data) => cb(data)),

  // Tingwu
  tingwuTranscribe: (filePath: string) => ipcRenderer.invoke('tingwu:transcribe', filePath),
  tingwuPoll: (taskId: string) => ipcRenderer.invoke('tingwu:poll', taskId),
  onTingwuStatus: (cb: (data: { stage: string; msg: string }) => void) => ipcRenderer.on('tingwu:status', (_e, data) => cb(data)),
}

contextBridge.exposeInMainWorld('electronAPI', api)
