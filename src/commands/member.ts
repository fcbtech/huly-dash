import { Command } from 'commander'
import { requireAuth } from '../config/auth'
import { createClient } from '../lib/client'
import { listMembers } from '../lib/members'
import { output, formatMemberList } from '../formatters/index'

export function registerMemberCommand (program: Command): void {
  const member = program
    .command('member')
    .description('View workspace members')

  member
    .command('list')
    .description('List workspace members')
    .option('--json', 'Output as JSON', false)
    .action(async (opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const members = await listMembers(client)
        output(members, formatMemberList(members), opts.json)
      } finally {
        await client.close()
      }
    })
}
