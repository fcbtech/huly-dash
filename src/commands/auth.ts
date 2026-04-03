import { Command } from 'commander'
import { loadConfig, getConfigPath } from '../config/store'
import { login, logout } from '../config/auth'

export function registerAuthCommand (program: Command): void {
  const auth = program
    .command('auth')
    .description('Manage authentication')

  auth
    .command('login')
    .description('Login to a Huly workspace')
    .requiredOption('--email <email>', 'Account email')
    .requiredOption('--password <password>', 'Account password')
    .option('--url <url>', 'Huly instance URL', 'https://huly.app')
    .action(async (opts) => {
      const workspace = program.opts().workspace || opts.workspace
      if (!workspace) {
        console.error('error: workspace is required. Use --workspace <name> before the auth command.')
        process.exit(1)
      }
      try {
        await login({
          url: opts.url,
          workspace,
          email: opts.email,
          password: opts.password
        })
        console.log(`Logged in to ${workspace} at ${opts.url}`)
        console.log(`Config saved to ${getConfigPath()}`)
      } catch (err: any) {
        console.error(`Login failed: ${err.message || err}`)
        process.exit(1)
      }
    })

  auth
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
      logout()
      console.log('Logged out. Config removed.')
    })

  auth
    .command('status')
    .description('Show current authentication status')
    .action(() => {
      const config = loadConfig()
      if (!config) {
        console.log('Not logged in.')
        return
      }
      console.log(`URL:       ${config.url}`)
      console.log(`Workspace: ${config.workspace}`)
      console.log(`Auth:      configured`)
      console.log(`Config:    ${getConfigPath()}`)
    })
}
