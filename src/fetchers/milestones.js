const tracker = require('@hcengineering/tracker').default
const task = require('@hcengineering/task').default
const core = require('@hcengineering/core').default
const { fetchVelocity, avgPtsPerDay } = require('./velocity')

/**
 * Fetch milestone health data.
 * @param {object} client - Huly PlatformClient
 * @param {object} options
 * @param {number} [options.avgPtsPerDayOverride] - pre-computed avg pts/day (from velocity fetcher)
 * @returns {Promise<Array<{label: string, pctComplete: number, ptsDone: number, ptsTotal: number, daysLeft: number, ptsPerDayRequired: number, atRisk: boolean}>>}
 */
async function fetchMilestones (client, options = {}) {
  // Compute avg velocity if not provided
  let velocityAvg = options.avgPtsPerDayOverride
  if (velocityAvg == null) {
    const velocityData = await fetchVelocity(client, { days: 30 })
    velocityAvg = avgPtsPerDay(velocityData, 30)
  }

  // Get completed status IDs
  const allStatuses = await client.findAll(core.class.Status, {})
  const wonStatusIds = new Set(
    allStatuses
      .filter((s) => s.category === task.statusCategory.Won)
      .map((s) => s._id)
  )

  // Fetch all milestones (exclude completed/canceled)
  const milestones = await client.findAll(tracker.class.Milestone, {
    status: { $in: [0, 1] } // Planned or InProgress
  })

  const results = []

  for (const ms of milestones) {
    // Fetch all issues in this milestone
    const issues = await client.findAll(tracker.class.Issue, {
      milestone: ms._id
    })

    let ptsDone = 0
    let ptsTotal = 0

    for (const issue of issues) {
      const est = issue.estimation || 0
      ptsTotal += est
      if (wonStatusIds.has(issue.status)) {
        ptsDone += est
      }
    }

    const ptsRemaining = ptsTotal - ptsDone
    const now = Date.now()
    const daysLeft = Math.max(0, Math.ceil((ms.targetDate - now) / (24 * 60 * 60 * 1000)))
    const pctComplete = ptsTotal > 0 ? Math.round((ptsDone / ptsTotal) * 100) : 0
    const ptsPerDayRequired = daysLeft > 0 ? ptsRemaining / daysLeft : Infinity

    results.push({
      label: ms.label,
      pctComplete,
      ptsDone,
      ptsTotal,
      daysLeft,
      ptsPerDayRequired: Math.round(ptsPerDayRequired * 10) / 10,
      atRisk: ptsPerDayRequired > velocityAvg
    })
  }

  // Sort by days left ascending (most urgent first)
  results.sort((a, b) => a.daysLeft - b.daysLeft)

  return results
}

module.exports = { fetchMilestones }
