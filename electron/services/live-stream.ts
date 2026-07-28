import axios from 'axios'

const http = axios.create({
  timeout: 10000,
  headers: { 'User-Agent': 'okhttp/3.12.1' }
})

export interface QualityOption {
  label: string
  value: string
  url: string
}

export interface PullUrlResult {
  success: boolean
  pullUrl: string
  nickname: string
  qualities: QualityOption[]
}

export async function getPullUrl(roomId: string): Promise<PullUrlResult> {
  const url = `https://webcast.amemv.com/webcast/room/reflow/info/` +
    `?type_id=0&live_id=1&room_id=${roomId}&sec_user_id=&app_id=1128`

  try {
    const res = await http.get(url)
    const root = res.data

    if (root.status_code !== undefined && root.status_code !== 0) {
      return { success: false, pullUrl: '', nickname: '', qualities: [] }
    }

    const streamUrl = root.data?.room?.stream_url

    let nickname = ''
    if (root.data?.room?.owner?.nickname) {
      nickname = root.data.room.owner.nickname
    }

    // Build quality options from available stream URLs
    const qualities = parseQualities(streamUrl)

    // Default to highest quality (rtmp)
    let pullUrl = ''
    if (qualities.length > 0) {
      pullUrl = qualities[0].url
    } else if (streamUrl?.rtmp_pull_url) {
      pullUrl = streamUrl.rtmp_pull_url
    }

    return { success: !!pullUrl, pullUrl, nickname, qualities }
  } catch {
    return { success: false, pullUrl: '', nickname: '', qualities: [] }
  }
}

function parseQualities(streamUrl: any): QualityOption[] {
  if (!streamUrl) return []

  const result: QualityOption[] = []

  // RTMP is usually highest quality (原画)
  if (streamUrl.rtmp_pull_url) {
    result.push({ label: '原画', value: 'OD', url: streamUrl.rtmp_pull_url })
  }

  // FLV qualities
  const flv = streamUrl.flv_pull_url
  if (flv && typeof flv === 'object') {
    const flvKeys = Object.keys(flv)
    for (const key of flvKeys) {
      if (flv[key] && typeof flv[key] === 'string') {
        const q = mapFlvQuality(key)
        // Avoid duplicates
        if (!result.find(r => r.value === q.value)) {
          result.push({ label: q.label, value: q.value, url: flv[key] })
        }
      }
    }
  }

  // HLS qualities (as fallback, lower priority)
  const hls = streamUrl.hls_pull_url
  if (hls && typeof hls === 'object') {
    for (const key of Object.keys(hls)) {
      if (hls[key] && typeof hls[key] === 'string') {
        const q = mapFlvQuality(key)
        if (!result.find(r => r.value === q.value)) {
          result.push({ label: q.label, value: q.value, url: hls[key] })
        }
      }
    }
  }

  // Sort: OD > UHD > HD > SD > LD
  const order = ['OD', 'UHD', 'HD', 'SD', 'LD']
  result.sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value))

  return result
}

function mapFlvQuality(key: string): { label: string; value: string } {
  const k = key.toUpperCase()
  if (k.includes('ORIGIN') || k.includes('OD')) return { label: '原画', value: 'OD' }
  if (k.includes('UHD') || k.includes('4K')) return { label: '超清', value: 'UHD' }
  if (k.includes('HD')) return { label: '高清', value: 'HD' }
  if (k.includes('SD')) return { label: '标清', value: 'SD' }
  return { label: '流畅', value: 'LD' }
}
