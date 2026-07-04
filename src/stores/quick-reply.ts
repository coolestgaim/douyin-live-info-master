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
}

function defaultInstance(id: number): QuickReplyInstance {
  return {
    id, name: `实例 ${id}`, roomUrl: '', status: 'idle', expanded: false,
    quickReplyGroups: [{ name: '默认分组', expanded: true, items: ['欢迎来到直播间！', '谢谢关注~', '点点赞支持一下'] }],
    sendInput: '', lastDanmu: []
  }
}

const STORAGE_KEY = 'quickReplyGroups_v1'

function loadFromStorage(): QuickReplyInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data) && data.length === 3) {
        // Merge saved data with full defaults so all fields are present
        return data.map((item: any, idx: number) => ({
          ...defaultInstance(idx + 1),
          id: item.id ?? idx + 1,
          name: item.name ?? defaultInstance(idx + 1).name,
          quickReplyGroups: Array.isArray(item.quickReplyGroups) ? item.quickReplyGroups : defaultInstance(idx + 1).quickReplyGroups,
        }))
      }
    }
  } catch {}
  return [defaultInstance(1), defaultInstance(2), defaultInstance(3)]
}

function saveToStorage(instances: QuickReplyInstance[]) {
  try {
    const slim = instances.map(i => ({
      id: i.id, name: i.name, quickReplyGroups: i.quickReplyGroups
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

  function sendViaWebview(webview: any, text: string): Promise<{ success: boolean; error?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    try {
      return webview.executeJavaScript(`
        (async function() {
          try {
            const txt = ${JSON.stringify(text)};
            function findInput(doc) {
              let el = doc.querySelector('div[contenteditable="true"][data-placeholder="说点什么..."]');
              if (el) return el;
              el = doc.querySelector('div[contenteditable="true"][data-placeholder*="说"], div[contenteditable="true"][data-placeholder*="发"]');
              if (el) return el;
              const textareas = doc.querySelectorAll('textarea');
              for (const t of textareas) { if (t.isConnected) return t; }
              const editables = doc.querySelectorAll('div[contenteditable="true"]');
              for (const e of editables) { if (e.isConnected) { const s = getComputedStyle(e); if (s.display !== 'none') return e; } }
              return null;
            }
            let inputBox = findInput(document);
            if (!inputBox) {
              const iframes = document.querySelectorAll('iframe');
              for (const iframe of iframes) {
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow.document;
                  if (doc) { inputBox = findInput(doc); if (inputBox) break; }
                } catch(e) {}
              }
            }
            if (!inputBox) return { success: false, error: '未找到聊天输入框' };
            inputBox.innerText = txt;
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            inputBox.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 200));
            function findByText(doc, txt) {
              const all = doc.querySelectorAll('button, [role="button"], div, span, a, i, svg');
              for (const el of all) {
                if (!el.isConnected) continue;
                const t = (el.textContent || el.getAttribute('aria-label') || el.title || '').trim();
                if (t.includes(txt)) return el;
              }
              return null;
            }
            let sendBtn = findByText(document, '发送');
            if (!sendBtn) {
              const iframes = document.querySelectorAll('iframe');
              for (const iframe of iframes) {
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow.document;
                  if (doc) { sendBtn = findByText(doc, '发送'); if (sendBtn) break; }
                } catch(e) {}
              }
            }
            if (!sendBtn) {
              let el = inputBox;
              for (let i = 0; i < 5 && el; i++) {
                el = el.parentElement;
                if (!el) break;
                const nearby = el.querySelectorAll('*');
                for (const n of nearby) {
                  const t = (n.textContent || '').trim();
                  if ((t === '发送' || t === 'Send') && n.offsetWidth > 0) { sendBtn = n; break; }
                }
                if (sendBtn) break;
              }
            }
            if (!sendBtn) {
              inputBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
              inputBox.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
              return { success: true };
            }
            if (sendBtn.disabled) return { success: false, error: '发送按钮被禁用' };
            sendBtn.click();
            return { success: true };
          } catch(err) { return { success: false, error: err.message }; }
        })()
      `)
    } catch (e: any) { return Promise.resolve({ success: false, error: e.message }) }
  }

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

  return {
    instances, sendViaWebview,
    addGroup, removeGroup, toggleGroup, setGroupName,
    addQuickReply, removeQuickReply, setQuickReply,
    updateDanmuMonitor, startPolling, stopPolling
  }
})
