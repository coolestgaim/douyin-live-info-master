import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'

export interface RecordConfig {
  outputFormat: string
  outputPath: string
  recordQuality: string
  segmentEnabled: boolean
  segmentDuration: number
  licenseServerUrl: string
}

const DEFAULT_KEY = ''

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'record.json')
}

export function loadConfig(): RecordConfig {
  const configPath = getConfigPath()
  const defaults: RecordConfig = { outputFormat: 'mp3', outputPath: '', recordQuality: 'OD', segmentEnabled: false, segmentDuration: 30, licenseServerUrl: '' }
  if (!fs.existsSync(configPath)) return { ...defaults }
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return {
      outputFormat: cfg.outputFormat || defaults.outputFormat,
      outputPath: cfg.outputPath || defaults.outputPath,
      recordQuality: cfg.recordQuality || defaults.recordQuality,
      segmentEnabled: cfg.segmentEnabled ?? defaults.segmentEnabled,
      segmentDuration: cfg.segmentDuration || defaults.segmentDuration,
      licenseServerUrl: cfg.licenseServerUrl || defaults.licenseServerUrl
    }
  } catch {
    return { ...defaults }
  }
}

export function saveConfig(config: RecordConfig): void {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

export function getEffectiveOutputPath(config: RecordConfig): string {
  if (config.outputPath && fs.existsSync(config.outputPath)) return config.outputPath
  return path.join(os.homedir(), 'Desktop', '直播录制')
}
