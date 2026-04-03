import chalk from 'chalk'
import Table from 'cli-table3'
import type {
  IssueRow,
  IssueDetail,
  ProjectRow,
  ProjectDetail,
  MilestoneRow,
  MilestoneDetail,
  MemberRow
} from '../types'

function statusColor (category: string): (s: string) => string {
  switch (category) {
    case 'done': return chalk.green
    case 'active': return chalk.cyan
    case 'todo': return chalk.yellow
    case 'cancelled': return chalk.gray
    case 'backlog': return chalk.dim
    default: return chalk.white
  }
}

function priorityColor (priority: string): (s: string) => string {
  switch (priority) {
    case 'urgent': return chalk.red.bold
    case 'high': return chalk.red
    case 'medium': return chalk.yellow
    case 'low': return chalk.dim
    default: return chalk.dim
  }
}

function truncate (str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '\u2026'
}

export function formatIssueList (issues: IssueRow[]): string {
  if (issues.length === 0) return chalk.dim('No issues found.')

  const table = new Table({
    head: ['ID', 'Title', 'Status', 'Assignee', 'Priority', 'Pts'].map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
    colWidths: [12, 36, 14, 16, 10, 6]
  })

  for (const issue of issues) {
    const colorStatus = statusColor(issue.statusCategory)
    const colorPriority = priorityColor(issue.priority)
    table.push([
      chalk.bold(issue.identifier),
      truncate(issue.title, 34),
      colorStatus(issue.status),
      issue.assignee ? truncate(issue.assignee, 14) : chalk.dim('-'),
      colorPriority(issue.priority),
      issue.estimation > 0 ? String(issue.estimation) : chalk.dim('-')
    ])
  }

  return table.toString()
}

export function formatIssueDetail (issue: IssueDetail): string {
  const colorStatus = statusColor(issue.statusCategory)
  const colorPriority = priorityColor(issue.priority)

  const lines = [
    `${chalk.bold(issue.identifier)}  ${issue.title}`,
    '',
    `  Project:    ${issue.project}`,
    `  Status:     ${colorStatus(issue.status)}`,
    `  Priority:   ${colorPriority(issue.priority)}`,
    `  Assignee:   ${issue.assignee || chalk.dim('unassigned')}`,
    `  Estimation: ${issue.estimation > 0 ? `${issue.estimation} pts` : chalk.dim('none')}`,
    `  Milestone:  ${issue.milestone || chalk.dim('none')}`,
    `  Due:        ${issue.dueDate || chalk.dim('none')}`,
    `  Modified:   ${issue.modifiedOn}`,
    `  Created:    ${issue.createdOn || chalk.dim('unknown')}`
  ]

  return lines.join('\n')
}

export function formatProjectList (projects: ProjectRow[]): string {
  if (projects.length === 0) return chalk.dim('No projects found.')

  const table = new Table({
    head: ['ID', 'Name', 'Description'].map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
    colWidths: [12, 24, 40]
  })

  for (const p of projects) {
    table.push([
      chalk.bold(p.identifier),
      truncate(p.name, 22),
      truncate(p.description, 38)
    ])
  }

  return table.toString()
}

export function formatProjectDetail (project: ProjectDetail): string {
  const lines = [
    `${chalk.bold(project.identifier)}  ${project.name}`,
    '',
    `  Description: ${project.description || chalk.dim('none')}`,
    `  Members:     ${project.memberCount}`,
    `  Open:        ${project.openIssues} issues`,
    `  Closed:      ${chalk.green(String(project.closedIssues))} issues`
  ]
  return lines.join('\n')
}

export function formatMilestoneList (milestones: MilestoneRow[]): string {
  if (milestones.length === 0) return chalk.dim('No milestones found.')

  const table = new Table({
    head: ['Label', 'Project', 'Status', 'Target', '% Done', 'Points'].map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
    colWidths: [18, 10, 14, 12, 8, 12]
  })

  for (const ms of milestones) {
    table.push([
      truncate(ms.label, 16),
      ms.project,
      ms.status,
      ms.targetDate,
      `${ms.pctComplete}%`,
      `${ms.ptsDone}/${ms.ptsTotal}`
    ])
  }

  return table.toString()
}

export function formatMilestoneDetail (ms: MilestoneDetail): string {
  const lines = [
    `${chalk.bold(ms.label)}`,
    '',
    `  Project:  ${ms.project}`,
    `  Status:   ${ms.status}`,
    `  Target:   ${ms.targetDate}`,
    `  Progress: ${ms.pctComplete}% (${ms.ptsDone}/${ms.ptsTotal} pts)`,
    `  Open:     ${ms.openIssues} issues`,
    `  Closed:   ${chalk.green(String(ms.closedIssues))} issues`
  ]
  return lines.join('\n')
}

export function formatMemberList (members: MemberRow[]): string {
  if (members.length === 0) return chalk.dim('No members found.')

  const table = new Table({
    head: ['Name', 'Role', 'Active'].map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
    colWidths: [28, 10, 8]
  })

  for (const m of members) {
    table.push([
      m.name,
      m.role,
      m.active ? chalk.green('yes') : chalk.dim('no')
    ])
  }

  return table.toString()
}
