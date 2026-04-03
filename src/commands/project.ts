import { Command } from 'commander'
import { requireAuth } from '../config/auth'
import { createClient } from '../lib/client'
import { listProjects, getProject } from '../lib/projects'
import { output, formatProjectList, formatProjectDetail } from '../formatters/index'

export function registerProjectCommand (program: Command): void {
  const project = program
    .command('project')
    .description('Manage projects')

  project
    .command('list')
    .description('List all projects')
    .option('--json', 'Output as JSON', false)
    .action(async (opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const projects = await listProjects(client)
        output(projects, formatProjectList(projects), opts.json)
      } finally {
        await client.close()
      }
    })

  project
    .command('view <identifier>')
    .description('View project details')
    .option('--json', 'Output as JSON', false)
    .action(async (identifier: string, opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const detail = await getProject(client, identifier)
        if (!detail) {
          console.error(`Project "${identifier}" not found.`)
          process.exit(1)
        }
        output(detail, formatProjectDetail(detail), opts.json)
      } finally {
        await client.close()
      }
    })
}
