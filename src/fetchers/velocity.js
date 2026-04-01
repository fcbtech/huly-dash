const tracker = require('@hcengineering/tracker').default
const task = require('@hcengineering/task').default
const core = require('@hcengineering/core').default

/**
 * Fetch velocity data: issues closed within the window, grouped by week, summed by estimation.
 * @param {object} client - Huly PlatformClient
 * @param {object} options
 * @param {number} options.days - lookback window in days (default 30)
 * @returns {Promise<Array<{weekLabel: string, ptsClosed: number, issuesClosed: number, trend: string|null}>>}
 */
async function fetchVelocity (client, options = {}) {
  const days = options.days || 30
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  // Get all statuses to find which ones are in the "Won" (completed) category
  const allStatuses = await client.findAll(core.class.Status, {})
  const wonStatusIds = new Set(
    allStatuses
      .filter((s) => s.category === task.statusCategory.Won)
      .map((s) => s._id)
  )

  // Fetch issues that are done and modified within the window
  const issues = await client.findAll(tracker.class.Issue, {
    isDone: true,
    modifiedOn: { $gte: cutoff }
  })

  // Filter to only issues whose status is actually in Won category
  const closedIssues = issues.filter((i) => wonStatusIds.has(i.status))

  // Group by calendar week
  const weeks = groupByWeek(closedIssues, cutoff, days)

  // Compute trend markers
  const maxPts = Math.max(...weeks.map((w) => w.ptsClosed), 0)
  const minPts = Math.min(...weeks.map((w) => w.ptsClosed), Infinity)

  return weeks.map((w) => ({
    ...w,
    trend: w.ptsClosed === maxPts && maxPts > 0
      ? 'best'
      : w.ptsClosed === minPts && weeks.length > 1
        ? 'low'
        : null
  }))
}

function groupByWeek (issues, cutoff, days) {
  // Build week buckets from cutoff to now
  const buckets = []
  const now = Date.now()
  let weekStart = getMonday(new Date(cutoff))

  while (weekStart.getTime() < now) {
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    buckets.push({
      start: weekStart.getTime(),
      end: Math.min(weekEnd.getTime(), now),
      weekLabel: formatWeekLabel(weekStart, weekEnd),
      ptsClosed: 0,
      issuesClosed: 0
    })
    weekStart = new Date(weekStart)
    weekStart.setDate(weekStart.getDate() + 7)
  }

  // Assign issues to buckets
  for (const issue of issues) {
    const ts = issue.modifiedOn
    for (const bucket of buckets) {
      if (ts >= bucket.start && ts <= bucket.end + 24 * 60 * 60 * 1000) {
        bucket.ptsClosed += issue.estimation || 0
        bucket.issuesClosed += 1
        break
      }
    }
  }

  return buckets.map(({ weekLabel, ptsClosed, issuesClosed }) => ({
    weekLabel,
    ptsClosed,
    issuesClosed
  }))
}

function getMonday (date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekLabel (start, end) {
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)}–${fmt(end)}`
}

/**
 * Compute average points per day from velocity data.
 * @param {Array} velocityData - output of fetchVelocity
 * @param {number} days - window size
 * @returns {number}
 */
function avgPtsPerDay (velocityData, days) {
  const totalPts = velocityData.reduce((sum, w) => sum + w.ptsClosed, 0)
  return days > 0 ? totalPts / days : 0
}

module.exports = { fetchVelocity, avgPtsPerDay }
