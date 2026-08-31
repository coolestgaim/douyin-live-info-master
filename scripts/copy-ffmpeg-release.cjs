/**
 * copy-ffmpeg-release.cjs — 打包后把 ffmpeg.exe 复制到 release/<version>/ 目录
 * 用途：ffmpeg 不再打进安装包（体积 242MB），改为随 release 目录单独提供，用户按需取用
 * 取用方式：把 ffmpeg.exe 放到 ① 应用 exe 同级目录 ② 用户数据目录 UserData/ffmpeg/ ③ PATH
 * 用法：electron:build 末尾自动调用；根目录无 ffmpeg.exe 时静默跳过
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const src = path.join(ROOT, 'ffmpeg.exe')
const pkg = require(path.join(ROOT, 'package.json'))
const destDir = path.join(ROOT, 'release', 'v' + pkg.version)

if (!fs.existsSync(src)) {
  console.log('[copy-ffmpeg] 根目录无 ffmpeg.exe，跳过复制（打包不依赖 ffmpeg）')
  process.exit(0)
}
fs.mkdirSync(destDir, { recursive: true })
const dest = path.join(destDir, 'ffmpeg.exe')
fs.copyFileSync(src, dest)
console.log(`[copy-ffmpeg] ✓ ffmpeg.exe (${(fs.statSync(dest).size / 1024 / 1024).toFixed(0)}MB) 已复制到 ${dest}`)
console.log('[copy-ffmpeg] 说明：未打进安装包；需要录制时把 ffmpeg.exe 放到应用 exe 同级目录或 UserData/ffmpeg/ 即可')
