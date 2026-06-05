import { readFileSync } from 'fs'
import { Command } from 'commander'
import { requireAuth } from '../config/auth'
import { createClient } from '../lib/client'
import { listIssues, getIssue, createIssue, updateIssue, closeIssue } from '../lib/issues'
import { output, formatIssueList, formatIssueDetail } from '../formatters/index'

export function registerIssueCommand (program: Command): void {
  const issue = program
    .command('issue')
    .description('Manage issues')

  issue
    .command('list')
    .description('List open issues')
    .option('--project <id>', 'Filter by project identifier')
    .option('--assignee <name>', 'Filter by assignee name')
    .option('--status <name>', 'Filter by status name')
    .option('--priority <level>', 'Filter by priority (urgent/high/medium/low)')
    .option('--milestone <name>', 'Filter by milestone name')
    .option('--label <name>', 'Filter by label name')
    .option('--limit <n>', 'Max issues to return', '50')
    .option('--json', 'Output as JSON', false)
    .action(async (opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const issues = await listIssues(client, {
          project: opts.project,
          assignee: opts.assignee,
          status: opts.status,
          priority: opts.priority,
          milestone: opts.milestone,
          label: opts.label,
          limit: parseInt(opts.limit, 10)
        })
        output(issues, formatIssueList(issues), opts.json)
      } finally {
        await client.close()
      }
    })

  issue
    .command('view <identifier>')
    .description('View issue details')
    .option('--json', 'Output as JSON', false)
    .action(async (identifier: string, opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const detail = await getIssue(client, identifier)
        if (!detail) {
          console.error(`Issue "${identifier}" not found.`)
          process.exit(1)
        }
        output(detail, formatIssueDetail(detail), opts.json)
      } finally {
        await client.close()
      }
    })

  issue
    .command('create')
    .description('Create a new issue (use --parent to create a sub-issue)')
    .requiredOption('--title <title>', 'Issue title')
    .requiredOption('--project <id>', 'Project identifier')
    .option('--description <text>', 'Issue description (markdown)')
    .option('--description-file <path>', 'Read description (markdown) from a file')
    .option('--parent <id>', 'Parent issue identifier (creates a sub-issue, e.g. ENG-16999)')
    .option('--assignee <name>', 'Assignee name')
    .option('--priority <level>', 'Priority (urgent/high/medium/low)')
    .option('--estimation <pts>', 'Story points')
    .option('--milestone <name>', 'Milestone name')
    .option('--due <date>', 'Due date (YYYY-MM-DD)')
    .option('--json', 'Output as JSON', false)
    .action(async (opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const description = opts.descriptionFile
          ? readFileSync(opts.descriptionFile, 'utf8')
          : opts.description
        const identifier = await createIssue(client, {
          title: opts.title,
          project: opts.project,
          description,
          parent: opts.parent,
          assignee: opts.assignee,
          priority: opts.priority,
          estimation: opts.estimation ? parseInt(opts.estimation, 10) : undefined,
          milestone: opts.milestone,
          due: opts.due
        })
        if (opts.json) {
          console.log(JSON.stringify({ identifier }))
        } else {
          console.log(`Created ${identifier}`)
        }
      } finally {
        await client.close()
      }
    })

  issue
    .command('update <identifier>')
    .description('Update an existing issue')
    .option('--title <text>', 'New title')
    .option('--description <text>', 'New description (markdown supported)')
    .option('--description-file <path>', 'Read new description (markdown) from a file')
    .option('--assignee <name>', 'New assignee')
    .option('--priority <level>', 'New priority')
    .option('--status <name>', 'New status')
    .option('--estimation <pts>', 'New story points')
    .option('--milestone <name>', 'New milestone')
    .option('--due <date>', 'New due date (YYYY-MM-DD)')
    .action(async (identifier: string, opts) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        const description = opts.descriptionFile
          ? readFileSync(opts.descriptionFile, 'utf8')
          : opts.description
        await updateIssue(client, identifier, {
          title: opts.title,
          description,
          assignee: opts.assignee,
          priority: opts.priority,
          status: opts.status,
          estimation: opts.estimation ? parseInt(opts.estimation, 10) : undefined,
          milestone: opts.milestone,
          due: opts.due
        })
        console.log(`Updated ${identifier.toUpperCase()}`)
      } finally {
        await client.close()
      }
    })

  issue
    .command('close <identifier>')
    .description('Close an issue (set to Done status)')
    .action(async (identifier: string) => {
      const config = requireAuth()
      const client = await createClient(config, program.opts())
      try {
        await closeIssue(client, identifier)
        console.log(`Closed ${identifier.toUpperCase()}`)
      } finally {
        await client.close()
      }
    })
}
