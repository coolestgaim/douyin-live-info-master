import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DanmuMessage } from '../types'
import { useDanmuStore } from './danmu'

export interface QuickReplyGroup {
  name: string
  expanded: boolean
  items: string[]
}

export interface QuickReplyInstance {
  id: number
  name: string
  roomUrl: string
  status: 'idle' | 'running'
  expanded: boolean
  quickReplyGroups: QuickReplyGroup[]
  sendInput: string
  lastDanmu: DanmuMessage[]
  inputSelector: string | null
  sendSelector: string | null
  inputPinState: string
}

function defaultInstance(id: number): QuickReplyInstance {
  return {
    id, name: `实例 ${id}`, roomUrl: '', status: 'idle', expanded: false,
    quickReplyGroups: [{ name: '默认分组', expanded: true, items: ['欢迎来到直播间！', '谢谢关注~', '点点赞支持一下'] }],
    sendInput: '', lastDanmu: [],
    inputSelector: null, sendSelector: null, inputPinState: ''
  }
}

const STORAGE_KEY = 'quickReplyGroups_v1'
const NEXT_ID_KEY = 'quickReply_nextId'

function getNextId(): number {
  try {
    const raw = localStorage.getItem(NEXT_ID_KEY)
    return raw ? parseInt(raw, 10) : 1
  } catch { return 1 }
}
function saveNextId(id: number) {
  try { localStorage.setItem(NEXT_ID_KEY, String(id)) } catch {}
}

function loadFromStorage(): QuickReplyInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data) && data.length >= 1) {
        return data.map((item: any) => ({
          ...defaultInstance(item.id ?? 1),
          id: item.id ?? 1,
          name: item.name ?? '实例',
          quickReplyGroups: Array.isArray(item.quickReplyGroups) ? item.quickReplyGroups : [{ name: '默认分组', expanded: true, items: [] }],
          inputSelector: item.inputSelector ?? null,
          sendSelector: item.sendSelector ?? null,
        }))
      }
    }
  } catch {}
  return [defaultInstance(1), defaultInstance(2)]
}

function saveToStorage(instances: QuickReplyInstance[]) {
  try {
    const slim = instances.map(i => ({
      id: i.id, name: i.name, quickReplyGroups: i.quickReplyGroups,
      inputSelector: i.inputSelector,
      sendSelector: i.sendSelector,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch {}
}

export const useQuickReplyStore = defineStore('quickReply', () => {
  const instances = ref<QuickReplyInstance[]>(loadFromStorage())

  const danmuStore = useDanmuStore()

  function persist() { saveToStorage(instances.value) }

  function updateDanmuMonitor() {
    for (const inst of instances.value) {
      if (inst.status === 'running') inst.lastDanmu = danmuStore.filteredChatMessages.slice(0, 20)
    }
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null
  function startPolling() { if (!pollTimer) pollTimer = setInterval(updateDanmuMonitor, 2000) }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

  // ===== 新方案：定位 → 填字 → 回车 =====

  function sendViaWebview(webview: any, text: string, inputSelector: string | null, sendSelector: string | null): Promise<{ success: boolean; error?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    try {
      return webview.executeJavaScript(`
        (async function() {
          try {
            const txt = ${JSON.stringify(text)};
            const inputSel = ${JSON.stringify(inputSelector || null)};
            const sendSel = ${JSON.stringify(sendSelector || null)};

            // 找输入框
            let inputBox = null;
            if (inputSel) {
              try { inputBox = document.querySelector(inputSel); } catch(e) {}
            }
            if (!inputBox || !inputBox.isConnected) {
              const editables = document.querySelectorAll('div[contenteditable="true"]');
              for (const e of editables) {
                if (e.isConnected) { const s = getComputedStyle(e); if (s.display !== 'none') { inputBox = e; break; } }
              }
            }
            if (!inputBox || !inputBox.isConnected) {
              const textareas = document.querySelectorAll('textarea');
              for (const t of textareas) { if (t.isConnected) { inputBox = t; break; } }
            }
            if (!inputBox) return { success: false, error: '未找到输入框' };

            // 填入文字
            inputBox.innerHTML = '';
            inputBox.focus();
            document.execCommand('insertText', false, txt);
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));

            // 找发送按钮
            let sendBtn = null;
            if (sendSel) {
              try { sendBtn = document.querySelector(sendSel); } catch(e) {}
            }
            if (!sendBtn || !sendBtn.isConnected) {
              // fallback: 找包含"发送"文字的可点击元素
              const all = document.querySelectorAll('button, [role="button"], div, span');
              for (const el of all) {
                if (!el.isConnected || el.offsetWidth === 0) continue;
                const t = (el.textContent || '').trim();
                if (t === '发送' || t === 'Send') { sendBtn = el; break; }
              }
            }
            if (!sendBtn) return { success: false, error: '未找到发送按钮，请先定位发送按钮' };

            // 自动向上找最近的 <button> 标签（避免定位到 span/svg 子元素）
            let btn = sendBtn;
            for (let i = 0; i < 5 && btn && btn.tagName !== 'BUTTON'; i++) {
              btn = btn.parentElement;
            }
            if (btn && btn.tagName === 'BUTTON') sendBtn = btn;

            // 模拟真人操作：3秒内随机分散点击
            function clickOnce(el) {
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
            await new Promise(r => setTimeout(r, 200 + Math.random() * 800));
            clickOnce(sendBtn);
            await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
            clickOnce(sendBtn);
            await new Promise(r => setTimeout(r, 400 + Math.random() * 800));
            clickOnce(sendBtn);
            if (typeof sendBtn.click === 'function') sendBtn.click();
            await new Promise(r => setTimeout(r, 200));
            return { success: true };
          } catch(err) { return { success: false, error: err.message }; }
        })()
      `)
    } catch (e: any) { return Promise.resolve({ success: false, error: e.message }) }
  }

  // ===== 定位输入框 =====

  function pinInputSelector(webview: any, instId: number): Promise<{ success: boolean; selector?: string; tag?: string; text?: string; error?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    try {
      return webview.executeJavaScript(`
        (function() {
          try {
            document.addEventListener('click', function handler(e) {
              document.removeEventListener('click', handler, true);
              e.preventDefault();
              e.stopPropagation();
              const el = e.target;
              function buildSelector(el) {
                if (el.id) return '#' + CSS.escape(el.id);
                const path = [];
                let cur = el;
                while (cur && cur !== document.body) {
                  let seg = cur.tagName.toLowerCase();
                  if (cur.className && typeof cur.className === 'string') {
                    const cls = cur.className.trim().split(/\\s+/).slice(0, 2);
                    if (cls.length) seg += '.' + cls.map(function(c){ return CSS.escape(c) }).join('.');
                  }
                  const parent = cur.parentElement;
                  if (parent) {
                    const siblings = Array.from(parent.children).filter(function(c) { return c.tagName === cur.tagName });
                    if (siblings.length > 1) seg += ':nth-of-type(' + (siblings.indexOf(cur)+1) + ')';
                  }
                  path.unshift(seg);
                  if (document.querySelectorAll(path.join(' > ')).length === 1) break;
                  cur = cur.parentElement;
                }
                return path.join(' > ');
              }
              el.style.outline = '3px solid #f97316';
              setTimeout(function() { el.style.outline = '' }, 3000);
              window.__hermesPinned = {
                selector: buildSelector(el),
                tag: el.tagName,
                text: (el.textContent||'').substring(0, 50)
              };
            }, { once: true, capture: true });
            return { success: true };
          } catch(err) { return { success: false, error: err.message }; }
        })()
      `).then(() => {
        // Poll 等待用户点击
        return new Promise((resolve) => {
          const start = Date.now()
          const poll = setInterval(async () => {
            try {
              const result = await webview.executeJavaScript('window.__hermesPinned || null')
              if (result) {
                clearInterval(poll)
                delete result.then // just in case
                const inst = instances.value.find(i => i.id === instId)
                if (inst) {
                  inst.inputSelector = result.selector
                  inst.inputPinState = 'ok'
                  persist()
                }
                resolve({ success: true, ...result })
              } else if (Date.now() - start > 20000) {
                clearInterval(poll)
                const inst = instances.value.find(i => i.id === instId)
                if (inst) inst.inputPinState = ''
                resolve({ success: false, error: '定位超时，请重试' })
              }
            } catch (e) {
              clearInterval(poll)
              resolve({ success: false, error: String(e) })
            }
          }, 500)
        })
      })
    } catch (e: any) { return Promise.resolve({ success: false, error: e.message }) }
  }

  function clearInputSelector(instId: number) {
    const inst = instances.value.find(i => i.id === instId)
    if (inst) { inst.inputSelector = null; inst.sendSelector = null; inst.inputPinState = ''; persist() }
  }

  // ===== 定位发送按钮 =====

  function pinSendSelector(webview: any, instId: number): Promise<{ success: boolean; selector?: string; tag?: string; text?: string; error?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    try {
      return webview.executeJavaScript(`
        (function() {
          try {
            document.addEventListener('click', function handler(e) {
              document.removeEventListener('click', handler, true);
              e.preventDefault();
              e.stopPropagation();
              const el = e.target;
              function buildSelector(el) {
                if (el.id) return '#' + CSS.escape(el.id);
                const path = [];
                let cur = el;
                while (cur && cur !== document.body) {
                  let seg = cur.tagName.toLowerCase();
                  if (cur.className && typeof cur.className === 'string') {
                    const cls = cur.className.trim().split(/\\s+/).slice(0, 2);
                    if (cls.length) seg += '.' + cls.map(function(c){ return CSS.escape(c) }).join('.');
                  }
                  const parent = cur.parentElement;
                  if (parent) {
                    const siblings = Array.from(parent.children).filter(function(c) { return c.tagName === cur.tagName });
                    if (siblings.length > 1) seg += ':nth-of-type(' + (siblings.indexOf(cur)+1) + ')';
                  }
                  path.unshift(seg);
                  if (document.querySelectorAll(path.join(' > ')).length === 1) break;
                  cur = cur.parentElement;
                }
                return path.join(' > ');
              }
              el.style.outline = '3px solid #22c55e';
              setTimeout(function() { el.style.outline = '' }, 3000);
              window.__hermesSendPinned = {
                selector: buildSelector(el),
                tag: el.tagName,
                text: (el.textContent||'').substring(0, 50)
              };
            }, { once: true, capture: true });
            return { success: true };
          } catch(err) { return { success: false, error: err.message }; }
        })()
      `).then(() => {
        return new Promise((resolve) => {
          const start = Date.now()
          const poll = setInterval(async () => {
            try {
              const result = await webview.executeJavaScript('window.__hermesSendPinned || null')
              if (result) {
                clearInterval(poll)
                const inst = instances.value.find(i => i.id === instId)
                if (inst) {
                  inst.sendSelector = result.selector
                  inst.inputPinState = 'send-ok'
                  persist()
                }
                resolve({ success: true, ...result })
              } else if (Date.now() - start > 20000) {
                clearInterval(poll)
                resolve({ success: false, error: '定位超时，请重试' })
              }
            } catch (e) {
              clearInterval(poll)
              resolve({ success: false, error: String(e) })
            }
          }, 500)
        })
      })
    } catch (e: any) { return Promise.resolve({ success: false, error: e.message }) }
  }

  // ===== 分组管理 =====

  function addGroup(id: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst) { inst.quickReplyGroups.push({ name: '新分组', expanded: true, items: [] }); persist() }
  }
  function removeGroup(id: number, gIdx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst) { inst.quickReplyGroups.splice(gIdx, 1); persist() }
  }
  function toggleGroup(id: number, gIdx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) {
      inst.quickReplyGroups[gIdx].expanded = !inst.quickReplyGroups[gIdx].expanded; persist()
    }
  }
  function setGroupName(id: number, gIdx: number, name: string) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) { inst.quickReplyGroups[gIdx].name = name; persist() }
  }
  function addQuickReply(id: number, gIdx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) { inst.quickReplyGroups[gIdx].items.push(''); persist() }
  }
  function removeQuickReply(id: number, gIdx: number, idx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) { inst.quickReplyGroups[gIdx].items.splice(idx, 1); persist() }
  }
  function setQuickReply(id: number, gIdx: number, idx: number, text: string) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) { inst.quickReplyGroups[gIdx].items[idx] = text; persist() }
  }

  // ===== 实例管理 =====

  function addInstance() {
    const maxId = instances.value.reduce((max, i) => Math.max(max, i.id), 0)
    const nextId = Math.max(getNextId(), maxId + 1)
    saveNextId(nextId + 1)
    instances.value.push(defaultInstance(nextId))
    persist()
  }

  function removeInstance(id: number) {
    if (instances.value.length <= 1) return // 至少保留一个
    const idx = instances.value.findIndex(i => i.id === id)
    if (idx !== -1) {
      const inst = instances.value[idx]
      if (inst.status === 'running') {
        inst.status = 'idle'
        inst.lastDanmu = []
      }
      instances.value.splice(idx, 1)
      // 检查是否还有运行中的实例
      if (!instances.value.some(i => i.status === 'running')) stopPolling()
      persist()
    }
  }

  // ===== 导入导出 =====

  function exportGroups(): string {
    const data = instances.value.map(i => ({
      instanceName: i.name,
      groups: i.quickReplyGroups.map(g => ({
        name: g.name,
        items: g.items.filter(t => t.trim())
      }))
    }))
    return JSON.stringify(data, null, 2)
  }

  function importGroups(json: string): { success: boolean; error?: string; count?: number } {
    try {
      const data = JSON.parse(json)
      if (!Array.isArray(data)) return { success: false, error: '无效格式：需要数组' }
      let count = 0
      for (const item of data) {
        // 按实例名匹配
        const inst = instances.value.find(i => i.name === item.instanceName)
        if (inst && item.groups && Array.isArray(item.groups)) {
          const newGroups = item.groups.map((g: any) => ({
            name: g.name || '未命名',
            expanded: true,
            items: Array.isArray(g.items) ? g.items : []
          }))
          inst.quickReplyGroups.splice(0, inst.quickReplyGroups.length, ...newGroups)
          count++
        }
      }
      // 名字没匹配上的，按序号兜底覆盖
      if (count === 0) {
        for (let i = 0; i < Math.min(data.length, instances.value.length); i++) {
          const item = data[i]
          if (item.groups && Array.isArray(item.groups)) {
            const newGroups = item.groups.map((g: any) => ({
              name: g.name || '未命名',
              expanded: true,
              items: Array.isArray(g.items) ? g.items : []
            }))
            instances.value[i].quickReplyGroups.splice(0, instances.value[i].quickReplyGroups.length, ...newGroups)
            count++
          }
        }
      }
      persist()
      return { success: true, count }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  return {
    instances, sendViaWebview, pinInputSelector, pinSendSelector, clearInputSelector,
    addGroup, removeGroup, toggleGroup, setGroupName,
    addQuickReply, removeQuickReply, setQuickReply,
    addInstance, removeInstance,
    exportGroups, importGroups,
    updateDanmuMonitor, startPolling, stopPolling
  }
})
