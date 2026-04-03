import { type PlatformClient } from '@hcengineering/api-client'
import tracker, { type Issue, type Project } from '@hcengineering/tracker'
import task from '@hcengineering/task'
import { buildStatusMap, getWonStatusIds } from './statuses'
import type { ProjectRow, ProjectDetail } from '../types'

export async function listProjects (client: PlatformClient): Promise<ProjectRow[]> {
  const projects = await client.findAll(tracker.class.Project, {})

  return projects.map((p) => ({
    identifier: p.identifier,
    name: p.name,
    description: p.description || ''
  }))
}

export async function getProject (
  client: PlatformClient,
  identifier: string
): Promise<ProjectDetail | null> {
  const projects = await client.findAll(tracker.class.Project, {})
  const project = projects.find(
    (p) => p.identifier.toLowerCase() === identifier.toLowerCase()
  )

  if (!project) return null

  const statusMap = await buildStatusMap(client)
  const wonIds = getWonStatusIds(statusMap)

  const issues = await client.findAll(tracker.class.Issue, { space: project._id })
  let openCount = 0
  let closedCount = 0

  for (const issue of issues) {
    if (wonIds.has(issue.status as string)) {
      closedCount++
    } else {
      openCount++
    }
  }

  return {
    identifier: project.identifier,
    name: project.name,
    description: project.description || '',
    memberCount: project.members?.length || 0,
    openIssues: openCount,
    closedIssues: closedCount
  }
}
