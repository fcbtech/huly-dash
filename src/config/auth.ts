import { connect } from '@hcengineering/api-client'
import { loadConfig, saveConfig, deleteConfig, type HulyConfig } from './store'

export interface LoginOptions {
  url: string
  workspace: string
  email: string
  password: string
}

export async function login (opts: LoginOptions): Promise<void> {
  const client = await connect(opts.url, {
    email: opts.email,
    password: opts.password,
    workspace: opts.workspace
  })
  await client.close()

  saveConfig({
    url: opts.url,
    workspace: opts.workspace,
    token: Buffer.from(JSON.stringify({
      email: opts.email,
      password: opts.password
    })).toString('base64')
  })
}

export function logout (): void {
  deleteConfig()
}

export function getCredentials (config: HulyConfig): { email: string; password: string } | null {
  try {
    return JSON.parse(Buffer.from(config.token, 'base64').toString('utf-8'))
  } catch {
    return null
  }
}

export function requireAuth (): HulyConfig {
  const config = loadConfig()
  if (!config) {
    console.error('Not logged in. Run `huly auth login` first.')
    process.exit(1)
  }
  return config
}
