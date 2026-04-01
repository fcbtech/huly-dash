const tracker = require('@hcengineering/tracker').default
const task = require('@hcengineering/task').default
const core = require('@hcengineering/core').default
const { fetchTagMap, categorizeIssue } = require('./tags')

async function fetchVelocity (client, options = {}) {
  const days = options.days || 30
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  const allStatuses = await client.findAll(core.class.Status, {})
  const wonStatusIds = new Set(
    allStatuses
      .filter((s) => s.category === task.statusCategory.Won)
      .map((s) => s._id)
  )
  const pausedStatusId = allStatuses.find((s) => s.name === 'Paused')?._id

  const issues = await client.findAll(tracker.class.Issue, {
    isDone: true
  })

  // Use closedAt when available (GitHub PRs), fall back to modifiedOn (regular issues)
  const closedIssues = issues
    .filter((i) => wonStatusIds.has(i.status))
    .filter((i) => {
      const closeTime = i.closedAt || i.modifiedOn
      return closeTime >= cutoff
    })
    .map((i) => ({ ...i, _closeTime: i.closedAt || i.modifiedOn }))

  const tagMap = options.tagMap || await fetchTagMap(client)
  // Pause calculation is expensive (1 API call per issue). Only run with --pauses flag.
  const pauseMap = options.includePauses
    ? await fetchPauseTimes(client, closedIssues, pausedStatusId)
    : new Map()

  const weeks = groupByWeek(closedIssues, cutoff, tagMap, pauseMap)

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

async function fetchPauseTimes (client, issues, pausedStatusId) {
  const pauseMap = new Map()
  if (!pausedStatusId) return pauseMap

  for (const issue of issues) {
    const txs = await client.findAll(core.class.TxUpdateDoc, {
      objectId: issue._id
    })
    const statusTxs = txs
      .filter((tx) => tx.operations && tx.operations.status)
      .sort((a, b) => a.modifiedOn - b.modifiedOn)

    let pausedSince = null
    let totalPaused = 0

    for (const tx of statusTxs) {
      if (tx.operations.status === pausedStatusId) {
        pausedSince = tx.modifiedOn
      } else if (pausedSince != null) {
        totalPaused += tx.modifiedOn - pausedSince
        pausedSince = null
      }
    }

    if (pausedSince != null) {
      const endTime = issue.closedAt || issue._closeTime || issue.modifiedOn
      totalPaused += endTime - pausedSince
    }

    if (totalPaused > 0) {
      pauseMap.set(issue._id, totalPaused)
    }
  }

  return pauseMap
}

function groupByWeek (issues, cutoff, tagMap, pauseMap) {
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
      issuesClosed: 0,
      pausedMs: 0,
      byCategory: {}
    })
    weekStart = new Date(weekStart)
    weekStart.setDate(weekStart.getDate() + 7)
  }

  for (const issue of issues) {
    const ts = issue._closeTime || issue.closedAt || issue.modifiedOn
    for (const bucket of buckets) {
      if (ts >= bucket.start && ts <= bucket.end + 24 * 60 * 60 * 1000) {
        const est = issue.estimation || 0
        bucket.ptsClosed += est
        bucket.issuesClosed += 1
        bucket.pausedMs += pauseMap.get(issue._id) || 0

        const category = categorizeIssue(tagMap.get(issue._id))
        if (!bucket.byCategory[category]) {
          bucket.byCategory[category] = { pts: 0, count: 0 }
        }
        bucket.byCategory[category].pts += est
        bucket.byCategory[category].count += 1
        break
      }
    }
  }

  return buckets.map(({ weekLabel, ptsClosed, issuesClosed, pausedMs, byCategory }) => ({
    weekLabel,
    ptsClosed,
    issuesClosed,
    pausedDays: Math.round((pausedMs / (24 * 60 * 60 * 1000)) * 10) / 10,
    byCategory
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

function avgPtsPerDay (velocityData, days) {
  const totalPts = velocityData.reduce((sum, w) => sum + w.ptsClosed, 0)
  return days > 0 ? totalPts / days : 0
}

module.exports = { fetchVelocity, avgPtsPerDay }
