import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface QuickReplyGroup {
  name: string
  expanded: boolean
  items: string[]
  _tab: 'edit' | 'send'
}

export interface QuickReplyInstance {
  id: number
  name: string
  roomUrl: string
  status: 'idle' | 'running'
  expanded: boolean
  quickReplyGroups: QuickReplyGroup[]
  sendInput: string
  inputSelector: string | null
  sendSelector: string | null
  inputPinState: string
  _stripped: boolean
}

function defaultInstance(id: number): QuickReplyInstance {
  return {
    id, name: `实例 ${id}`, roomUrl: '', status: 'idle', expanded: false, _stripped: true,
    quickReplyGroups: [{ name: '默认分组', expanded: true, items: ['欢迎来到直播间！', '谢谢关注~', '点点赞支持一下'], _tab: 'send' }],
    sendInput: '', inputSelector: null, sendSelector: null, inputPinState: ''
  }
}

const STORAGE_KEY = 'quickReplyGroups_v1'
const NEXT_ID_KEY = 'quickReply_nextId'

function getNextId(): number {
  try { const raw = localStorage.getItem(NEXT_ID_KEY); return raw ? parseInt(raw, 10) : 1 } catch { return 1 }
}
function saveNextId(id: number) { try { localStorage.setItem(NEXT_ID_KEY, String(id)) } catch {} }

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
          quickReplyGroups: Array.isArray(item.quickReplyGroups) ? item.quickReplyGroups : [{ name: '默认分组', expanded: true, items: [], _tab: 'send' }],
          inputSelector: item.inputSelector ?? null,
          sendSelector: item.sendSelector ?? null,
          _stripped: item._stripped ?? true,
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
      inputSelector: i.inputSelector, sendSelector: i.sendSelector,
      _stripped: i._stripped,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch {}
}

export const useQuickReplyStore = defineStore('quickReply', () => {
  const instances = ref<QuickReplyInstance[]>(loadFromStorage())
  function persist() { saveToStorage(instances.value) }

  function sendViaWebview(webview: any, text: string, inputSelector: string | null, sendSelector: string | null): Promise<{ success: boolean; error?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    try {
      return webview.executeJavaScript(`
        (async function() {
          try {
            const txt = ${JSON.stringify(text)};
            const inputSel = ${JSON.stringify(inputSelector || null)};
            const sendSel = ${JSON.stringify(sendSelector || null)};
            let inputBox = null;
            if (inputSel) { try { inputBox = document.querySelector(inputSel); } catch(e) {} }
            if (!inputBox || !inputBox.isConnected) {
              const editables = document.querySelectorAll('div[contenteditable="true"]');
              for (const e of editables) { if (e.isConnected) { const s = getComputedStyle(e); if (s.display !== 'none') { inputBox = e; break; } } }
            }
            if (!inputBox || !inputBox.isConnected) {
              const textareas = document.querySelectorAll('textarea');
              for (const t of textareas) { if (t.isConnected) { inputBox = t; break; } }
            }
            if (!inputBox) return { success: false, error: '未找到输入框' };
            inputBox.innerHTML = '';
            inputBox.focus();
            document.execCommand('insertText', false, txt);
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
            let sendBtn = null;
            if (sendSel) { try { sendBtn = document.querySelector(sendSel); } catch(e) {} }
            if (!sendBtn || !sendBtn.isConnected) {
              const all = document.querySelectorAll('button, [role="button"], div, span');
              for (const el of all) {
                if (!el.isConnected || el.offsetWidth === 0) continue;
                const t = (el.textContent || '').trim();
                if (t === '发送' || t === 'Send') { sendBtn = el; break; }
              }
            }
            if (!sendBtn) return { success: false, error: '未找到发送按钮' };
            let btn = sendBtn;
            for (let i = 0; i < 5 && btn && btn.tagName !== 'BUTTON'; i++) { btn = btn.parentElement; }
            if (btn && btn.tagName === 'BUTTON') sendBtn = btn;
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

  function pinInputSelector(webview: any, instId: number): Promise<{ success: boolean; error?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    try {
      return webview.executeJavaScript(`
        (function() {
          try {
            document.addEventListener('click', function handler(e) {
              document.removeEventListener('click', handler, true);
              e.preventDefault(); e.stopPropagation();
              const el = e.target;
              function buildSelector(el) {
                if (el.id) return '#' + CSS.escape(el.id);
                const path = []; let cur = el;
                while (cur && cur !== document.body) {
                  let seg = cur.tagName.toLowerCase();
                  if (cur.className && typeof cur.className === 'string') {
                    const cls = cur.className.trim().split(/\\\\s+/).slice(0, 2);
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
              el.style.outline = '3px solid var(--primary)';
              setTimeout(function() { el.style.outline = '' }, 3000);
              window.__hermesPinned = { selector: buildSelector(el), tag: el.tagName, text: (el.textContent||'').substring(0, 50) };
            }, { once: true, capture: true });
            return { success: true };
          } catch(err) { return { success: false, error: err.message }; }
        })()
      `).then(() => {
        return new Promise((resolve) => {
          const start = Date.now()
          const poll = setInterval(async () => {
            try {
              const result = await webview.executeJavaScript('window.__hermesPinned || null')
              if (result) {
                clearInterval(poll); delete result.then
                const inst = instances.value.find(i => i.id === instId)
                if (inst) { inst.inputSelector = result.selector; inst.inputPinState = 'ok'; persist() }
                resolve({ success: true })
              } else if (Date.now() - start > 20000) {
                clearInterval(poll)
                const inst = instances.value.find(i => i.id === instId)
                if (inst) inst.inputPinState = ''
                resolve({ success: false, error: '定位超时' })
              }
            } catch (e) { clearInterval(poll); resolve({ success: false, error: String(e) }) }
          }, 500)
        })
      })
    } catch (e: any) { return Promise.resolve({ success: false, error: e.message }) }
  }

  function pinSendSelector(webview: any, instId: number): Promise<{ success: boolean; error?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    try {
      return webview.executeJavaScript(`
        (function() {
          try {
            document.addEventListener('click', function handler(e) {
              document.removeEventListener('click', handler, true);
              e.preventDefault(); e.stopPropagation();
              const el = e.target;
              function buildSelector(el) {
                if (el.id) return '#' + CSS.escape(el.id);
                const path = []; let cur = el;
                while (cur && cur !== document.body) {
                  let seg = cur.tagName.toLowerCase();
                  if (cur.className && typeof cur.className === 'string') {
                    const cls = cur.className.trim().split(/\\\\s+/).slice(0, 2);
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
              window.__hermesSendPinned = { selector: buildSelector(el), tag: el.tagName, text: (el.textContent||'').substring(0, 50) };
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
                if (inst) { inst.sendSelector = result.selector; inst.inputPinState = 'send-ok'; persist() }
                resolve({ success: true })
              } else if (Date.now() - start > 20000) {
                clearInterval(poll); resolve({ success: false, error: '定位超时' })
              }
            } catch (e) { clearInterval(poll); resolve({ success: false, error: String(e) }) }
          }, 500)
        })
      })
    } catch (e: any) { return Promise.resolve({ success: false, error: e.message }) }
  }

  function clearInputSelector(instId: number) {
    const inst = instances.value.find(i => i.id === instId)
    if (inst) { inst.inputSelector = null; inst.sendSelector = null; inst.inputPinState = ''; persist() }
  }

  function addGroup(id: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst) { inst.quickReplyGroups.push({ name: '新分组', expanded: true, items: [], _tab: 'send' }); persist() }
  }
  function removeGroup(id: number, gIdx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst) { inst.quickReplyGroups.splice(gIdx, 1); persist() }
  }
  function toggleGroup(id: number, gIdx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) { inst.quickReplyGroups[gIdx].expanded = !inst.quickReplyGroups[gIdx].expanded; persist() }
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

  function addInstance() {
    const maxId = instances.value.reduce((max, i) => Math.max(max, i.id), 0)
    const nextId = Math.max(getNextId(), maxId + 1)
    saveNextId(nextId + 1)
    instances.value.push(defaultInstance(nextId))
    persist()
  }
  function removeInstance(id: number) {
    if (instances.value.length <= 1) return
    const idx = instances.value.findIndex(i => i.id === id)
    if (idx !== -1) {
      const inst = instances.value[idx]
      if (inst.status === 'running') inst.status = 'idle'
      instances.value.splice(idx, 1)
      persist()
    }
  }

  // ===== 导入导出（单分组） =====
  function exportGroup(instId: number, gIdx: number): string | null {
    const inst = instances.value.find(i => i.id === instId)
    if (!inst || !inst.quickReplyGroups[gIdx]) return null
    const g = inst.quickReplyGroups[gIdx]
    return JSON.stringify({ name: g.name, items: g.items.filter(t => t.trim()) }, null, 2)
  }

  function importGroupAsNew(json: string, targetInstId?: number): { success: boolean; error?: string; name?: string } {
    try {
      const data = JSON.parse(json)
      const name = data.name || '导入的分组'
      const items = Array.isArray(data.items) ? data.items : []
      const target = targetInstId ? instances.value.find(i => i.id === targetInstId) : instances.value[0]
      if (!target) return { success: false, error: '没有可用的实例' }
      target.quickReplyGroups.push({ name, expanded: true, items: [...items], _tab: 'send' })
      persist()
      return { success: true, name }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  return {
    instances, sendViaWebview, pinInputSelector, pinSendSelector, clearInputSelector,
    addGroup, removeGroup, toggleGroup, setGroupName,
    addQuickReply, removeQuickReply, setQuickReply,
    addInstance, removeInstance,
    exportGroup, importGroupAsNew
  }
})
