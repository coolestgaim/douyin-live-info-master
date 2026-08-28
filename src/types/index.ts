export enum DanmuType {
  Chat = 'Chat',
  Gift = 'Gift',
  Member = 'Member',
  Like = 'Like',
  Social = 'Social',
  Stats = 'Stats'
}

export interface DanmuMessage {
  type: DanmuType
  userName: string
  content: string
  giftName: string
  giftCount: number
  giftPrice: number
  likeCount: number
  totalUser: number
  totalLike: number
  time: string
  roomName: string
  avatar: string
  profileUrl: string
  roomId?: string
}

export enum DanmuConnectionState {
  None = 'None',
  Connecting = 'Connecting',
  Connected = 'Connected',
  Disconnected = 'Disconnected'
}

export interface LiveRoomInfo {
  url: string
  enterRoomId: string
  nickname: string
  title: string
  roomStatus: number
  likeCount: number
  viewCount: number
  error: string
  connectionState: DanmuConnectionState
  index: number
}

export interface RoomStats {
  roomId: string
  nickname: string
  danmuCount: number
  giftCount: number
  likeCount: number
  memberCount: number
  followCount: number
  isConnected: boolean
  isRecording: boolean
  recordDurationText: string
  recordSizeText: string
  roomLikeCount: number
  roomViewCount: number
  roomStatus: number
}

export interface RecordingItem {
  roomId: string
  nickname: string
  durationText: string
  sizeText: string
  isActive: boolean
  statusText: string
  outputPath: string
  /** 录制会话子文件夹（v2.9.15 起：{昵称}_{时间}/） */
  outputDir?: string
  /** 弹幕 CSV 路径 */
  csvPath?: string
}

export interface RoomInfo {
  roomId: string
  nickname: string
  lastActive: string
  /** 本次连接的开始时间（v2.9.25：每次连接一条独立记录） */
  sessionStart: string
  messageCount: number
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
}

export interface RecordConfig {
  outputFormat: string
  outputPath: string
}
