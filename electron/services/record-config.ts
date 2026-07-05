import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'

export interface RecordConfig {
  outputFormat: string
  outputPath: string
  dashscopeKey: string
}

const DEFAULT_KEY = 'sk-ws-H.RXRIXDR.GMmo.MEUCIDjHPaAcDJzcUXIEHRtZEf4DoET55gktdIBiHUPWyhIEAiEAmz587AkTWFSw4v6mmRJt5ftPfAOSyH5N-IuSRyLOP9c'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'record.json')
}

export function loadConfig(): RecordConfig {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) return { outputFormat: 'mp3', outputPath: '', dashscopeKey: DEFAULT_KEY }
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return { outputFormat: cfg.outputFormat || 'mp3', outputPath: cfg.outputPath || '', dashscopeKey: cfg.dashscopeKey || DEFAULT_KEY }
  } catch {
    return { outputFormat: 'mp3', outputPath: '', dashscopeKey: DEFAULT_KEY }
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
