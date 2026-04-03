import { Command } from 'commander'
import { requireAuth } from '../config/auth'
import { createClient } from '../lib/client'
import { listMilestones, getMilestone } from '../lib/milestones'
import { output, formatMilestoneList, formatMilestoneDetail } from '../formatters/index'

export function registerMilestoneCommand (program: Command): void {
  const milestone = program
    .command('milestone')
    .description('Manage milestones')

  milestone
    .command('list')
    .description('List milestones')
    .option('--project <id>', 'Filter by project identifier')
    .option('--json', 'Output as JSON', false)
    .action(async (opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const milestones = await listMilestones(client, { project: opts.project })
        output(milestones, formatMilestoneList(milestones), opts.json)
      } finally {
        await client.close()
      }
    })

  milestone
    .command('view <name>')
    .description('View milestone details')
    .option('--project <id>', 'Project identifier (to disambiguate)')
    .option('--json', 'Output as JSON', false)
    .action(async (name: string, opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const detail = await getMilestone(client, name, opts.project)
        if (!detail) {
          console.error(`Milestone "${name}" not found.`)
          process.exit(1)
        }
        output(detail, formatMilestoneDetail(detail), opts.json)
      } finally {
        await client.close()
      }
    })
}
