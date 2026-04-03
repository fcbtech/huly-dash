import { connect, type PlatformClient } from '@hcengineering/api-client'
import { type HulyConfig } from '../config/store'
import { getCredentials } from '../config/auth'

export interface ConnectOverrides {
  url?: string
  workspace?: string
}

export async function createClient (
  config: HulyConfig,
  overrides: ConnectOverrides = {}
): Promise<PlatformClient> {
  const url = overrides.url || config.url
  const workspace = overrides.workspace || config.workspace

  const creds = getCredentials(config)
  if (!creds) {
    throw new Error('Stored credentials are invalid. Run `huly auth login` again.')
  }

  const client = await connect(url, {
    email: creds.email,
    password: creds.password,
    workspace
  })

  return client
}
