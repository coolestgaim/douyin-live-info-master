// 直播平台配置表（v2.11.0 多平台适配）
// 快捷回复实例按平台显示不同功能按钮组 + 预设 selector + 登录指引

export interface PlatformConfig {
  id: string
  name: string
  urlKeywords: string[]     // URL 包含任一关键词即匹配该平台
  inputSelector: string     // 预设输入框 selector（发送弹幕/评论）
  sendSelector: string      // 预设发送按钮 selector
  needFullscreen: boolean   // 是否必须全屏才能发送
  desc: string              // 平台说明
  loginHint: string         // 登录指引
}

export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'douyin',
    name: '抖音',
    urlKeywords: ['live.douyin.com'],
    inputSelector: '',
    sendSelector: '',
    needFullscreen: false,
    desc: '弹幕走 WebSocket 监听，网页仅用于画面与登录',
    loginHint: '打开直播间后在页面内扫码登录；已登录过则自动保持',
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    urlKeywords: ['live.bilibili.com'],
    inputSelector: '.chat-input-ctnr textarea',
    sendSelector: '.bl-button.live-skin-highlight-button-bg',
    needFullscreen: false,
    desc: '需网页版登录；弹幕输入框在直播间左下',
    loginHint: '点击页面右上角「登录」，支持扫码 / 账号密码',
  },
  {
    id: 'huya',
    name: '虎牙',
    urlKeywords: ['huya.com'],
    inputSelector: '#player-full-input-txt',
    sendSelector: '#player-full-input-btn',
    needFullscreen: true,
    desc: '必须进入全屏模式才能发送弹幕',
    loginHint: '点击右上角「登录」，支持扫码 / 手机号 / 虎牙号；发送前需切全屏',
  },
  {
    id: 'kuaishou',
    name: '快手',
    urlKeywords: ['live.kuaishou.com', 'kuaishou.com'],
    inputSelector: '.chat-input > div > textarea',
    sendSelector: '.chat-input > div > button',
    needFullscreen: false,
    desc: '需扫码登录（手机 App 确认）',
    loginHint: '点击「登录」后用快手 App 扫码确认',
  },
  {
    id: 'common',
    name: '通用',
    urlKeywords: [],
    inputSelector: '',
    sendSelector: '',
    needFullscreen: false,
    desc: '任意网站，手动定位输入框和发送按钮',
    loginHint: '加载网页后点「定位」，分别选中输入框和发送按钮',
  },
]

export function getPlatform(id: string): PlatformConfig {
  return PLATFORMS.find(p => p.id === id) || PLATFORMS[PLATFORMS.length - 1]
}

// 按 URL 域名推断平台（未知 → common）
export function guessPlatform(url: string): string {
  if (!url) return 'common'
  for (const p of PLATFORMS) {
    if (p.id !== 'common' && p.urlKeywords.some(k => url.includes(k))) return p.id
  }
  return 'common'
}
