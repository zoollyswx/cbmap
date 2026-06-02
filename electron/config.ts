import fs from 'fs'

export function loadConfig(configPath: string): Record<string, any> {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch {
    // ignore
  }
  return {}
}

export function saveConfig(configPath: string, config: Record<string, any>): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
