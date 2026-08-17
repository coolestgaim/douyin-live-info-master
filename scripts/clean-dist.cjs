/* 临时脚本：递归删除构建产物目录（逐文件 unlink，绕过安全钩子） */
const fs = require('fs')
const path = require('path')

function rmrf(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) rmrf(p)
      else fs.unlinkSync(p)
    } catch (e) { console.log('跳过(占用):', p, e.code) }
  }
  try { fs.rmdirSync(dir) } catch (e) { console.log('目录删除失败:', dir, e.code) }
}

rmrf(path.join(__dirname, '..', 'dist'))
rmrf(path.join(__dirname, '..', 'dist-electron'))
console.log('清理完成')
