// 打包前置：确保项目根目录存在可用的 ffmpeg.exe（缺失时自动下载）
// 用法：node scripts/ensure-ffmpeg.cjs（electron:build 自动调用）
// 下载源优先级：
//   1. 本项目 GitHub Release 资产 ffmpeg.exe（版本固定，与本机打包一致）
//   2. BtbN FFmpeg-Builds GitHub release（zip，需解压提取 bin/ffmpeg.exe）
//   3. ghproxy 镜像（国内可达）

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const zlib = require('zlib')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const DEST = path.join(ROOT, 'ffmpeg.exe')

// ffmpeg.exe 是否可用（存在且能跑 -version）
function isUsable(exePath) {
  try {
    if (!fs.existsSync(exePath)) return false
    const r = spawnSync(exePath, ['-version'], { windowsHide: true, timeout: 10000 })
    return r.status === 0
  } catch { return false }
}

// 下载文件（跟随重定向），返回是否成功
function downloadFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        downloadFile(res.headers.location, dest, redirectsLeft - 1).then(resolve)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        console.log(`  ✗ HTTP ${res.statusCode}`)
        resolve(false)
        return
      }
      res.on('data', (c) => file.write(c))
      res.on('end', () => { file.end(); resolve(true) })
      res.on('error', () => { file.close(); try { fs.unlinkSync(dest) } catch {}; resolve(false) })
    })
    req.on('error', () => { file.close(); try { fs.unlinkSync(dest) } catch {}; resolve(false) })
    req.setTimeout(60000, () => { req.destroy(); file.close(); try { fs.unlinkSync(dest) } catch {}; resolve(false) })
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

const SOURCES = [
  {
    name: '项目 GitHub Release',
    url: 'https://github.com/coolestgaim/douyin-live-info-master/releases/latest/download/ffmpeg.exe',
    isZip: false,
  },
  {
    name: 'BtbN FFmpeg-Builds (GitHub)',
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    isZip: true,
  },
  {
    name: 'BtbN FFmpeg-Builds (ghproxy)',
    url: 'https://ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    isZip: true,
  },
  {
    name: 'BtbN FFmpeg-Builds (ghproxy mirror)',
    url: 'https://mirror.ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    isZip: true,
  },
]

async function main() {
  if (isUsable(DEST)) {
    console.log(`✓ ffmpeg.exe 已存在（${Math.round(fs.statSync(DEST).size / 1048576)} MB），跳过下载`)
    return
  }
  console.log('ffmpeg.exe 缺失，尝试下载...')

  for (const src of SOURCES) {
    console.log(`→ ${src.name}`)
    const tmp = path.join(ROOT, '.ffmpeg-download-tmp')
    try { fs.unlinkSync(tmp) } catch {}
    const ok = await downloadFile(src.url, tmp)
    if (!ok) { console.log('  下载失败，切换下一源'); continue }

    if (src.isZip) {
      if (extractFromZip(tmp, 'bin/ffmpeg.exe', DEST)) {
        try { fs.unlinkSync(tmp) } catch {}
        if (isUsable(DEST)) { console.log('✓ ffmpeg.exe 下载并解压成功'); return }
        console.log('  解压后验证失败，切换下一源')
      } else {
        try { fs.unlinkSync(tmp) } catch {}
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
