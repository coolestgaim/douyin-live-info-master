import axios from 'axios'

const http = axios.create({
  timeout: 10000,
  headers: { 'User-Agent': 'okhttp/3.12.1' }
})

export async function getPullUrl(roomId: string): Promise<{ success: boolean; pullUrl: string; nickname: string }> {
  const url = `https://webcast.amemv.com/webcast/room/reflow/info/` +
    `?type_id=0&live_id=1&room_id=${roomId}&sec_user_id=&app_id=1128`

  try {
    const res = await http.get(url)
    const root = res.data

    if (root.status_code !== undefined && root.status_code !== 0) {
      return { success: false, pullUrl: '', nickname: '' }
    }

    let pullUrl = ''
    if (root.data?.room?.stream_url?.rtmp_pull_url) {
      pullUrl = root.data.room.stream_url.rtmp_pull_url
    }

    let nickname = ''
    if (root.data?.room?.owner?.nickname) {
      nickname = root.data.room.owner.nickname
    }

    return { success: !!pullUrl, pullUrl, nickname }
  } catch {
    return { success: false, pullUrl: '', nickname: '' }
  }
}
