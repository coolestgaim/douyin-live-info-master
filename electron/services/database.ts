import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import * as logger from './logger'

const LOG_MODULE = 'Database'

let dbInstance: SqlJsDatabase | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function getDbPath(): string {
  return path.join(app.getPath('userData'), 'danmu.db')
}

async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance

  const SQL = await initSqlJs()
  const dbPath = getDbPath()
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    dbInstance = new SQL.Database(fileBuffer)
  } else {
    dbInstance = new SQL.Database()
  }

  return dbInstance
}

function saveDb(db: SqlJsDatabase): void {
  const data = db.export()
  const dbPath = getDbPath()
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(dbPath, Buffer.from(data))
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (dbInstance) saveDb(dbInstance)
    saveTimer = null
  }, 2000)
}

export async function flushDb(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (dbInstance) saveDb(dbInstance)
}

function safeTableName(roomId: string): string {
  return 'room_' + roomId.replace(/[^a-zA-Z0-9]/g, '')
}

export function initializeTable(roomId: string, nickname: string): void {
  getDb().then(db => {
    const tableName = safeTableName(roomId)
    db.run(`CREATE TABLE IF NOT EXISTS [${tableName}] (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Time TEXT NOT NULL,
      Type TEXT NOT NULL,
      UserName TEXT NOT NULL,
      Content TEXT DEFAULT '',
      GiftName TEXT DEFAULT '',
      GiftCount INTEGER DEFAULT 0,
      GiftPrice INTEGER DEFAULT 0,
      LikeCount INTEGER DEFAULT 0,
      Avatar TEXT DEFAULT '',
      ProfileUrl TEXT DEFAULT '',
      RawData TEXT DEFAULT ''
    )`)

    // Migrate existing tables that lack the new columns
    try { db.run(`ALTER TABLE [${tableName}] ADD COLUMN Avatar TEXT DEFAULT ''`) } catch { /* already exists */ }
    try { db.run(`ALTER TABLE [${tableName}] ADD COLUMN ProfileUrl TEXT DEFAULT ''`) } catch { /* already exists */ }
    try { db.run(`ALTER TABLE [${tableName}] ADD COLUMN RawData TEXT DEFAULT ''`) } catch { /* already exists */ }

    ensureRoomInfoTable(db)
    db.run(`INSERT OR REPLACE INTO room_info (RoomId, Nickname, LastActive) VALUES (?, ?, ?)`,
      [roomId, nickname, new Date().toISOString().replace('T', ' ').substring(0, 19)])
    saveDb(db)
  }).catch((ex) => logger.error(LOG_MODULE, 'initializeTable失败', ex))
}

export interface DanmuInsert {
  type: string
  userName: string
  content: string
  giftName: string
  giftCount: number
  giftPrice: number
  likeCount: number
  avatar: string
  profileUrl: string
  rawData: string
}

export function insertMessage(roomId: string, msg: DanmuInsert): void {
  getDb().then(db => {
    const tableName = safeTableName(roomId)
    db.run(`INSERT INTO [${tableName}] (Time, Type, UserName, Content, GiftName, GiftCount, GiftPrice, LikeCount, Avatar, ProfileUrl, RawData) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [new Date().toISOString().replace('T', ' ').substring(0, 19), msg.type, msg.userName, msg.content, msg.giftName, msg.giftCount, msg.giftPrice, msg.likeCount, msg.avatar, msg.profileUrl, msg.rawData])
    scheduleSave()
  }).catch((ex) => logger.error(LOG_MODULE, 'insertMessage失败', ex))
}

export interface RoomInfo {
  roomId: string
  nickname: string
  lastActive: string
  messageCount: number
}

export async function getRooms(): Promise<RoomInfo[]> {
  const db = await getDb()
  ensureRoomInfoTable(db)

  const rows = db.exec('SELECT RoomId, Nickname, LastActive FROM room_info ORDER BY LastActive DESC')
  const rooms: RoomInfo[] = []

  if (rows.length > 0) {
    for (const row of rows[0].values) {
      const roomId = row[0] as string
      let messageCount = 0
      try {
        const tableName = safeTableName(roomId)
        const cntRows = db.exec(`SELECT COUNT(*) as cnt FROM [${tableName}]`)
        if (cntRows.length > 0 && cntRows[0].values.length > 0) {
          messageCount = cntRows[0].values[0][0] as number
        }
      } catch { /* table may not exist */ }

      rooms.push({
        roomId,
        nickname: row[1] as string,
        lastActive: row[2] as string,
        messageCount
      })
    }
  }

  return rooms
}

export interface DanmuRecord {
  id: number
  time: string
  type: string
  userName: string
  content: string
  giftName: string
  giftCount: number
  giftPrice: number
  likeCount: number
  avatar: string
  profileUrl: string
  rawData: string
  displayLine: string
}

export async function getMessages(roomId: string, typeFilter?: string, keyword?: string, username?: string, limit = 2000): Promise<DanmuRecord[]> {
  const db = await getDb()
  const tableName = safeTableName(roomId)
  const whereParts: string[] = []
  const params: any[] = []

  if (typeFilter) { whereParts.push('Type = ?'); params.push(typeFilter) }
  if (keyword) { whereParts.push('(Content LIKE ? OR UserName LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`) }
  if (username) { whereParts.push('UserName LIKE ?'); params.push(`%${username}%`) }

  const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : ''

  const rows = db.exec(`SELECT Id, Time, Type, UserName, Content, GiftName, GiftCount, GiftPrice, LikeCount, Avatar, ProfileUrl, RawData FROM [${tableName}] ${whereClause} ORDER BY Id DESC LIMIT ${limit}`, params)

  const messages: DanmuRecord[] = []
  if (rows.length > 0) {
    for (const row of rows[0].values) {
      const type = row[2] as string
      const userName = (row[3] as string) || ''
      const content = (row[4] as string) || ''
      const giftName = (row[5] as string) || ''
      const giftCount = (row[6] as number) || 0
      const likeCount = (row[8] as number) || 0

      messages.push({
        id: row[0] as number,
        time: row[1] as string,
        type,
        userName,
        content,
        giftName,
        giftCount,
        giftPrice: (row[7] as number) || 0,
        likeCount,
        avatar: (row[9] as string) || '',
        profileUrl: (row[10] as string) || '',
        rawData: (row[11] as string) || '',
        displayLine: getDisplayLine(type, userName, content, giftName, giftCount, likeCount)
      })
    }
  }

  messages.reverse()
  return messages
}

function getDisplayLine(type: string, userName: string, content: string, giftName: string, giftCount: number, likeCount: number): string {
  switch (type) {
    case 'Chat': return `${userName}: ${content}`
    case 'Gift': return `${userName} 赠送 ${giftName} x${giftCount}`
    case 'Member': return `${userName} 进入直播间`
    case 'Like': return `${userName} 点赞了 ${likeCount} 次`
    case 'Social': return `${userName} 关注了主播`
    case 'Stats': return content
    default: return content
  }
}

export async function getAllMessagesForExport(roomId: string, nickname: string, typeFilter?: string, keyword?: string, username?: string): Promise<DanmuRecord[]> {
  return getMessages(roomId, typeFilter, keyword, username, 999999)
}

export async function clearAll(): Promise<void> {
  const db = await getDb()
  const rows = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'room_%'")
  if (rows.length > 0) {
    for (const row of rows[0].values) {
      db.run(`DROP TABLE IF EXISTS [${row[0]}]`)
    }
  }
  try { db.run('DELETE FROM room_info WHERE 1=1') } catch { /* ignore */ }
  saveDb(db)
}

function ensureRoomInfoTable(db: SqlJsDatabase): void {
  db.run(`CREATE TABLE IF NOT EXISTS room_info (
    RoomId TEXT PRIMARY KEY,
    Nickname TEXT DEFAULT '',
    LastActive TEXT DEFAULT ''
  )`)
}
