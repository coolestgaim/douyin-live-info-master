import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const LOG_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'DouyinLiveInfo', 'logs')

let logStream: fs.WriteStream | null = null
let currentDate = ''

function getLogStream(): fs.WriteStream {
  const today = new Date().toISOString().substring(0, 10)
  if (logStream && today === currentDate) return logStream

  if (logStream) logStream.end()
  fs.mkdirSync(LOG_DIR, { recursive: true })
  currentDate = today
  logStream = fs.createWriteStream(path.join(LOG_DIR, `app_${today}.log`), { flags: 'a' })
  return logStream
}

function timestamp(): string {
  return new Date().toISOString()
}

export function info(module: string, msg: string): void {
  try {
    const line = `[${timestamp()}] [INFO] [${module}] ${msg}\n`
    getLogStream().write(line)
  } catch { /* logging should never crash */ }
}

export function warn(module: string, msg: string, ex?: unknown): void {
  try {
    const detail = ex instanceof Error ? `${ex.message}\n${ex.stack || ''}` : ex ? String(ex) : ''
    const line = `[${timestamp()}] [WARN] [${module}] ${msg}${detail ? ' — ' + detail : ''}\n`
    getLogStream().write(line)
  } catch { /* logging should never crash */ }
}

export function error(module: string, msg: string, ex?: unknown): void {
  try {
    const detail = ex instanceof Error ? `${ex.message}\n${ex.stack || ''}` : ex ? String(ex) : ''
    const line = `[${timestamp()}] [ERROR] [${module}] ${msg}${detail ? ' — ' + detail : ''}\n`
    getLogStream().write(line)
  } catch { /* logging should never crash */ }
}
