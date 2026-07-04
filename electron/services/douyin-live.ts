import axios, { AxiosInstance, AxiosResponse } from 'axios'
import * as logger from './logger'

const LOG_MODULE = 'DouyinLive'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

interface LiveRoomInfo {
  enterRoomId: string
  nickname: string
  title: string
  roomStatus: number
  likeCount: number
  viewCount: number
  error: string
}

export class DouyinLiveService {
  private cookieString = ''
  private http: AxiosInstance
  private cookies: string[] = []

  constructor() {
    this.http = axios.create({
      timeout: 20000,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 5,
      decompress: true
    })

    // Intercept responses to collect Set-Cookie headers
    this.http.interceptors.response.use((res: AxiosResponse) => {
      const sc = res.headers['set-cookie']
      if (sc) {
        const items = Array.isArray(sc) ? sc : [sc]
        for (const c of items) {
          const pair = c.split(';')[0].trim()
          const name = pair.split('=')[0]
          // Replace existing cookie with same name
          const idx = this.cookies.findIndex(x => x.startsWith(name + '='))
          if (idx >= 0) this.cookies[idx] = pair
          else this.cookies.push(pair)
        }
      }
      return res
    })

    // Inject cookies into every request
    this.http.interceptors.request.use((config) => {
      if (this.cookies.length > 0) {
        config.headers['Cookie'] = this.cookies.join('; ')
      }
      return config
    })
  }

  get cookie(): string {
    return this.cookieString
  }

  async fetchLiveRoomInfo(url: string): Promise<LiveRoomInfo> {
    // Step 1: Visit live.douyin.com to get ttwid cookie
    await this.http.get('https://live.douyin.com')
    this.cookieString = this.cookies.join('; ')

    // Step 2: Extract rid from URL
    const rid = extractRid(url)
    if (!rid) throw new Error('无法从URL中提取房间号，请检查链接格式')

    // Step 3: Get roomId from page HTML
    let roomId = ''
    try {
      const htmlRes = await this.http.get(`https://live.douyin.com/${rid}`)
      const html = typeof htmlRes.data === 'string' ? htmlRes.data : ''
      roomId = extractRoomId(html)
    } catch (ex) {
      logger.warn(LOG_MODULE, `获取页面HTML失败 rid=${rid}`, ex)
    }

    // Step 4: Get room info from API
    const info = await this.getRoomInfoFromApi(rid)

    return {
      enterRoomId: info?.enterRoomId || roomId || rid,
      nickname: info?.nickname || '',
      title: info?.title || '',
      roomStatus: info?.roomStatus ?? 0,
      likeCount: info?.likeCount ?? 0,
      viewCount: info?.viewCount ?? 0,
      error: ''
    }
  }

  async refreshRoomStats(rooms: any[]): Promise<void> {
    for (const room of rooms) {
      if (room.error) continue
      // rid may be stored in enterRoomId as a numeric string, or we may need the original URL
      const rid = extractRid(room.url) || room.enterRoomId
      if (!rid) continue
      try {
        const info = await this.getRoomInfoFromApi(rid)
        if (info) {
          room.likeCount = info.likeCount
          room.viewCount = info.viewCount
          room.roomStatus = info.roomStatus
        }
      } catch (ex) {
        logger.warn(LOG_MODULE, `刷新房间状态失败 rid=${rid}`, ex)
      }
    }
  }

  private async getRoomInfoFromApi(rid: string): Promise<LiveRoomInfo | null> {
    const apiUrl = `https://live.douyin.com/webcast/room/web/enter/` +
      `?aid=6383&live_id=1&device_platform=web&language=zh-CN` +
      `&enter_from=web_live&cookie_enabled=true&screen_width=1920` +
      `&screen_height=1080&browser_language=zh-CN&browser_platform=Win32` +
      `&browser_name=Chrome&browser_version=95.0.4638.69&web_rid=${rid}`

    const res = await this.http.get(apiUrl, {
      headers: { Referer: 'https://live.douyin.com/' }
    })

    const root = res.data
    const data = root?.data
    if (!data) return null

    const info: LiveRoomInfo = {
      enterRoomId: data.enter_room_id || '',
      nickname: '',
      title: '',
      roomStatus: data.room_status ?? 0,
      likeCount: 0,
      viewCount: 0,
      error: ''
    }

    if (data.user) info.nickname = data.user.nickname || ''
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const item = data.data[0]
      info.title = item.title || ''
      info.likeCount = item.like_count ?? 0
      if (item.room_view_stats) info.viewCount = item.room_view_stats.display_value ?? 0
    }

    return info
  }
}

function extractRid(url: string): string {
  const m = url.match(/live\.douyin\.com\/(\d+)/i)
  return m ? m[1] : ''
}

function extractRoomId(html: string): string {
  const patterns = [
    /\\["']room\\["']\s*:\s*\{\\["']id_str\\["']\s*:\s*\\["'](\d+)\\["']/,
    /"room"\s*:\s*\{"id_str"\s*:\s*"(\d+)"/,
    /"roomId_str"\s*:\s*"(\d{10,})"/,
    /roomId_str["':\s]+(\d{10,})/
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m) return m[1]
  }
  return ''
}
