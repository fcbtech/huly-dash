const tracker = require('@hcengineering/tracker').default
const task = require('@hcengineering/task').default
const core = require('@hcengineering/core').default
const contact = require('@hcengineering/contact').default

/**
 * Fetch workload data: open issues per assignee, summed by estimation.
 * @param {object} client - Huly PlatformClient
 * @returns {Promise<{members: Array, unassigned: {pts: number, count: number}}>}
 */
async function fetchWorkload (client) {
  // Get completed status IDs so we can exclude them
  const allStatuses = await client.findAll(core.class.Status, {})
  const doneStatusIds = new Set(
    allStatuses
      .filter((s) => s.category === task.statusCategory.Won || s.category === task.statusCategory.Lost)
      .map((s) => s._id)
  )

  // Fetch all issues that are not done
  const issues = await client.findAll(tracker.class.Issue, {
    isDone: { $ne: true }
  })

  const openIssues = issues.filter((i) => !doneStatusIds.has(i.status))

  // Resolve person names for all unique assignees
  const assigneeIds = [...new Set(openIssues.filter((i) => i.assignee).map((i) => i.assignee))]
  const persons = assigneeIds.length > 0
    ? await client.findAll(contact.class.Person, { _id: { $in: assigneeIds } })
    : []
  const nameMap = new Map(persons.map((p) => [p._id, p.name]))

  // Group by assignee
  const byAssignee = new Map()
  let unassignedPts = 0
  let unassignedCount = 0
  const now = Date.now()

  for (const issue of openIssues) {
    if (!issue.assignee) {
      unassignedPts += issue.estimation || 0
      unassignedCount += 1
      continue
    }

    if (!byAssignee.has(issue.assignee)) {
      byAssignee.set(issue.assignee, {
        name: formatName(nameMap.get(issue.assignee) || 'Unknown'),
        ptsOpen: 0,
        issueCount: 0,
        urgent: 0,
        overdue: 0
      })
    }

    const entry = byAssignee.get(issue.assignee)
    entry.ptsOpen += issue.estimation || 0
    entry.issueCount += 1

    // IssuePriority.Urgent = 1, IssuePriority.High = 2
    if (issue.priority <= 2 && issue.priority > 0) {
      entry.urgent += 1
    }

    if (issue.dueDate && issue.dueDate < now) {
      entry.overdue += 1
    }
  }

  const members = [...byAssignee.values()].sort((a, b) => b.ptsOpen - a.ptsOpen)

  return {
    members,
    unassigned: { pts: unassignedPts, count: unassignedCount }
  }
}

/**
 * Format Huly "LastName,FirstName" to "FirstName LastName" or just return as-is.
 */
function formatName (name) {
  if (!name) return 'Unknown'
  if (name.includes(',')) {
    const [last, first] = name.split(',')
    return `${first} ${last}`.trim()
  }
  return name
}

module.exports = { fetchWorkload }
