const tracker = require('@hcengineering/tracker').default
const task = require('@hcengineering/task').default
const core = require('@hcengineering/core').default
const { fetchTagMap, categorizeIssue, CATEGORY_PRIORITY } = require('./tags')

const ALL_CATEGORIES = [...CATEGORY_PRIORITY, 'other']

async function fetchBreakdown (client, options = {}) {
  const days = options.days || 30
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  const allStatuses = await client.findAll(core.class.Status, {})
  const wonStatusIds = new Set(
    allStatuses
      .filter((s) => s.category === task.statusCategory.Won)
      .map((s) => s._id)
  )

  const tagMap = options.tagMap || await fetchTagMap(client)

  const openIssues = await client.findAll(tracker.class.Issue, {
    isDone: { $ne: true }
  })

  const allIssues = await client.findAll(tracker.class.Issue, {
    isDone: true
  })
  const closedIssues = allIssues.filter(
    (i) => wonStatusIds.has(i.status) && i.closedAt && i.closedAt >= cutoff
  )

  return {
    open: buildCategoryTotals(openIssues, tagMap),
    closed: buildCategoryTotals(closedIssues, tagMap)
  }
}

function buildCategoryTotals (issues, tagMap) {
  const totals = {}
  for (const cat of ALL_CATEGORIES) {
    totals[cat] = { pts: 0, count: 0 }
  }

  for (const issue of issues) {
    const category = categorizeIssue(tagMap.get(issue._id))
    totals[category].pts += issue.estimation || 0
    totals[category].count += 1
  }

  return totals
}

module.exports = { fetchBreakdown }
