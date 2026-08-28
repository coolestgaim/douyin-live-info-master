/** 本地时区格式化（YYYY-MM-DD HH:mm:ss）—— 给中国用户看，避免 ISO 的 UTC 偏差（v2.9.26 修复） */
export function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
