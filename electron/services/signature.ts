import * as crypto from 'crypto'
import * as path from 'path'
import * as fs from 'fs'
import { createContext, Script } from 'vm'

const SIGN_PARAMS = [
  'live_id', 'aid', 'version_code', 'webcast_sdk_version',
  'room_id', 'sub_room_id', 'sub_channel_id', 'did_rule',
  'user_unique_id', 'device_platform', 'device_type', 'ac', 'identity'
]

const DID = '7319483754668557238'

let signCode: string | null = null

function getSignCode(): string {
  if (signCode) return signCode
  const resourcesPath = path.join(process.resourcesPath, 'sign.js')
  const cwdPath = path.join(process.cwd(), 'sign.js')
  const devPath = path.join(__dirname, '..', 'sign.js')
  for (const p of [resourcesPath, cwdPath, devPath]) {
    try {
      signCode = fs.readFileSync(p, 'utf8')
      return signCode
    } catch { /* try next */ }
  }
  throw new Error('sign.js not found')
}

export async function buildWssUrl(roomId: string): Promise<string> {
  const now = Date.now()
  const fhId = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) & 0x7FFFFFFFFFFFFFFFn
  const wrdsV = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) & 0x7FFFFFFFFFFFFFFFn

  const wss =
    `wss://webcast100-ws-web-lq.douyin.com/webcast/im/push/v2/?app_name=douyin_web` +
    `&version_code=180800&webcast_sdk_version=1.0.14-beta.0` +
    `&update_version_code=1.0.14-beta.0&compress=gzip&device_platform=web&cookie_enabled=true` +
    `&screen_width=1536&screen_height=864&browser_language=zh-CN&browser_platform=Win32` +
    `&browser_name=Mozilla` +
    `&browser_version=5.0%20(Windows%20NT%2010.0;%20Win64;%20x64)%20AppleWebKit/537.36%20(KHTML,` +
    `%20like%20Gecko)%20Chrome/131.0.0.0%20Safari/537.36` +
    `&browser_online=true&tz_name=Asia/Shanghai` +
    `&cursor=d-1_u-1_fh-${fhId}_t-${now}_r-1` +
    `&internal_ext=internal_src:dim|wss_push_room_id:${roomId}|wss_push_did:${DID}` +
    `|first_req_ms:${now - 100}|fetch_time:${now}|seq:1|wss_info:0-${now}-0-0|` +
    `wrds_v:${wrdsV}` +
    `&host=https://live.douyin.com&aid=6383&live_id=1&did_rule=3&endpoint=live_pc&support_wrds=1` +
    `&user_unique_id=${DID}&im_path=/webcast/im/fetch/&identity=audience` +
    `&need_persist_msg_count=15&insert_task_id=&live_reason=&room_id=${roomId}&heartbeatDuration=0`

  const queryStart = wss.indexOf('?')
  const queryString = wss.substring(queryStart + 1)
  const wssMaps: Record<string, string> = {}
  for (const item of queryString.split('&')) {
    const eqIdx = item.indexOf('=')
    if (eqIdx >= 0) wssMaps[item.substring(0, eqIdx)] = item.substring(eqIdx + 1)
  }

  const tplParams = SIGN_PARAMS.map(p => `${p}=${wssMaps[p] || ''}`)
  const param = tplParams.join(',')
  const md5 = crypto.createHash('md5').update(param).digest('hex')

  const signature = callSignVM(md5)
  return wss + `&signature=${signature}`
}

function callSignVM(md5: string): string {
  const code = getSignCode()
  const sandbox: any = {
    document: {},
    window: {},
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    console: { log: () => {}, warn: () => {}, error: () => {} }
  }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox

  const ctx = createContext(sandbox)
  const script = new Script(code + `\n;get_sign('${md5}')`)
  const result = script.runInContext(ctx)
  if (!result) throw new Error('签名输出为空')
  return result
}
