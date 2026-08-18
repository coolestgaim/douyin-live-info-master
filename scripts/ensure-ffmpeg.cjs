// 打包前置：确保项目根目录存在可用的 ffmpeg.exe（缺失时自动下载）
// 用法：node scripts/ensure-ffmpeg.cjs（electron:build 自动调用）
// 下载源优先级（前一个失败自动切换）：
//   1. 本项目 GitHub Release 资产（API 方式，token 从 git remote 提取；版本固定，与打包机一致）
//   2. 本项目 GitHub Release 资产（直链；Steam++ 完整通道下可用）
//   3. gh-proxy.com 代理 BtbN FFmpeg-Builds（国内可用）
//   4. ghproxy.com / mirror.ghproxy.com 代理 BtbN（备用）

const fs = require('fs')
const path = require('path')
const https = require('https')
const zlib = require('zlib')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const DEST = path.join(ROOT, 'ffmpeg.exe')

const OWNER = 'coolestgaim'
const REPO = 'douyin-live-info-master'
const API = `https://api.github.com/repos/${OWNER}/${REPO}`

// ffmpeg.exe 是否可用（存在且能跑 -version）
function isUsable(exePath) {
  try {
    if (!fs.existsSync(exePath)) return false
    const r = spawnSync(exePath, ['-version'], { windowsHide: true, timeout: 10000 })
    return r.status === 0
  } catch { return false }
}

// 获取 GitHub 访问 token（访问本项目 Release 资产走快速 API 通道）
// 优先级：环境变量 GITHUB_TOKEN / GH_TOKEN > git remote URL 内嵌 token
function getToken() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  }
  try {
    const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8', windowsHide: true })
    if (r.status !== 0) return ''
    const m = r.stdout.match(/:\/\/([^:]+):([^@]+)@/)
    return m ? m[2] : ''
  } catch { return '' }
}

// 用系统 curl 下载（Windows 10+ 内置 curl.exe；-L 跟随重定向且跨域自动丢弃 Authorization，
// 避免 CDN 拒收；-k 兼容 Steam++ 自签证书）。返回是否成功。
function downloadWithCurl(url, dest, headers = {}) {
  const args = ['-skL', '--connect-timeout', '15', '--max-time', '900', '-o', dest]
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`)
  args.push(url)
  try {
    const r = spawnSync('curl', args, { windowsHide: true, timeout: 900000 })
    return r.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 0
  } catch {
    return false
  }
}

// 查询 Release 中 ffmpeg.exe 资产的 API 下载 URL（需 token）
function getAssetApiUrl(token) {
  return new Promise((resolve) => {
    https.get(API + '/releases/latest', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' },
      rejectUnauthorized: false
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return }
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try {
          const rel = JSON.parse(d)
          const asset = (rel.assets || []).find(a => a.name === 'ffmpeg.exe')
          resolve(asset ? asset.url : null)
        } catch { resolve(null) }
      })
      res.on('error', () => resolve(null))
    }).on('error', () => resolve(null))
  })
}

// ===== zip 单文件提取（复用 electron/services/zip-extract.ts 逻辑） =====
function readCentralDirectory(buf) {
  const eocdOffset = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocdOffset < 0) return []
  const eocd = buf.subarray(eocdOffset)
  const totalEntries = eocd.readUInt16LE(10)
  const cdOffset = eocd.readUInt32LE(16)
  const entries = []
  let pos = cdOffset
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break
    const compressionMethod = buf.readUInt16LE(pos + 10)
    const compressedSize = buf.readUInt32LE(pos + 20)
    const uncompressedSize = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localHeaderOffset = buf.readUInt32LE(pos + 42)
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8')
    entries.push({ name, compressedSize, uncompressedSize, compressionMethod, localHeaderOffset })
    pos += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function extractFromZip(zipPath, targetName, destPath) {
  try {
    const buf = fs.readFileSync(zipPath)
    const normalized = targetName.replace(/\\/g, '/')
    const entry = readCentralDirectory(buf).find(e => e.name === normalized)
    if (!entry) return false
    const fd = fs.openSync(zipPath, 'r')
    try {
      const localHeader = Buffer.alloc(30)
      fs.readSync(fd, localHeader, 0, 30, entry.localHeaderOffset)
      const nameLen = localHeader.readUInt16LE(26)
      const extraLen = localHeader.readUInt16LE(28)
      const dataOffset = entry.localHeaderOffset + 30 + nameLen + extraLen
      const compressed = Buffer.alloc(entry.compressedSize)
      fs.readSync(fd, compressed, 0, entry.compressedSize, dataOffset)
      let data = compressed
      if (entry.compressionMethod === 8) data = zlib.inflateRawSync(compressed)
      else if (entry.compressionMethod !== 0) throw new Error('unsupported compression ' + entry.compressionMethod)
      fs.writeFileSync(destPath, data)
      return true
    } finally { fs.closeSync(fd) }
  } catch (e) { console.log('  ✗ 解压失败:', e.message); return false }
}

// 各下载源（isZip=true 时下载后解压提取 bin/ffmpeg.exe）
const BtbnZip = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
const BtbnZipGhProxy = 'https://gh-proxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
const BtbnZipGhproxyOld = 'https://ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
const BtbnZipMirror = 'https://mirror.ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'

async function main() {
  if (isUsable(DEST)) {
    console.log(`✓ ffmpeg.exe 已存在（${Math.round(fs.statSync(DEST).size / 1048576)} MB），跳过下载`)
    return
  }
  console.log('ffmpeg.exe 缺失，尝试下载...')

  const token = getToken()
  const assetApiUrl = token ? await getAssetApiUrl(token) : null
  if (assetApiUrl) {
    console.log('→ 源 1/6：本项目 Release 资产（API，token 已配置）')
    const tmp = path.join(ROOT, '.ffmpeg-download-tmp')
    const ok = downloadWithCurl(assetApiUrl, tmp, { 'Authorization': 'token ' + token, 'Accept': 'application/octet-stream' })
    if (ok) {
      fs.renameSync(tmp, DEST)
      if (isUsable(DEST)) { console.log('✓ ffmpeg.exe 下载成功（Release 固定版本）'); return }
      console.log('  验证失败，切换下一源')
      try { fs.unlinkSync(DEST) } catch {}
    } else {
      console.log('  下载失败，切换下一源')
    }
  } else {
    console.log('⚠ 未检测到 token（无 GITHUB_TOKEN 环境变量或 git remote 未内嵌），以下源可能较慢；')
    console.log('  建议：设置 GITHUB_TOKEN 后重跑，可走 58MB/s 的 API 快速通道，或手动放置 ffmpeg.exe 到项目根目录')
  }

  const sources = [
    { name: '源 2/6：本项目 Release 资产（直链）', url: `https://github.com/${OWNER}/${REPO}/releases/latest/download/ffmpeg.exe`, isZip: false },
    { name: '源 3/6：gh-proxy.com 代理 BtbN', url: BtbnZipGhProxy, isZip: true },
    { name: '源 4/6：ghproxy.com 代理 BtbN', url: BtbnZipGhproxyOld, isZip: true },
    { name: '源 5/6：mirror.ghproxy.com 代理 BtbN', url: BtbnZipMirror, isZip: true },
    { name: '源 6/6：BtbN GitHub 直链', url: BtbnZip, isZip: true },
  ]

  for (const src of sources) {
    console.log(`→ ${src.name}`)
    const tmp = path.join(ROOT, '.ffmpeg-download-tmp')
    try { fs.unlinkSync(tmp) } catch {}
    const ok = downloadWithCurl(src.url, tmp)
    if (!ok) { console.log('  下载失败，切换下一源'); continue }

    if (src.isZip) {
      if (extractFromZip(tmp, 'bin/ffmpeg.exe', DEST)) {
        try { fs.unlinkSync(tmp) } catch {}
        if (isUsable(DEST)) { console.log('✓ ffmpeg.exe 下载并解压成功'); return }
        console.log('  解压后验证失败，切换下一源')
      } else {
        try { fs.unlinkSync(tmp) } catch {}
        console.log('  zip 中未找到 ffmpeg.exe，切换下一源')
      }
    } else {
      fs.renameSync(tmp, DEST)
      if (isUsable(DEST)) { console.log('✓ ffmpeg.exe 下载成功'); return }
      console.log('  下载文件不可用，切换下一源')
      try { fs.unlinkSync(DEST) } catch {}
    }
  }

  console.error('✗ 所有下载源均失败。请手动放置 ffmpeg.exe 到项目根目录后重试。')
  process.exit(1)
}

main()
