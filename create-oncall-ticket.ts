/**
 * create-oncall-ticket.ts
 *
 * Standalone one-shot script — creates this week's OnCall Project ticket
 * in Huly and exits. Called by the Python server via subprocess.
 *
 * Usage:  npx tsx create-oncall-ticket.ts
 * Stdout: { "success": true,  "identifier": "ENG-123", "title": "..." }
 *      or { "success": false, "error": "..." }
 * Exit:   0 = success, 1 = failure
 */

import { createClient } from './src/lib/client'
import { requireAuth } from './src/config/auth'
import core, { generateId, type Ref } from '@hcengineering/core'
import tracker, { type Issue } from '@hcengineering/tracker'
import task from '@hcengineering/task'
import contact from '@hcengineering/contact'
import tags from '@hcengineering/tags'

// ── Title ─────────────────────────────────────────────────────────────────────

function ordinal (n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd', 'th'][Math.min(n % 10, 4)]}`
}

function oncallTitle (): string {
  const today = new Date()
  const sunday = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const fmt = (d: Date) =>
    `${ordinal(d.getDate())} ${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
  return `Project OnCall [${fmt(today)} - ${fmt(sunday)}]`
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main (): Promise<void> {
  // Use the same stored credentials as the huly-dash CLI (huly auth login)
  const config = requireAuth()
  const client = await createClient(config)

  try {
    // ── Project ENG ──────────────────────────────────────────────────────────
    const projects = await client.findAll(tracker.class.Project, {})
    const project = projects.find((p) => p.identifier.toLowerCase() === 'eng')
    if (!project) throw new Error('Project ENG not found')

    // ── Assignee: Suneet ──────────────────────────────────────────────────────
    const persons = await client.findAll(contact.class.Person, {})
    const fmtName = (n: string) =>
      n?.includes(',') ? n.split(',').reverse().map((s) => s.trim()).join(' ') : (n ?? '')
    const suneet = persons.find((p) => fmtName(p.name).toLowerCase().includes('suneet'))
    if (!suneet) throw new Error('Suneet not found in workspace members')

    // ── "Project" label tag ───────────────────────────────────────────────────
    const elements = await client.findAll('tags:class:TagElement' as any, {})
    const projectTag = (elements as any[]).find((e) => e.title?.toLowerCase() === 'project')
    if (!projectTag) throw new Error('"Project" tag element not found')

    // ── Description (non-fatal) ───────────────────────────────────────────────
    const title = oncallTitle()
    const description = '| | |\n|---|---|\n| Start | |\n| End | |\n| Resolved | |\n| Incoming | |'
    const issueId = generateId() as Ref<Issue>
    let descriptionRef: any = null
    try {
      descriptionRef = await (client as any).uploadMarkup(
        tracker.class.Issue, issueId, 'description', description, 'markdown'
      )
    } catch {
      // non-fatal — ticket still gets created, just without description
    }

    // ── Resolve TaskType and Todo status for this project ────────────────────
    // project.type is Ref<ProjectType>; Issue.kind must be Ref<TaskType> — different things.
    // Fetch TaskTypes for this project type, pick the first 'task' kind (not 'subtask').
    const taskTypes = await (client as any).findAll(task.class.TaskType, { parent: (project as any).type })
    const issueTaskType = (taskTypes as any[]).find((tt: any) => tt.kind === 'task') ?? (taskTypes as any[])[0]
    if (!issueTaskType) throw new Error('No TaskType found for ENG project type')

    // Find the Todo status from this task type's statuses list.
    const taskTypeStatusIds: string[] = (issueTaskType.statuses ?? []) as string[]
    const allStatuses = await client.findAll(core.class.Status as any, {})
    const typeStatuses = (allStatuses as any[]).filter((s: any) => taskTypeStatusIds.includes(s._id as string))
    const todoStatus = typeStatuses.find((s: any) => s.category === task.statusCategory.ToDo)
    const resolvedStatus = todoStatus?._id ?? (project as any).defaultIssueStatus

    process.stderr.write(`[debug] project.type=${(project as any).type}\n`)
    process.stderr.write(`[debug] issueTaskType=${issueTaskType._id} (kind=${issueTaskType.kind})\n`)
    process.stderr.write(`[debug] project.defaultIssueStatus=${(project as any).defaultIssueStatus}\n`)
    process.stderr.write(`[debug] resolvedStatus=${resolvedStatus} (${todoStatus?.name ?? 'fallback to default'})\n`)

    // ── Compute next identifier (same approach as createIssue in issues.ts) ───
    const nextNumber = ((project as any).sequence ?? 0) + 1
    const identifier = `${project.identifier}-${nextNumber}`

    // ── Create issue ──────────────────────────────────────────────────────────
    await client.addCollection(
      tracker.class.Issue,
      (project as any)._id,
      (project as any)._id,
      tracker.class.Project,
      'issues',
      {
        title,
        description: descriptionRef,
        status: resolvedStatus,
        priority: 0,
        assignee: suneet._id,
        component: null,
        milestone: null,
        estimation: 0,
        remainingTime: 0,
        reportedTime: 0,
        childInfo: [],
        parents: [],
        relations: [],
        dueDate: null,
        kind: issueTaskType._id,
        number: nextNumber,
        identifier,
        rank: ''
      } as any,
      issueId
    )

    // ── Confirm creation ──────────────────────────────────────────────────────
    const created = (await client.findOne(tracker.class.Issue, { _id: issueId as any })) as any
    if (!created) throw new Error('Could not fetch created issue after addCollection')

    process.stderr.write(`[debug] created.status after addCollection: ${created.status}\n`)

    // ── Explicitly set status via updateDoc ───────────────────────────────────
    // addCollection silently discards the status field on issue creation;
    // updateDoc is the established write path for status (same as closeIssue).
    await (client as any).updateDoc(
      tracker.class.Issue,
      created.space,
      created._id,
      { status: resolvedStatus }
    )
    process.stderr.write(`[debug] status set via updateDoc: ${resolvedStatus}\n`)

    // ── Add "Project" label ───────────────────────────────────────────────────
    await client.addCollection(
      tags.class.TagReference,
      created.space,
      created._id,
      tracker.class.Issue,
      'labels',
      { tag: projectTag._id, title: projectTag.title, color: projectTag.color } as any
    )

    process.stdout.write(
      JSON.stringify({ success: true, identifier: created.identifier, title }) + '\n'
    )
    process.exit(0)
  } catch (err: any) {
    process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\n')
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()
