// docs/screenshots/ 截图工具
// 用法：env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS node_modules/electron/dist/electron.exe scripts/capture-screenshots.cjs
// 启动隐藏 BrowserWindow 通过内嵌 HTTP 静态服务加载 dist，逐页截图保存到 docs/screenshots/。
// 独立 userData 目录（避免和主应用锁冲突），强制暗色主题（与主应用一致：1100x680）。
// 用内嵌 http 静态服务（file:// 下 ES module CORS/MIME 受限，HTTP 协议最稳）。

const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')

// 容错：stdout/stderr 管道被关闭（head/grep 截断等）时不再抛出 EPIPE 弹框
for (const s of [process.stdout, process.stderr]) {
  s.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0) })
}

// 本机 GPU 沙箱问题
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')

// 独立 userData
app.setPath('userData', path.join(os.tmpdir(), 'dl-screenshot-' + Date.now()))

const ROOT = path.join(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist')
const OUT = path.join(ROOT, 'docs', 'screenshots')

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error('dist/index.html 不存在，请先 npm run build')
  process.exit(1)
}
fs.mkdirSync(OUT, { recursive: true })

const W = 1100, H = 680
const PORT = 4180
const URL = `http://127.0.0.1:${PORT}/`

const PAGES = [
  { name: 'dashboard',   hash: '#/dashboard',   wait: 1500 },
  { name: 'rooms',       hash: '#/rooms',       wait: 1200 },
  { name: 'recording',   hash: '#/recording',   wait: 1200 },
  { name: 'quick-reply', hash: '#/quick-reply', wait: 1500 },
  { name: 'settings',    hash: '#/settings',    wait: 1200 },
  { name: 'about',       hash: '#/about',       wait: 1200 },
]

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const settle = () => `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject'
}

// 内嵌静态服务（SPA fallback：非 assets 路径返回 index.html）
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0])
      if (p === '/') p = '/index.html'
      const file = path.join(DIST_DIR, p)
      fs.readFile(file, (err, data) => {
        if (err) {
          // SPA fallback：路径无扩展名时返回 index.html（路由兜底）
          if (!path.extname(p)) {
            return fs.readFile(path.join(DIST_DIR, 'index.html'), (e2, d2) => {
              if (e2) { res.statusCode = 404; res.end('not found'); return }
              res.setHeader('Content-Type', MIME['.html']); res.end(d2)
            })
          }
          res.statusCode = 404; res.end('not found'); return
        }
        res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream')
        res.end(data)
      })
    })
    server.on('error', reject)
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`static server → ${URL}`)
      resolve(server)
    })
  })
}

app.whenReady().then(async () => {
  let server
  try {
    server = await startServer()
  } catch (e) {
    console.error('启动静态服务失败:', e.message)
    app.exit(1); return
  }

  // 用主应用 preload 暴露 electronAPI（store 初始化依赖它）
  const PRELOAD = path.join(ROOT, 'dist-electron', 'preload.js')
  const win = new BrowserWindow({
    width: W, height: H, show: false,
    backgroundColor: '#111318',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, offscreen: true,
      preload: PRELOAD
    }
  })

  // 捕获渲染进程错误 / 控制台输出
  win.webContents.on('console-message', (_e, _level, message, _line, _source) => {
    console.log(`[renderer] ${message}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', JSON.stringify(details))
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[did-fail-load] ${code} ${desc} ${url}`)
  })
  win.webContents.on('preload-error', (_e, p, err) => {
    console.error(`[preload-error] ${p}: ${err.message}`)
  })

  try {
    await win.loadURL(URL)
    // 注入暗色主题（store 初始化前 localStorage 已生效，reload 一次确保读到）
    await win.webContents.executeJavaScript(`
      try { localStorage.clear() } catch(e) {}
      localStorage.setItem('douyin-live-info-theme', 'dark')
      location.reload()
    `)
    await new Promise((resolve) => {
      if (win.webContents.isLoadingMainFrame()) {
        win.webContents.once('did-finish-load', resolve)
      } else { resolve() }
    })
    await wait(2000)

    for (const p of PAGES) {
      // 用 location.hash = '' 再设目标，强制触发 hashchange（同值不触发）
      await win.webContents.executeJavaScript(`location.hash = ''`)
      await wait(80)
      await win.webContents.executeJavaScript(`location.hash = '${p.hash}'`)
      await wait(p.wait)
      await win.webContents.executeJavaScript(settle())
      const img = await win.webContents.capturePage()
      const out = path.join(OUT, `${p.name}.png`)
      fs.writeFileSync(out, img.toPNG())
      const sz = img.getSize()
      console.log(`✓ ${p.name}.png  (${sz.width}x${sz.height}, ${(fs.statSync(out).size/1024).toFixed(1)} KB)`)
    }
    console.log(`\n全部完成 → ${OUT}`)
  } catch (e) {
    console.error('截图失败:', e)
    process.exitCode = 1
  } finally {
    win.destroy()
    if (server) server.close()
    app.quit()
  }
})
