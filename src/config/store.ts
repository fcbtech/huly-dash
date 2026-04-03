import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface HulyConfig {
  url: string
  workspace: string
  token: string
}

const CONFIG_DIR = join(homedir(), '.config', 'huly')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export function loadConfig (): HulyConfig | null {
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as HulyConfig
  } catch {
    return null
  }
}

export function saveConfig (config: HulyConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
}

export function deleteConfig (): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE)
  }
}

export function getConfigPath (): string {
  return CONFIG_FILE
}
