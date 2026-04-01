const tracker = require('@hcengineering/tracker').default
const task = require('@hcengineering/task').default
const core = require('@hcengineering/core').default
const contact = require('@hcengineering/contact').default

const CUSTOM_FIELDS = {
  devStart: 'custom69cbdd3dae0caf5c9168a6f6',
  devEndExpected: 'custom69cbdd6fae0caf5c9168a792',
  devEndActual: 'custom69cbdd7cae0caf5c9168a796',
  qaStart: 'custom69cbddd0ae0caf5c9168a830',
  qaEndExpected: 'custom69cbdde2ae0caf5c9168a834',
  qaEndActual: 'custom69cbddf1ae0caf5c9168a838',
  uatStart: 'custom69ccee9b9cb2ec858b656bb7',
  uatEnd: 'custom69cceeac9cb2ec858b656bbb',
  releaseExpected: 'custom69cceebd9cb2ec858b656bbf',
  releaseActual: 'custom69cceed59cb2ec858b656bc4'
}

const STAGE_ORDER = ['Backlog', 'Waiting', 'In Dev', 'In QA', 'In UAT', 'Released']

const BOTTLENECK_THRESHOLDS = {
  'In Dev': 5,
  'In QA': 3,
  'In UAT': 3
}

async function fetchPipeline (client) {
  const allStatuses = await client.findAll(core.class.Status, {})
  const activeCategories = new Set([
    task.statusCategory.Active,
    task.statusCategory.ToDo
  ])
  const activeStatusIds = new Set(
    allStatuses.filter((s) => activeCategories.has(s.category)).map((s) => s._id)
  )
  const backlogStatusIds = new Set(
    allStatuses.filter((s) => s.category === task.statusCategory.UnStarted).map((s) => s._id)
  )

  const issues = await client.findAll(tracker.class.Issue, {
    isDone: { $ne: true }
  })

  const assigneeIds = [...new Set(issues.filter((i) => i.assignee).map((i) => i.assignee))]
  const persons = assigneeIds.length > 0
    ? await client.findAll(contact.class.Person, { _id: { $in: assigneeIds } })
    : []
  const nameMap = new Map(persons.map((p) => [p._id, formatName(p.name)]))

  const stages = {}
  for (const name of STAGE_ORDER) {
    stages[name] = { name, count: 0, pts: 0, stalled: 0 }
  }

  const bottlenecks = []
  const slips = []
  const now = Date.now()

  for (const issue of issues) {
    const stage = detectStage(issue, activeStatusIds, backlogStatusIds)
    if (!stages[stage]) continue

    stages[stage].count += 1
    stages[stage].pts += issue.estimation || 0

    const threshold = BOTTLENECK_THRESHOLDS[stage]
    if (threshold) {
      const stageStartDate = getStageStartDate(issue, stage)
      if (stageStartDate) {
        const daysInStage = Math.ceil((now - stageStartDate) / (24 * 60 * 60 * 1000))
        if (daysInStage > threshold) {
          stages[stage].stalled += 1
          bottlenecks.push({
            identifier: issue.identifier,
            stage,
            daysInStage,
            assignee: nameMap.get(issue.assignee) || 'Unassigned'
          })
        }
      }
    }

    checkSlip(issue, 'Dev End', CUSTOM_FIELDS.devEndExpected, CUSTOM_FIELDS.devEndActual, slips)
    checkSlip(issue, 'QA End', CUSTOM_FIELDS.qaEndExpected, CUSTOM_FIELDS.qaEndActual, slips)
  }

  bottlenecks.sort((a, b) => b.daysInStage - a.daysInStage)

  return {
    stages: STAGE_ORDER.map((name) => stages[name]),
    bottlenecks,
    slips
  }
}

function detectStage (issue, activeStatusIds, backlogStatusIds) {
  if (issue[CUSTOM_FIELDS.releaseActual]) return 'Released'
  if (issue[CUSTOM_FIELDS.uatStart]) return 'In UAT'
  if (issue[CUSTOM_FIELDS.qaStart]) return 'In QA'
  if (issue[CUSTOM_FIELDS.devStart]) return 'In Dev'

  if (activeStatusIds.has(issue.status)) return 'Waiting'
  if (backlogStatusIds.has(issue.status)) return 'Backlog'
  return 'Backlog'
}

function getStageStartDate (issue, stage) {
  switch (stage) {
    case 'In Dev': return issue[CUSTOM_FIELDS.devStart]
    case 'In QA': return issue[CUSTOM_FIELDS.qaStart]
    case 'In UAT': return issue[CUSTOM_FIELDS.uatStart]
    default: return null
  }
}

function checkSlip (issue, fieldLabel, expectedField, actualField, slips) {
  const expected = issue[expectedField]
  const actual = issue[actualField]
  if (expected && actual) {
    const slipDays = Math.ceil((actual - expected) / (24 * 60 * 60 * 1000))
    if (slipDays > 0) {
      slips.push({
        identifier: issue.identifier,
        field: fieldLabel,
        expected: new Date(expected).toISOString().split('T')[0],
        actual: new Date(actual).toISOString().split('T')[0],
        slipDays
      })
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

module.exports = { fetchPipeline, CUSTOM_FIELDS }
