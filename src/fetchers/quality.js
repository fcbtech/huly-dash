const tracker = require('@hcengineering/tracker').default
const task = require('@hcengineering/task').default
const core = require('@hcengineering/core').default
const contact = require('@hcengineering/contact').default
const { fetchTagMap, isBugTag } = require('./tags')

async function fetchQuality (client, options = {}) {
  const days = options.days || 30
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  const allStatuses = await client.findAll(core.class.Status, {})
  const statusMap = new Map(allStatuses.map((s) => [s._id, s.name]))
  const inReviewIds = new Set(
    allStatuses.filter((s) => s.name === 'In Review').map((s) => s._id)
  )
  const doneIds = new Set(
    allStatuses
      .filter((s) => s.category === task.statusCategory.Won)
      .map((s) => s._id)
  )
  const inProgressIds = new Set(
    allStatuses.filter((s) => s.name === 'In Progress').map((s) => s._id)
  )
  const todoIds = new Set(
    allStatuses.filter((s) => s.name === 'Todo').map((s) => s._id)
  )

  const tagMap = options.tagMap || await fetchTagMap(client)

  const persons = await client.findAll(contact.class.Person, {})
  const nameMap = new Map(persons.map((p) => [p._id, formatName(p.name)]))

  const issues = await client.findAll(tracker.class.Issue, {
    modifiedOn: { $gte: cutoff }
  })

  const devStats = new Map()

  function getDevEntry (assigneeId) {
    if (!devStats.has(assigneeId)) {
      devStats.set(assigneeId, {
        name: nameMap.get(assigneeId) || 'Unknown',
        issuesReviewed: 0,
        bouncebacks: 0,
        parentIssues: 0,
        taskPts: 0,
        qaBugsSpawned: 0,
        reworkPts: 0
      })
    }
    return devStats.get(assigneeId)
  }

  // --- Metric 1: Bounceback rate ---
  for (const issue of issues) {
    if (!issue.assignee) continue

    const txs = await client.findAll(core.class.TxUpdateDoc, {
      objectId: issue._id
    })
    const statusTxs = txs
      .filter((tx) => tx.operations && tx.operations.status)
      .sort((a, b) => a.modifiedOn - b.modifiedOn)

    const reachedReview = statusTxs.some(
      (tx) => (inReviewIds.has(tx.operations.status) || doneIds.has(tx.operations.status)) &&
        tx.modifiedOn >= cutoff
    )
    if (!reachedReview) continue

    const entry = getDevEntry(issue.assignee)
    entry.issuesReviewed += 1

    for (let i = 1; i < statusTxs.length; i++) {
      const prevStatus = statusTxs[i - 1].operations.status
      const currStatus = statusTxs[i].operations.status
      const prevIsReviewOrDone = inReviewIds.has(prevStatus) || doneIds.has(prevStatus)
      const currIsBackward = inProgressIds.has(currStatus) || todoIds.has(currStatus)

      if (prevIsReviewOrDone && currIsBackward && statusTxs[i].modifiedOn >= cutoff) {
        entry.bouncebacks += 1
      }
    }
  }

  // --- Metric 2: QA bug yield ---
  const parentIssues = issues.filter(
    (i) => i.assignee && i.subIssues > 0 && i.attachedTo === 'tracker:ids:NoParent'
  )

  for (const parent of parentIssues) {
    const txs = await client.findAll(core.class.TxUpdateDoc, {
      objectId: parent._id
    })
    const statusTxs = txs
      .filter((tx) => tx.operations && tx.operations.status)
      .sort((a, b) => a.modifiedOn - b.modifiedOn)

    const firstReviewTx = statusTxs.find(
      (tx) => inReviewIds.has(tx.operations.status) || doneIds.has(tx.operations.status)
    )
    if (!firstReviewTx) continue

    const reviewDate = firstReviewTx.modifiedOn

    const children = await client.findAll(tracker.class.Issue, {
      attachedTo: parent._id
    })

    const bugChildren = children.filter(
      (child) => child.createdOn >= reviewDate && isBugTag(tagMap.get(child._id))
    )

    if (parent.assignee) {
      const entry = getDevEntry(parent.assignee)
      entry.parentIssues += 1
      entry.taskPts += parent.estimation || 0
      entry.qaBugsSpawned += bugChildren.length
      entry.reworkPts += bugChildren.reduce((sum, b) => sum + (b.estimation || 0), 0)
    }
  }

  const developers = [...devStats.values()]
    .filter((d) => d.issuesReviewed > 0 || d.parentIssues > 0)
    .map((d) => ({
      ...d,
      firstPassRate: d.issuesReviewed > 0
        ? Math.round(((d.issuesReviewed - d.bouncebacks) / d.issuesReviewed) * 100)
        : 100,
      avgBugYield: d.parentIssues > 0
        ? Math.round((d.qaBugsSpawned / d.parentIssues) * 10) / 10
        : 0,
      reworkRatio: d.taskPts > 0
        ? Math.round((d.reworkPts / d.taskPts) * 100)
        : 0
    }))
    .sort((a, b) => a.firstPassRate - b.firstPassRate)

  const totalReviewed = developers.reduce((s, d) => s + d.issuesReviewed, 0)
  const totalBounces = developers.reduce((s, d) => s + d.bouncebacks, 0)
  const totalParents = developers.reduce((s, d) => s + d.parentIssues, 0)
  const totalBugs = developers.reduce((s, d) => s + d.qaBugsSpawned, 0)
  const totalTaskPts = developers.reduce((s, d) => s + d.taskPts, 0)
  const totalReworkPts = developers.reduce((s, d) => s + d.reworkPts, 0)

  return {
    developers,
    summary: {
      teamFirstPassRate: totalReviewed > 0
        ? Math.round(((totalReviewed - totalBounces) / totalReviewed) * 100)
        : 100,
      teamAvgBugYield: totalParents > 0
        ? Math.round((totalBugs / totalParents) * 10) / 10
        : 0,
      teamReworkRatio: totalTaskPts > 0
        ? Math.round((totalReworkPts / totalTaskPts) * 100)
        : 0,
      totalBouncebacks: totalBounces,
      totalQaBugs: totalBugs
    }
  }
}

function formatName (name) {
  if (!name) return 'Unknown'
  if (name.includes(',')) {
    const [last, first] = name.split(',')
    return `${first} ${last}`.trim()
  }
  return name
}

module.exports = { fetchQuality }
