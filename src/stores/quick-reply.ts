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
  /** 网页缩放（1 = 100%） */
  zoom: number
  /** 直播精简模式：隐藏聊天区只留直播画面 */
  liveMode: boolean
  /** 直播平台（douyin/bilibili/huya/kuaishou/common），决定功能按钮组与预设 selector */
  platform: string
}

function defaultInstance(id: number): QuickReplyInstance {
  return {
    id, name: `实例 ${id}`, roomUrl: '', status: 'idle', expanded: false, _stripped: true,
    zoom: 1, liveMode: false, platform: 'common',
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
          platform: item.platform ?? 'common',
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
      _stripped: i._stripped, platform: i.platform,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch {}
}

export const useQuickReplyStore = defineStore('quickReply', () => {
  const instances = ref<QuickReplyInstance[]>(loadFromStorage())
  function persist() { saveToStorage(instances.value) }

  function sendViaWebview(webview: any, text: string, inputSelector: string | null, sendSelector: string | null, mode: 'auto' | 'enter' | 'button' = 'auto'): Promise<{ success: boolean; error?: string; sent?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    try {
      return webview.executeJavaScript(`
        (async function() {
          try {
            const txt = ${JSON.stringify(text)};
            const inputSel = ${JSON.stringify(inputSelector || null)};
            const sendSel = ${JSON.stringify(sendSelector || null)};
            const mode = ${JSON.stringify(mode)};
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const visible = (el) => el && el.isConnected && el.getClientRects().length > 0;
            // 深查找：主文档 + 同源 iframe 内都能找到（跨域 iframe 无法访问，需在 iframe 内单独定位）
            const queryDeep = (sel) => {
              const all = [];
              try { const r = document.querySelectorAll(sel); for (let i = 0; i < r.length; i++) all.push(r[i]); } catch(e) {}
              const frames = document.querySelectorAll('iframe');
              for (let f = 0; f < frames.length; f++) {
                try {
                  const doc = frames[f].contentDocument;
                  if (!doc) continue;
                  const rr = doc.querySelectorAll(sel);
                  for (let i = 0; i < rr.length; i++) all.push(rr[i]);
                } catch(e) {}
              }
              return all;
            };
            // 1. 找输入框：selector（含 iframe）→ contenteditable → textarea
            let inputBox = null;
            if (inputSel) {
              const list = queryDeep(inputSel);
              for (const el of list) { if (visible(el)) { inputBox = el; break; } }
            }
            if (!inputBox) {
              const editables = document.querySelectorAll('div[contenteditable="true"], [contenteditable="true"]');
              for (const e of editables) { if (visible(e)) { inputBox = e; break; } }
            }
            if (!inputBox) {
              const tas = document.querySelectorAll('textarea');
              for (const t of tas) { if (visible(t)) { inputBox = t; break; } }
            }
            if (!inputBox) return { success: false, error: '未找到输入框' };
            // 2. 填值（只写一次，严禁双写：setter 赋值后不得再 insertText，否则内容会重复成"欢迎欢迎"）
            if (inputBox.isContentEditable) {
              inputBox.focus();
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, txt);
              // 校验：若 selectAll 未生效导致内容被追加（≠目标文本），清空后重插一次
              if ((inputBox.textContent || '').trim() !== txt.trim()) {
                inputBox.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
                document.execCommand('insertText', false, txt);
              }
            } else {
              // input/textarea：原生 setter 一次性赋值（受控组件标准写法），绝不追加 insertText
              const proto = inputBox.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
              const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
              setter.call(inputBox, txt);
              inputBox.focus();
            }
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            inputBox.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(350);
            // 3. 发送：三模式（都只执行一次发送动作，严禁"未清空自动重试"防重复发送）
            //    auto   = 按钮优先，找不到按钮才 Enter（推荐，防多发最稳）
            //    enter  = Enter 优先（适合 B站/虎牙等 Enter 直接发送且清空快的平台）
            //    button = 只点按钮，找不到直接报错
            const findBtn = () => {
              if (sendSel) {
                const list = queryDeep(sendSel);
                for (const el of list) { if (visible(el)) { return el; } }
              }
              const all = document.querySelectorAll('button, [role="button"]');
              for (const el of all) {
                if (!visible(el)) continue;
                const t = (el.textContent || '').trim();
                if (t === '发送' || t === '发' || t === 'Send' || /^(发送|发条|发评论|post|send)$/i.test(t)) { return el; }
              }
              return null;
            };
            const pressEnter = async () => {
              const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
              inputBox.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
              inputBox.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
              inputBox.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
            };
            const clickOnce = (el) => {
              el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              if (typeof el.click === 'function') { try { el.click(); } catch(e) {} }
            };
            const clickBtn = (btn) => {
              // 向上找最近的 BUTTON（有些发送是 icon 按钮包在 button 内）
              let b = btn;
              for (let i = 0; i < 4 && b && b.tagName !== 'BUTTON'; i++) { b = b.parentElement; }
              if (b && b.tagName === 'BUTTON' && visible(b)) btn = b;
              clickOnce(btn);
            };
            const inputText = () => (inputBox.value || inputBox.textContent || '').trim();
            let sendBtn = null;
            if (mode !== 'enter') sendBtn = findBtn();
            if (mode === 'button') {
              if (!sendBtn) return { success: false, error: '未找到发送按钮（可在选择器行「定位」发送按钮，或切换发送方式为「自动」）' };
              clickBtn(sendBtn);
              await sleep(600);
              return { success: true, sent: 'click' };
            }
            if (mode === 'enter') {
              await pressEnter();
              await sleep(800);
              if (!inputText()) return { success: true, sent: 'enter' };
              // Enter 未生效（内容未清空）→ 按钮兜底一次（不重试）
              sendBtn = findBtn();
              if (!sendBtn) return { success: false, error: '回车未发送且未找到发送按钮（输入框仍有内容）' };
              clickBtn(sendBtn);
              await sleep(600);
              return { success: true, sent: 'enter→click' };
            }
            // auto：按钮优先 → 找不到才 Enter（各只一次）
            if (sendBtn) {
              clickBtn(sendBtn);
              await sleep(600);
              return { success: true, sent: inputText() ? 'click(已点发送，输入框未清空属正常)' : 'click' };
            }
            await pressEnter();
            await sleep(800);
            if (!inputText()) return { success: true, sent: 'enter' };
            return { success: false, error: '未找到发送按钮且回车未发送（输入框仍有内容，请用「定位」选择发送按钮）' };
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
  /** 快捷回复 chip 拖拽排序：fromRaw = items 原始索引，toVis = 目标可见顺序索引（跳过空项） */
  function moveQuickReply(id: number, gIdx: number, fromRaw: number, toVis: number) {
    const inst = instances.value.find(i => i.id === id)
    if (!inst || !inst.quickReplyGroups[gIdx]) return
    const items = inst.quickReplyGroups[gIdx].items
    const vis: number[] = []
    items.forEach((t, i) => { if (t.trim()) vis.push(i) })
    const fromVis = vis.indexOf(fromRaw)
    if (fromVis < 0 || toVis < 0 || toVis >= vis.length || fromVis === toVis) return
    const [moved] = items.splice(fromRaw, 1)
    // 移除后重算可见映射（比原来少一项），目标索引越界时插到末尾
    const vis2: number[] = []
    items.forEach((t, i) => { if (t.trim()) vis2.push(i) })
    const insertAt = toVis >= vis2.length ? items.length : vis2[toVis]
    items.splice(insertAt, 0, moved)
    persist()
  }

  function addInstance() {
    // 复用最小可用 ID：删掉的实例编号回收（如删了 3/4，下次新建回到 3）
    let id = 1
    const used = new Set(instances.value.map(i => i.id))
    while (used.has(id)) id++
    saveNextId(Math.max(getNextId(), id + 1))
    instances.value.push(defaultInstance(id))
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
    addQuickReply, removeQuickReply, setQuickReply, moveQuickReply,
    addInstance, removeInstance, persist,
    exportGroup, importGroupAsNew
  }
})
