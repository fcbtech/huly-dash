import { type PlatformClient, markdown } from '@hcengineering/api-client'
import tracker, {
  type Issue,
  type Milestone,
  IssuePriority
} from '@hcengineering/tracker'
import contact, { type Person } from '@hcengineering/contact'
import task from '@hcengineering/task'
import tags from '@hcengineering/tags'
import { generateId, makeCollabId, type Ref, type Doc, type DocumentUpdate, SortingOrder } from '@hcengineering/core'
import { jsonToMarkup } from '@hcengineering/text'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import {
  buildStatusMap,
  categoryLabel,
  getWonStatusIds,
  findStatusByName,
  type StatusInfo
} from './statuses'
import type { IssueRow, IssueDetail } from '../types'

const PRIORITY_LABELS: Record<number, string> = {
  [IssuePriority.NoPriority]: 'none',
  [IssuePriority.Urgent]: 'urgent',
  [IssuePriority.High]: 'high',
  [IssuePriority.Medium]: 'medium',
  [IssuePriority.Low]: 'low'
}

const PRIORITY_VALUES: Record<string, number> = {
  urgent: IssuePriority.Urgent,
  high: IssuePriority.High,
  medium: IssuePriority.Medium,
  low: IssuePriority.Low,
  none: IssuePriority.NoPriority
}

function formatDate (ts: number | null | undefined): string | null {
  if (!ts) return null
  return new Date(ts).toISOString().split('T')[0]
}

function formatName (name: string | undefined): string | null {
  if (!name) return null
  if (name.includes(',')) {
    const [last, first] = name.split(',')
    return `${first} ${last}`.trim()
  }
  return name
}

function toIssueRow (
  issue: Issue,
  statusMap: Map<string, StatusInfo>,
  employeeMap: Map<string, string>,
  milestoneMap: Map<string, string>
): IssueRow {
  const statusInfo = statusMap.get(issue.status as string)
  return {
    identifier: issue.identifier,
    title: issue.title,
    status: statusInfo?.name || 'Unknown',
    statusCategory: categoryLabel(statusInfo?.category) as IssueRow['statusCategory'],
    assignee: issue.assignee ? (employeeMap.get(issue.assignee as string) || null) : null,
    priority: PRIORITY_LABELS[issue.priority] || 'none',
    estimation: issue.estimation || 0,
    milestone: issue.milestone ? (milestoneMap.get(issue.milestone as string) || null) : null,
    dueDate: formatDate(issue.dueDate),
    createdOn: formatDate(issue.createdOn),
    modifiedOn: formatDate(issue.modifiedOn) || ''
  }
}

export interface ListIssuesOptions {
  project?: string
  assignee?: string
  status?: string
  priority?: string
  milestone?: string
  label?: string
  limit?: number
}

export async function listIssues (
  client: PlatformClient,
  opts: ListIssuesOptions = {}
): Promise<IssueRow[]> {
  const statusMap = await buildStatusMap(client)
  const query: Record<string, any> = {}

  // Filter: only open issues by default (exclude Won and Lost)
  query.isDone = { $ne: true }

  // Filter by status name
  if (opts.status) {
    const found = findStatusByName(statusMap, opts.status)
    if (found) {
      query.status = found._id
      delete query.isDone // user explicitly asked for a status, don't filter by isDone
    }
  }

  // Filter by priority
  if (opts.priority) {
    const pVal = PRIORITY_VALUES[opts.priority.toLowerCase()]
    if (pVal !== undefined) {
      query.priority = pVal
    }
  }

  // Filter by project identifier
  if (opts.project) {
    const projects = await client.findAll(tracker.class.Project, {})
    const match = projects.find(
      (p) => p.identifier.toLowerCase() === opts.project!.toLowerCase()
    )
    if (match) {
      query.space = match._id
    }
  }

  // Filter by milestone name
  if (opts.milestone) {
    const milestones = await client.findAll(tracker.class.Milestone, {})
    const match = milestones.find(
      (m) => m.label.toLowerCase() === opts.milestone!.toLowerCase()
    )
    if (match) {
      query.milestone = match._id
    }
  }

  const issues = await client.findAll(tracker.class.Issue, query, {
    limit: opts.limit || 50,
    sort: { modifiedOn: SortingOrder.Descending }
  })

  // Resolve assignee names
  const employeeMap = await buildEmployeeMap(client, issues)

  // Resolve milestone labels
  const milestoneMap = await buildMilestoneMap(client, issues)

  // Filter by label (post-query — labels are stored as TagReference docs)
  let filtered = issues as Issue[]
  if (opts.label) {
    const tagRefs = await client.findAll(tags.class.TagReference, {})
    const lower = opts.label.toLowerCase()
    const matchingIssueIds = new Set(
      tagRefs
        .filter((t) => t.title.toLowerCase().includes(lower))
        .map((t) => t.attachedTo as string)
    )
    filtered = filtered.filter((i) => matchingIssueIds.has(i._id as string))
  }

  // Filter by assignee name (post-query — Huly stores assignee as Ref<Person>)
  if (opts.assignee) {
    const lower = opts.assignee.toLowerCase()
    filtered = filtered.filter((i) => {
      if (!i.assignee) return false
      const name = employeeMap.get(i.assignee as string)
      return name?.toLowerCase().includes(lower) || false
    })
  }

  return filtered.map((i) => toIssueRow(i, statusMap, employeeMap, milestoneMap))
}

export async function getIssue (
  client: PlatformClient,
  identifier: string
): Promise<IssueDetail | null> {
  const issue = await client.findOne(tracker.class.Issue, {
    identifier: identifier.toUpperCase()
  })

  if (!issue) return null

  const statusMap = await buildStatusMap(client)
  const employeeMap = await buildEmployeeMap(client, [issue])
  const milestoneMap = await buildMilestoneMap(client, [issue])

  // Resolve project identifier
  const projects = await client.findAll(tracker.class.Project, {})
  const project = projects.find((p) => p._id === issue.space)

  const description = issue.description
    ? await client.fetchMarkup(
        tracker.class.Issue,
        issue._id as Ref<Doc>,
        'description',
        issue.description,
        'markdown'
      )
    : null

  const row = toIssueRow(issue, statusMap, employeeMap, milestoneMap)

  return {
    ...row,
    description,
    project: project?.identifier || 'Unknown',
    number: issue.number
  }
}

export interface CreateIssueOptions {
  title: string
  project: string
  description?: string
  assignee?: string
  priority?: string
  estimation?: number
  milestone?: string
  due?: string
  /** Parent issue identifier (e.g. ENG-16999). When set, the new issue is
   *  created as a sub-issue attached to the parent instead of the project. */
  parent?: string
}

export async function createIssue (
  client: PlatformClient,
  opts: CreateIssueOptions
): Promise<string> {
  // Resolve project
  const projects = await client.findAll(tracker.class.Project, {})
  const project = projects.find(
    (p) => p.identifier.toLowerCase() === opts.project.toLowerCase()
  )
  if (!project) {
    throw new Error(`Project "${opts.project}" not found.`)
  }

  // Resolve the Issue task type for this project's type.
  // `kind` must reference a TaskType (e.g. tracker:taskTypes:Issue), NOT the
  // ProjectType — otherwise Huly can't resolve the issue's status set and the
  // status control/filter won't render in the UI.
  const projectType = await client.findOne(task.class.ProjectType, { _id: project.type })
  const taskTypes = projectType?.tasks?.length
    ? await client.findAll(task.class.TaskType, { _id: { $in: projectType.tasks } })
    : []
  const issueTaskType = taskTypes.find((t) => t.ofClass === tracker.class.Issue)
  if (!issueTaskType) {
    throw new Error(`Could not resolve an Issue task type for project "${opts.project}".`)
  }

  // Resolve assignee
  let assigneeRef: Ref<Person> | null = null
  if (opts.assignee) {
    assigneeRef = await resolveEmployee(client, opts.assignee)
    if (!assigneeRef) {
      throw new Error(`Assignee "${opts.assignee}" not found.`)
    }
  }

  // Resolve priority
  const priority = opts.priority
    ? (PRIORITY_VALUES[opts.priority.toLowerCase()] ?? IssuePriority.NoPriority)
    : IssuePriority.NoPriority

  // Resolve milestone
  let milestoneRef: Ref<Milestone> | null = null
  if (opts.milestone) {
    const milestones = await client.findAll(tracker.class.Milestone, { space: project._id })
    const match = milestones.find(
      (m) => m.label.toLowerCase() === opts.milestone!.toLowerCase()
    )
    if (match) {
      milestoneRef = match._id as Ref<Milestone>
    } else {
      throw new Error(`Milestone "${opts.milestone}" not found in project ${opts.project}.`)
    }
  }

  // Resolve due date
  const dueDate = opts.due ? new Date(opts.due).getTime() : null

  const issueId = generateId() as Ref<Issue>

  // When --parent is given, attach as a sub-issue of that parent; otherwise
  // attach directly to the project. The `parents` chain links up to the root.
  let attachedTo: Ref<Doc> = project._id as unknown as Ref<Doc>
  let attachedToClass = tracker.class.Project as unknown as Ref<any>
  let collection = 'issues'
  let parents: any[] = []
  if (opts.parent) {
    const parentIssue = await client.findOne(tracker.class.Issue, {
      identifier: opts.parent.toUpperCase()
    })
    if (!parentIssue) {
      throw new Error(`Parent issue "${opts.parent}" not found.`)
    }
    attachedTo = parentIssue._id as unknown as Ref<Doc>
    attachedToClass = tracker.class.Issue as unknown as Ref<any>
    collection = 'subIssues'
    parents = [
      {
        parentId: parentIssue._id,
        parentTitle: parentIssue.title,
        identifier: parentIssue.identifier,
        space: parentIssue.space
      },
      ...((parentIssue as any).parents ?? [])
    ]
  }

  // Markup fields (description) must be passed as a MarkupContent value so the
  // client uploads + links the content. Storing a bare uploadMarkup ref via
  // addCollection/updateDoc does NOT seed the collaborative doc (reads back empty).
  const description = opts.description ? markdown(opts.description) : null

  // Create the issue using addCollection (Issue extends AttachedDoc)
  // Next issue number comes from the project sequence. The server does NOT
  // auto-assign it, so we must compute it AND persist the bumped sequence
  // below — otherwise the next create reuses this number and collides.
  const newNumber = (project.sequence ?? 0) + 1

  await client.addCollection(
    tracker.class.Issue,
    project._id,
    attachedTo,
    attachedToClass,
    collection,
    {
      title: opts.title,
      description,
      status: project.defaultIssueStatus,
      priority,
      assignee: assigneeRef,
      component: null,
      milestone: milestoneRef,
      estimation: opts.estimation || 0,
      remainingTime: 0,
      reportedTime: 0,
      childInfo: [],
      parents,
      relations: [],
      dueDate,
      kind: issueTaskType._id as any,
      number: newNumber,
      identifier: `${project.identifier}-${newNumber}`,
      rank: '' as any
    } as any,
    issueId
  )

  // Persist the bumped sequence so the next issue gets a fresh number.
  await client.updateDoc(tracker.class.Project, project._id, project._id, {
    sequence: newNumber
  })

  // Re-fetch to get the server-assigned identifier
  const created = await client.findOne(tracker.class.Issue, { _id: issueId as any })
  return created?.identifier || issueId as string
}

export interface UpdateIssueOptions {
  title?: string
  description?: string
  assignee?: string
  priority?: string
  status?: string
  estimation?: number
  milestone?: string
  due?: string
}

export async function updateIssue (
  client: PlatformClient,
  identifier: string,
  opts: UpdateIssueOptions
): Promise<void> {
  const issue = await client.findOne(tracker.class.Issue, {
    identifier: identifier.toUpperCase()
  })
  if (!issue) {
    throw new Error(`Issue "${identifier}" not found.`)
  }

  const updates: Record<string, any> = {}
  let didInPlaceMarkup = false

  if (opts.title !== undefined) updates.title = opts.title

  if (opts.description !== undefined) {
    // The api-client only ever calls collaborator.createMarkup, which returns
    // HTTP 500 when the field's collaborative doc already exists. So for an
    // issue that already has a description we update the collab doc in place
    // via collaborator.updateMarkup; only a fresh description goes through the
    // create path (markdown()).
    if (opts.description && (issue as any).description) {
      const mk: any = (client as any).markup
      const node = markdownToMarkup(opts.description, { refUrl: mk.refUrl, imageUrl: mk.imageUrl })
      const markupStr = jsonToMarkup(node)
      const collabId = makeCollabId(tracker.class.Issue, issue._id, 'description')
      await mk.collaborator.updateMarkup(collabId, markupStr)
      didInPlaceMarkup = true
    } else {
      updates.description = opts.description ? markdown(opts.description) : null
    }
  }

  if (opts.assignee !== undefined) {
    const ref = await resolveEmployee(client, opts.assignee)
    if (!ref) throw new Error(`Assignee "${opts.assignee}" not found.`)
    updates.assignee = ref
  }

  if (opts.priority !== undefined) {
    const pVal = PRIORITY_VALUES[opts.priority.toLowerCase()]
    if (pVal === undefined) throw new Error(`Unknown priority "${opts.priority}".`)
    updates.priority = pVal
  }

  if (opts.status !== undefined) {
    const statusMap = await buildStatusMap(client)
    const found = findStatusByName(statusMap, opts.status)
    if (!found) throw new Error(`Status "${opts.status}" not found.`)
    updates.status = found._id
  }

  if (opts.estimation !== undefined) updates.estimation = opts.estimation
  if (opts.due !== undefined) updates.dueDate = new Date(opts.due).getTime()

  if (opts.milestone !== undefined) {
    const milestones = await client.findAll(tracker.class.Milestone, { space: issue.space })
    const match = milestones.find(
      (m) => m.label.toLowerCase() === opts.milestone!.toLowerCase()
    )
    if (!match) throw new Error(`Milestone "${opts.milestone}" not found.`)
    updates.milestone = match._id
  }

  if (Object.keys(updates).length === 0) {
    if (didInPlaceMarkup) return
    throw new Error('No update flags provided.')
  }

  await client.updateDoc(
    tracker.class.Issue,
    issue.space,
    issue._id,
    updates as any
  )
}

export async function closeIssue (
  client: PlatformClient,
  identifier: string
): Promise<void> {
  const issue = await client.findOne(tracker.class.Issue, {
    identifier: identifier.toUpperCase()
  })
  if (!issue) {
    throw new Error(`Issue "${identifier}" not found.`)
  }

  const statusMap = await buildStatusMap(client)
  const wonIds = getWonStatusIds(statusMap)

  if (wonIds.size === 0) {
    throw new Error('No "Done" status found in workspace.')
  }

  // Use the first Won status
  const doneStatusId = wonIds.values().next().value

  await client.updateDoc(
    tracker.class.Issue,
    issue.space,
    issue._id,
    { status: doneStatusId, isDone: true } as DocumentUpdate<Issue>
  )
}

// --- Helpers ---

async function buildEmployeeMap (
  client: PlatformClient,
  issues: Issue[]
): Promise<Map<string, string>> {
  const assigneeIds = [...new Set(
    issues.filter((i) => i.assignee).map((i) => i.assignee!)
  )]

  if (assigneeIds.length === 0) return new Map()

  const employees = await client.findAll(contact.class.Person, {
    _id: { $in: assigneeIds as any }
  })

  const map = new Map<string, string>()
  for (const emp of employees) {
    map.set(emp._id as string, formatName(emp.name) || 'Unknown')
  }
  return map
}

async function buildMilestoneMap (
  client: PlatformClient,
  issues: Issue[]
): Promise<Map<string, string>> {
  const milestoneIds = [...new Set(
    issues.filter((i) => i.milestone).map((i) => i.milestone!)
  )]

  if (milestoneIds.length === 0) return new Map()

  const milestones = await client.findAll(tracker.class.Milestone, {
    _id: { $in: milestoneIds as any }
  })

  const map = new Map<string, string>()
  for (const ms of milestones) {
    map.set(ms._id as string, ms.label)
  }
  return map
}

async function resolveEmployee (
  client: PlatformClient,
  name: string
): Promise<Ref<Person> | null> {
  // Don't filter on { active: true } — in this workspace no Person has the
  // active flag set, so that filter matched nobody and broke --assignee for
  // every user. Match across all persons instead.
  const employees = await client.findAll(contact.class.Person, {})
  const lower = name.toLowerCase()
  const match = employees.find((e) => {
    const formatted = formatName(e.name)?.toLowerCase() || ''
    return formatted.includes(lower) || e.name.toLowerCase().includes(lower)
  })
  return match ? match._id as Ref<Person> : null
}
