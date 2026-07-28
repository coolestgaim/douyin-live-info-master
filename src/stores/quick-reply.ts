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
  inputSelector: string | null  // 用户手动定位的输入框 CSS selector
}

function defaultInstance(id: number): QuickReplyInstance {
  return {
    id, name: `实例 ${id}`, roomUrl: '', status: 'idle', expanded: false,
    quickReplyGroups: [{ name: '默认分组', expanded: true, items: ['欢迎来到直播间！', '谢谢关注~', '点点赞支持一下'] }],
    sendInput: '', lastDanmu: [],
    inputSelector: null
  }
}

export const useQuickReplyStore = defineStore('quickReply', () => {
  const instances = ref<QuickReplyInstance[]>([
    defaultInstance(1), defaultInstance(2), defaultInstance(3)
  ])

  const danmuStore = useDanmuStore()

  function updateDanmuMonitor() {
    for (const inst of instances.value) {
      if (inst.status === 'running') inst.lastDanmu = danmuStore.filteredChatMessages.slice(0, 20)
    }
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null
  function startPolling() { if (!pollTimer) pollTimer = setInterval(updateDanmuMonitor, 2000) }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

  /**
   * Send a message in the webview.
   * Flow: find input → fill text → click to focus → press Enter (no send button needed!)
   * If inputSelector is provided (user manually positioned), uses it directly.
   */
  function sendViaWebview(webview: any, text: string, inputSelector?: string | null): Promise<{ success: boolean; error?: string }> {
    if (!webview) return Promise.resolve({ success: false, error: 'webview 未就绪' })
    const sel = inputSelector || null
    try {
      return webview.executeJavaScript(`
        (async function() {
          try {
            const txt = ${JSON.stringify(text)};
            const storedSel = ${JSON.stringify(sel)};
            let inputBox = null;

            // Prefer user-set selector
            if (storedSel) {
              try { inputBox = document.querySelector(storedSel); } catch(e) {}
            }

            // Fallback: search for input
            if (!inputBox || !inputBox.isConnected) {
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
              inputBox = findInput(document);
              if (!inputBox) {
                const iframes = document.querySelectorAll('iframe');
                for (const iframe of iframes) {
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    if (doc) { inputBox = findInput(doc); if (inputBox) break; }
                  } catch(e) {}
                }
              }
            }

            if (!inputBox || !inputBox.isConnected) return { success: false, error: '未找到聊天输入框 — 请点击「定位」标记输入框' };

            // Step 1: Fill text
            inputBox.innerText = txt;
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            inputBox.dispatchEvent(new Event('change', { bubbles: true }));

            await new Promise(r => setTimeout(r, 150));

            // Step 2: Click the input to focus (triggers React state)
            inputBox.focus();
            inputBox.click();
            inputBox.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            inputBox.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

            await new Promise(r => setTimeout(r, 80));

            // Step 3: Press Enter — when input has text, this reliably sends
            inputBox.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
            }));
            inputBox.dispatchEvent(new KeyboardEvent('keypress', {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
            }));
            inputBox.dispatchEvent(new KeyboardEvent('keyup', {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
            }));

            return { success: true };
          } catch(err) {
            return { success: false, error: err.message };
          }
        })()
      `)
    } catch (e: any) {
      return Promise.resolve({ success: false, error: e.message })
    }
  }

  /**
   * Inject a click-capture script into the webview.
   * After calling this, the user clicks on the chat input in the webview,
   * and the script builds a CSS selector for the clicked element.
   * Call checkSelectorCapture() afterwards to read the result.
   */
  function injectSelectorCapture(webview: any): Promise<boolean> {
    if (!webview) return Promise.resolve(false)
    try {
      return webview.executeJavaScript(`
        (function() {
          // Remove any previous capture state
          delete window.__hermesSelected;

          // Highlight existing selection if re-selecting
          document.querySelectorAll('[data-hermes-highlight]').forEach(el => {
            el.style.outline = '';
            delete el.dataset.hermesHighlight;
          });

          // Add one-time click listener
          document.addEventListener('click', function _hermesCapture(e) {
            document.removeEventListener('click', _hermesCapture, true);
            e.preventDefault();
            e.stopPropagation();

            const el = e.target;

            // Build a unique-ish CSS selector path
            function buildSelector(target) {
              if (target.id) {
                const sel = '#' + CSS.escape(target.id);
                try { if (document.querySelectorAll(sel).length === 1) return sel; } catch(e) {}
              }

              const path = [];
              let current = target;

              while (current && current !== document.body && current !== document.documentElement) {
                let seg = current.tagName.toLowerCase();

                // Add class if present
                if (current.className && typeof current.className === 'string') {
                  const cls = current.className.trim().split(/\\s+/)
                    .filter(c => c && !c.includes(':') && c.length < 40)
                    .slice(0, 2);
                  if (cls.length) seg += '.' + cls.map(c => CSS.escape(c)).join('.');
                }

                // Add nth-of-type if needed
                const parent = current.parentElement;
                if (parent) {
                  const same = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                  if (same.length > 1) {
                    seg += ':nth-of-type(' + (same.indexOf(current) + 1) + ')';
                  }
                }

                path.unshift(seg);

                // Stop once selector is unique
                try {
                  const full = path.join(' > ');
                  if (document.querySelectorAll(full).length === 1) break;
                } catch(e) { break; }

                current = current.parentElement;
              }

              return path.join(' > ');
            }

            const selector = buildSelector(el);
            const tag = el.tagName;
            const text = (el.textContent || '').trim().substring(0, 50);

            // Highlight the selected element
            try {
              el.style.outline = '3px solid #f97316';
              el.dataset.hermesHighlight = '1';
              setTimeout(() => {
                el.style.outline = '';
                delete el.dataset.hermesHighlight;
              }, 3000);
            } catch(e) {}

            window.__hermesSelected = { selector, tag, text };
          }, true);
        })()
      `).then(() => true)
    } catch (e: any) {
      return Promise.resolve(false)
    }
  }

  /**
   * Check if the user has clicked an element after injectSelectorCapture().
   * Returns the captured selector info, or null if nothing selected yet.
   */
  function checkSelectorCapture(webview: any): Promise<{ selector: string; tag: string; text: string } | null> {
    if (!webview) return Promise.resolve(null)
    try {
      return webview.executeJavaScript('window.__hermesSelected || null')
    } catch (e: any) {
      return Promise.resolve(null)
    }
  }

  // --- Group management ---
  function addGroup(id: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst) inst.quickReplyGroups.push({ name: '新分组', expanded: true, items: [] })
  }
  function removeGroup(id: number, gIdx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst) inst.quickReplyGroups.splice(gIdx, 1)
  }
  function toggleGroup(id: number, gIdx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) {
      inst.quickReplyGroups[gIdx].expanded = !inst.quickReplyGroups[gIdx].expanded
    }
  }
  function setGroupName(id: number, gIdx: number, name: string) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) inst.quickReplyGroups[gIdx].name = name
  }
  function addQuickReply(id: number, gIdx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) inst.quickReplyGroups[gIdx].items.push('')
  }
  function removeQuickReply(id: number, gIdx: number, idx: number) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) inst.quickReplyGroups[gIdx].items.splice(idx, 1)
  }
  function setQuickReply(id: number, gIdx: number, idx: number, text: string) {
    const inst = instances.value.find(i => i.id === id)
    if (inst && inst.quickReplyGroups[gIdx]) inst.quickReplyGroups[gIdx].items[idx] = text
  }

  return {
    instances, sendViaWebview,
    injectSelectorCapture, checkSelectorCapture,
    addGroup, removeGroup, toggleGroup, setGroupName,
    addQuickReply, removeQuickReply, setQuickReply,
    updateDanmuMonitor, startPolling, stopPolling
  }
})
