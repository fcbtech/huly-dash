import { type PlatformClient } from '@hcengineering/api-client'
import tracker, { type Milestone, MilestoneStatus } from '@hcengineering/tracker'
import { buildStatusMap, getWonStatusIds } from './statuses'
import type { MilestoneRow, MilestoneDetail } from '../types'

const STATUS_LABELS: Record<number, string> = {
  [MilestoneStatus.Planned]: 'planned',
  [MilestoneStatus.InProgress]: 'in-progress',
  [MilestoneStatus.Completed]: 'completed',
  [MilestoneStatus.Canceled]: 'canceled'
}

function formatDate (ts: number | null | undefined): string {
  if (!ts) return 'N/A'
  return new Date(ts).toISOString().split('T')[0]
}

export interface ListMilestonesOptions {
  project?: string
}

export async function listMilestones (
  client: PlatformClient,
  opts: ListMilestonesOptions = {}
): Promise<MilestoneRow[]> {
  const query: Record<string, any> = {}

  // Resolve project filter
  let projectMap = new Map<string, string>()
  const projects = await client.findAll(tracker.class.Project, {})
  for (const p of projects) {
    projectMap.set(p._id as string, p.identifier)
  }

  if (opts.project) {
    const match = projects.find(
      (p) => p.identifier.toLowerCase() === opts.project!.toLowerCase()
    )
    if (match) {
      query.space = match._id
    }
  }

  const milestones = await client.findAll(tracker.class.Milestone, query)
  const statusMap = await buildStatusMap(client)
  const wonIds = getWonStatusIds(statusMap)

  const results: MilestoneRow[] = []

  for (const ms of milestones) {
    const issues = await client.findAll(tracker.class.Issue, { milestone: ms._id })
    let ptsDone = 0
    let ptsTotal = 0

    for (const issue of issues) {
      const est = issue.estimation || 0
      ptsTotal += est
      if (wonIds.has(issue.status as string)) {
        ptsDone += est
      }
    }

    const pctComplete = ptsTotal > 0 ? Math.round((ptsDone / ptsTotal) * 100) : 0

    results.push({
      label: ms.label,
      status: STATUS_LABELS[ms.status] || 'unknown',
      targetDate: formatDate(ms.targetDate),
      pctComplete,
      ptsDone,
      ptsTotal,
      project: projectMap.get(ms.space as string) || 'Unknown'
    })
  }

  return results
}

export async function getMilestone (
  client: PlatformClient,
  name: string,
  projectFilter?: string
): Promise<MilestoneDetail | null> {
  const query: Record<string, any> = {}

  if (projectFilter) {
    const projects = await client.findAll(tracker.class.Project, {})
    const match = projects.find(
      (p) => p.identifier.toLowerCase() === projectFilter.toLowerCase()
    )
    if (match) {
      query.space = match._id
    }
  }

  const milestones = await client.findAll(tracker.class.Milestone, query)
  const lower = name.toLowerCase()
  const ms = milestones.find((m) => m.label.toLowerCase() === lower)

  if (!ms) return null

  const statusMap = await buildStatusMap(client)
  const wonIds = getWonStatusIds(statusMap)

  const projects = await client.findAll(tracker.class.Project, {})
  const project = projects.find((p) => p._id === ms.space)

  const issues = await client.findAll(tracker.class.Issue, { milestone: ms._id })
  let ptsDone = 0
  let ptsTotal = 0
  let openCount = 0
  let closedCount = 0

  for (const issue of issues) {
    const est = issue.estimation || 0
    ptsTotal += est
    if (wonIds.has(issue.status as string)) {
      ptsDone += est
      closedCount++
    } else {
      openCount++
    }
  }

  const pctComplete = ptsTotal > 0 ? Math.round((ptsDone / ptsTotal) * 100) : 0

  return {
    label: ms.label,
    status: STATUS_LABELS[ms.status] || 'unknown',
    targetDate: formatDate(ms.targetDate),
    pctComplete,
    ptsDone,
    ptsTotal,
    project: project?.identifier || 'Unknown',
    openIssues: openCount,
    closedIssues: closedCount
  }
}
