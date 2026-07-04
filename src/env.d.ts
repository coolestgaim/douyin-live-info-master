declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Webview element (Electron)
declare interface HTMLWebViewElement extends HTMLElement {
  src: string
  partition: string
  allowpopups: string
  executeJavaScript(code: string): Promise<any>
  insertCSS(css: string): Promise<void>
  setAudioMuted(muted: boolean): void
  loadURL(url: string): void
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  getURL(): string
  getTitle(): string
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void
}

interface Window {
  electronAPI: {
    roomFetch: (urls: string[]) => Promise<any[]>
    roomRefreshStats: (rooms: any[]) => Promise<any[]>
    danmuConnect: (roomId: string, nickname: string) => Promise<boolean>
    danmuDisconnect: (roomId: string) => Promise<void>
    danmuDisconnectAll: () => Promise<void>
    onDanmuMessage: (cb: (data: any) => void) => void
    onDanmuStatus: (cb: (data: any) => void) => void
    onDanmuDisconnect: (cb: (data: any) => void) => void
    removeDanmuListeners: () => void
    recordStartAll: (rooms: any[]) => Promise<any>
    recordStopAll: () => Promise<any>
    recordGetState: () => Promise<any>
    onRecordUpdate: (cb: (data: any) => void) => void
    removeRecordListeners: () => void
    dbGetRooms: () => Promise<any[]>
    dbGetMessages: (roomId: string, typeFilter?: string, keyword?: string, username?: string) => Promise<any[]>
    dbClearAll: () => Promise<void>
    configLoad: () => Promise<any>
    configSave: (cfg: any) => Promise<void>
    configBrowsePath: () => Promise<string | null>
    windowMinimize: () => Promise<void>
    windowMaximize: () => Promise<void>
    windowClose: () => Promise<void>
  }
}
