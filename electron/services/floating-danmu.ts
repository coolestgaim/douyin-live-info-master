import { BrowserWindow, ipcMain, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as logger from './logger'

const LOG_MODULE = 'FloatingDanmu'

let floatingWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null

const HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:transparent;font-family:'Microsoft YaHei UI',system-ui,sans-serif;-webkit-app-region:drag}
#container{width:100%;height:100%;display:flex;flex-direction:column;background:rgba(0,0,0,0.8);border-radius:12px;border:1px solid rgba(249,115,22,0.2);overflow:hidden}
#titlebar{display:flex;align-items:center;justify-content:space-between;padding:4px 10px;flex-shrink:0;-webkit-app-region:drag;border-bottom:1px solid rgba(42,45,54,0.6)}
#titlebar span{font-size:11px;color:#8b8fa3}
#controls{display:flex;align-items:center;gap:6px;-webkit-app-region:no-drag}
#opacity{width:56px;height:3px;-webkit-appearance:none;appearance:none;background:#2a2d36;border-radius:2px;outline:none;cursor:pointer}
#opacity::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:#f97316;cursor:pointer}
#closeBtn{background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-size:11px;width:20px;height:20px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center}
#closeBtn:hover{background:rgba(239,68,68,0.2)}
#filters{display:flex;gap:3px;padding:4px 8px;flex-shrink:0;flex-wrap:wrap}
.f-chip, .r-chip{border:1px solid #2a2d36;background:transparent;color:#6b7080;font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer;font-family:inherit;transition:all 0.15s;-webkit-app-region:no-drag}
.f-chip:hover, .r-chip:hover{border-color:#f97316;color:#a0a4b0}
.f-chip.active{background:rgba(249,115,22,0.12);border-color:#f97316;color:#f97316}
.r-chip.active{background:rgba(59,130,246,0.12);border-color:#3b82f6;color:#3b82f6}
#room-filters{display:flex;gap:3px;padding:2px 8px 4px;flex-shrink:0;flex-wrap:wrap;border-bottom:1px solid rgba(42,45,54,0.4)}
#room-filters-label{font-size:9px;color:#4a4e5e;padding:3px 0;flex-shrink:0;margin-right:2px}
#list{flex:1;overflow-y:auto;padding:4px;min-height:0;display:flex;flex-direction:column-reverse}
.d-item{display:flex;align-items:center;padding:5px 10px;margin:2px 4px;border-radius:6px;gap:10px;transition:background 0.15s;animation:fadeIn 0.25s ease}
.d-item:hover{background:rgba(249,115,22,0.04)}
.d-gift{background:rgba(249,115,22,0.06);border:1px solid rgba(249,115,22,0.15)}
.d-gift:hover{background:rgba(249,115,22,0.1)}
.d-social{background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15)}
.d-time{font-size:10px;color:#3a3d46;flex-shrink:0;font-variant-numeric:tabular-nums}
.d-tag{font-size:10px;color:#fff;padding:2px 8px;border-radius:4px;flex-shrink:0;font-weight:500}
.t-chat{background:#3a3d46}.t-gift{background:linear-gradient(135deg,#f97316,#ea580c)}.t-member{background:#10b981}.t-like{background:#ef4444}.t-social{background:#3b82f6}
.d-text{font-size:12px;color:#c0c2c8;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.d-user{color:#f97316;font-weight:500}
.d-room-tag{font-size:9px;color:#3b82f6;padding:1px 5px;border-radius:3px;background:rgba(59,130,246,0.1);flex-shrink:0;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#2a2d36;border-radius:2px}
</style></head><body>
<div id="container">
<div id="titlebar"><span>弹幕浮窗</span>
<div id="controls">
<input id="opacity" type="range" min="30" max="100" value="85" title="透明度">
<button id="closeBtn">✕</button>
</div></div>
<div id="filters">
<button class="f-chip active" data-filter="">全部</button>
<button class="f-chip" data-filter="Chat">弹幕</button>
<button class="f-chip" data-filter="Gift">礼物</button>
<button class="f-chip" data-filter="Like">点赞</button>
<button class="f-chip" data-filter="Member">进入</button>
<button class="f-chip" data-filter="Social">关注</button>
</div>
<div id="room-filters"><span id="room-filters-label">房间:</span></div>
<div id="list"></div></div>
<script>
const { ipcRenderer } = require('electron')
const list = document.getElementById('list')
const roomFilters = document.getElementById('room-filters')
const MAX = 100
const labels = {Chat:'弹幕',Gift:'礼物',Like:'点赞',Member:'进入',Social:'关注'}
let filterType = ''
let filterRoomId = ''
let allMsgs = []
let autoScroll = true
let rooms = []

list.addEventListener('scroll', () => { autoScroll = list.scrollTop + list.clientHeight >= list.scrollHeight - 40 })

function buildRoomChips() {
  let html = '<span id="room-filters-label">房间:</span>'
  html += '<button class="r-chip' + (filterRoomId === '' ? ' active' : '') + '" data-room="">全部</button>'
  rooms.forEach(r => {
    html += '<button class="r-chip' + (filterRoomId === r.roomId ? ' active' : '') + '" data-room="' + r.roomId + '">' + esc(r.nickname) + '</button>'
  })
  roomFilters.innerHTML = html
  roomFilters.querySelectorAll('.r-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('.r-chip').forEach(c => c.classList.remove('active'))
      chip.classList.add('active')
      filterRoomId = chip.dataset.room
      renderList()
    }
  })
}

document.querySelectorAll('.f-chip').forEach(chip => {
  chip.onclick = () => {
    document.querySelectorAll('.f-chip').forEach(c => c.classList.remove('active'))
    chip.classList.add('active')
    filterType = chip.dataset.filter
    renderList()
  }
})

function timeStr() { const d = new Date(); return d.toTimeString().substring(0,8) }
function esc(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML }

function renderList() {
  list.innerHTML = ''
  let msgs = allMsgs
  if (filterType) msgs = msgs.filter(m => m.type === filterType)
  if (filterRoomId) msgs = msgs.filter(m => m.roomId === filterRoomId)
  msgs.slice(0, MAX).forEach(msg => appendRow(msg))
  if (autoScroll) list.scrollTop = list.scrollHeight
}

function appendRow(msg) {
  const item = document.createElement('div')
  item.className = 'd-item' + (msg.type==='Gift'?' d-gift':'') + (msg.type==='Social'?' d-social':'')
  const time = document.createElement('span');time.className='d-time';time.textContent=timeStr()
  const roomTag = document.createElement('span');roomTag.className='d-room-tag';roomTag.textContent=msg.roomNickname||''
  const tag = document.createElement('span');tag.className='d-tag t-'+(msg.type||'chat').toLowerCase();tag.textContent=labels[msg.type]||msg.type||'弹幕'
  const text = document.createElement('span');text.className='d-text'
  const user = document.createElement('span');user.className='d-user';user.textContent=(msg.userName||'未知')+' '
  text.appendChild(user)
  if (msg.type==='Chat') text.appendChild(document.createTextNode(msg.content||''))
  else if (msg.type==='Gift') text.appendChild(document.createTextNode('赠送 '+esc(msg.giftName||'礼物')+' x'+(msg.giftCount||1)))
  else if (msg.type==='Member') text.appendChild(document.createTextNode('进入直播间'))
  else if (msg.type==='Like') text.appendChild(document.createTextNode('点赞了'+(msg.likeCount||1)+'次'))
  else if (msg.type==='Social') text.appendChild(document.createTextNode('关注了主播'))
  else text.appendChild(document.createTextNode(msg.content||''))
  item.appendChild(time);item.appendChild(roomTag);item.appendChild(tag);item.appendChild(text)
  list.insertBefore(item, list.firstChild)
}

ipcRenderer.on('floating:danmu', (_e, msg) => {
  allMsgs.unshift(msg)
  if (allMsgs.length > MAX * 2) allMsgs.length = MAX * 2
  if ((!filterType || filterType === msg.type) && (!filterRoomId || filterRoomId === msg.roomId)) {
    appendRow(msg)
    while (list.children.length > MAX) list.removeChild(list.lastChild)
    if (autoScroll) list.scrollTop = list.scrollHeight
  }
})

ipcRenderer.on('floating:rooms', (_e, newRooms) => {
  rooms = newRooms || []
  buildRoomChips()
})

document.getElementById('closeBtn').onclick = () => ipcRenderer.send('floating:action', 'close')
document.getElementById('opacity').oninput = (e) => ipcRenderer.send('floating:action', 'opacity', e.target.value/100)

function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
</script></body></html>`

export function createFloatingDanmu(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.focus()
    return
  }

  floatingWindow = new BrowserWindow({
    width: 540,
    height: 340,
    minWidth: 320,
    minHeight: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  })

  floatingWindow.setAlwaysOnTop(true, 'screen-saver')
  floatingWindow.setVisibleOnAllWorkspaces(true)
  floatingWindow.setOpacity(0.85)

  const tmpPath = path.join(app.getPath('temp'), 'hermes-floating-danmu.html')
  fs.writeFileSync(tmpPath, HTML, 'utf-8')
  floatingWindow.loadFile(tmpPath)

  floatingWindow.on('closed', () => { floatingWindow = null; mainWin?.webContents.send('floating:on-closed') })
}

export function closeFloatingDanmu(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.close()
    floatingWindow = null
    mainWin?.webContents.send('floating:on-closed')
  }
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWin = win
}

export function sendDanmuToFloating(msg: { type: string; userName: string; content: string; giftName?: string; giftCount?: number; likeCount?: number; roomId?: string; roomNickname?: string }): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('floating:danmu', msg)
  }
}

export function sendRoomList(nicknames: Map<string, string>): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    const rooms = Array.from(nicknames.entries()).map(([roomId, nickname]) => ({ roomId, nickname }))
    floatingWindow.webContents.send('floating:rooms', rooms)
  }
}

export function registerFloatingIPC(): void {
  ipcMain.on('floating:action', (_e, action: string, value?: number) => {
    if (action === 'close') {
      closeFloatingDanmu()
    } else if (action === 'opacity' && floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setOpacity(Math.max(0.3, Math.min(1, value || 0.85)))
    }
  })
}
