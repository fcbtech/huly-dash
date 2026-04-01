# Huly Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a terminal CLI tool (`huly-dash`) that reports velocity, workload, and milestone health from a Huly workspace, driven by story points.

**Architecture:** Two-layer design — fetchers query the Huly API and return plain JS objects; renderers consume those objects and format for terminal output. The CLI entry point (`huly-dash.js`) wires the two layers together via `commander`.

**Tech Stack:** Node.js (CommonJS), `@hcengineering/api-client`, `@hcengineering/tracker`, `@hcengineering/contact`, `commander`, `chalk`, `cli-table3`, `dotenv`

---

## File Structure

```
huly-dash.js              — CLI entry point (commander commands, wires fetchers → renderer)
src/
  connection.js           — connect to Huly, return client, expose close()
  fetchers/
    velocity.js           — closed issues grouped by week, summed by estimation
    workload.js           — open issues per assignee, summed by estimation
    milestones.js         — milestone % complete by pts, burn rate, at-risk flag
  renderers/
    terminal.js           — chalk + bar charts, colour-coded sections
.env.example              — already exists, credential template
package.json              — already exists, add new deps + bin entry
```

---

### Task 1: Install Dependencies and Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new dependencies**

Run:
```bash
npm install @hcengineering/tracker @hcengineering/task @hcengineering/contact commander chalk cli-table3 dotenv
```

Note: `@hcengineering/tracker` also has `workspace:` dependency issues. Add these overrides to `package.json` before installing:
```json
"@hcengineering/contact": "0.7.382",
"@hcengineering/task": "0.7.382",
"@hcengineering/tracker": "0.7.382",
"@hcengineering/ui": "0.7.382",
"@hcengineering/view": "0.7.382",
"@hcengineering/chunter": "0.7.382",
"@hcengineering/attachment": "0.7.382",
"@hcengineering/time": "0.7.382",
"@hcengineering/tags": "0.7.382",
"@hcengineering/preference": "0.7.382",
"@hcengineering/notification": "0.7.382",
"@hcengineering/rank": "0.7.382"
```

If further transitive `workspace:` errors appear, add those packages at `0.7.382` to overrides too and re-run `npm install`.

- [ ] **Step 2: Add bin entry to package.json**

Add the `bin` field so the CLI can be run as `huly-dash` after `npm link`:

```json
"bin": {
  "huly-dash": "./huly-dash.js"
}
```

- [ ] **Step 3: Verify install**

Run:
```bash
node -e "require('@hcengineering/tracker'); require('commander'); require('chalk'); require('cli-table3'); require('dotenv'); console.log('All deps OK')"
```

Expected: `All deps OK`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add huly-dash dependencies and bin entry"
```

---

### Task 2: Connection Module

**Files:**
- Create: `src/connection.js`

- [ ] **Step 1: Write src/connection.js**

```js
const { connect } = require('@hcengineering/api-client')
require('dotenv').config()

async function createConnection (options = {}) {
  const url = options.url || process.env.HULY_URL || 'https://huly.app'
  const workspace = options.workspace || process.env.HULY_WORKSPACE
  const token = process.env.HULY_TOKEN
  const email = process.env.HULY_EMAIL
  const password = process.env.HULY_PASSWORD

  if (!workspace) {
    throw new Error('Missing HULY_WORKSPACE. Set it in .env or pass --workspace.')
  }

  const authOptions = token
    ? { token, workspace }
    : { email, password, workspace }

  if (!token && (!email || !password)) {
    throw new Error('Missing credentials. Set HULY_TOKEN or HULY_EMAIL + HULY_PASSWORD in .env.')
  }

  const client = await connect(url, authOptions)
  return client
}

module.exports = { createConnection }
```

- [ ] **Step 2: Smoke-test connection module loads**

Run:
```bash
node -e "const { createConnection } = require('./src/connection'); console.log('connection module OK')"
```

Expected: `connection module OK`

- [ ] **Step 3: Commit**

```bash
git add src/connection.js
git commit -m "feat: add Huly connection module"
```

---

### Task 3: Velocity Fetcher

**Files:**
- Create: `src/fetchers/velocity.js`

- [ ] **Step 1: Write src/fetchers/velocity.js**

```js
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
```

- [ ] **Step 2: Smoke-test module loads**

Run:
```bash
node -e "const { fetchVelocity, avgPtsPerDay } = require('./src/fetchers/velocity'); console.log('velocity module OK')"
```

Expected: `velocity module OK`

- [ ] **Step 3: Commit**

```bash
git add src/fetchers/velocity.js
git commit -m "feat: add velocity fetcher — closed issues by week, summed by story points"
```

---

### Task 4: Workload Fetcher

**Files:**
- Create: `src/fetchers/workload.js`

- [ ] **Step 1: Write src/fetchers/workload.js**

```js
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
```

- [ ] **Step 2: Smoke-test module loads**

Run:
```bash
node -e "const { fetchWorkload } = require('./src/fetchers/workload'); console.log('workload module OK')"
```

Expected: `workload module OK`

- [ ] **Step 3: Commit**

```bash
git add src/fetchers/workload.js
git commit -m "feat: add workload fetcher — open issue pts per assignee"
```

---

### Task 5: Milestones Fetcher

**Files:**
- Create: `src/fetchers/milestones.js`

- [ ] **Step 1: Write src/fetchers/milestones.js**

```js
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
```

- [ ] **Step 2: Smoke-test module loads**

Run:
```bash
node -e "const { fetchMilestones } = require('./src/fetchers/milestones'); console.log('milestones module OK')"
```

Expected: `milestones module OK`

- [ ] **Step 3: Commit**

```bash
git add src/fetchers/milestones.js
git commit -m "feat: add milestones fetcher — progress by pts, burn rate, at-risk flag"
```

---

### Task 6: Terminal Renderer

**Files:**
- Create: `src/renderers/terminal.js`

- [ ] **Step 1: Write src/renderers/terminal.js**

```js
const chalk = require('chalk')

const BAR_WIDTH = 20

/**
 * Render all three sections to terminal.
 * @param {object} data
 * @param {Array} [data.velocity] - output of fetchVelocity
 * @param {object} [data.workload] - output of fetchWorkload
 * @param {Array} [data.milestones] - output of fetchMilestones
 * @param {object} options
 * @param {number} [options.days] - velocity window
 */
function renderAll (data, options = {}) {
  const workspace = options.workspace || process.env.HULY_WORKSPACE || 'unknown'
  const date = new Date().toISOString().split('T')[0]

  console.log(chalk.dim(`huly-dash all  ·  workspace: ${workspace}  ·  ${date}`))
  console.log(chalk.dim('─'.repeat(52)))

  if (data.velocity) {
    renderVelocity(data.velocity, options)
  }
  if (data.workload) {
    renderWorkload(data.workload)
  }
  if (data.milestones) {
    renderMilestones(data.milestones)
  }

  console.log(chalk.dim('─'.repeat(52)))
}

function renderVelocity (weeks, options = {}) {
  const days = options.days || 30
  const totalPts = weeks.reduce((s, w) => s + w.ptsClosed, 0)
  const avgPerWeek = weeks.length > 0 ? Math.round(totalPts / weeks.length) : 0

  console.log('')
  console.log(
    chalk.green.bold('◆ Velocity') +
    chalk.dim(`  last ${days} days · avg ${avgPerWeek} pts/week`)
  )

  const maxPts = Math.max(...weeks.map((w) => w.ptsClosed), 1)

  for (const week of weeks) {
    const barLen = Math.round((week.ptsClosed / maxPts) * BAR_WIDTH)
    const bar = chalk.blue('█'.repeat(barLen) + '░'.repeat(BAR_WIDTH - barLen))
    const pts = chalk.green(`${week.ptsClosed} pts`)
    const count = chalk.dim(`(${week.issuesClosed} issues)`)
    const trend = week.trend === 'best'
      ? chalk.green('  ↑ best')
      : week.trend === 'low'
        ? chalk.red('  ↓ low')
        : ''
    console.log(`  ${week.weekLabel.padEnd(14)} ${bar}  ${pts}  ${count}${trend}`)
  }
}

function renderWorkload (workload) {
  console.log('')
  console.log(
    chalk.blue.bold('◆ Workload') +
    chalk.dim('  open issues · by story points')
  )

  const maxPts = Math.max(
    ...workload.members.map((m) => m.ptsOpen),
    workload.unassigned.pts,
    1
  )
  const avgPts = workload.members.length > 0
    ? workload.members.reduce((s, m) => s + m.ptsOpen, 0) / workload.members.length
    : 0

  for (const member of workload.members) {
    const barLen = Math.round((member.ptsOpen / maxPts) * BAR_WIDTH)
    const overloaded = member.ptsOpen > avgPts * 2
    const barColor = overloaded ? chalk.red : chalk.green
    const bar = barColor('█'.repeat(barLen) + '░'.repeat(BAR_WIDTH - barLen))
    const pts = overloaded
      ? chalk.yellow(`${member.ptsOpen} pts`)
      : chalk.green(`${member.ptsOpen} pts`)
    const count = chalk.dim(`(${member.issueCount} issues)`)

    const flags = []
    if (overloaded) flags.push(chalk.red('⚠ overloaded'))
    if (member.urgent > 0) flags.push(chalk.red(`${member.urgent} urgent`))
    if (member.overdue > 0) flags.push(chalk.red(`${member.overdue} overdue`))
    const flagStr = flags.length > 0 ? '  ' + flags.join(' · ') : ''

    const name = member.name.length > 8
      ? member.name.substring(0, 8)
      : member.name.padEnd(8)
    console.log(`  ${name} ${bar}  ${pts}  ${count}${flagStr}`)
  }

  if (workload.unassigned.count > 0) {
    console.log(
      chalk.dim(`  unassigned: `) +
      chalk.yellow(`${workload.unassigned.pts} pts · ${workload.unassigned.count} issues`) +
      chalk.dim('  ←  needs triage')
    )
  }
}

function renderMilestones (milestones) {
  console.log('')
  console.log(
    chalk.magenta.bold('◆ Milestones') +
    chalk.dim('  by story points · remaining effort')
  )

  for (const ms of milestones) {
    const barLen = Math.round((ms.pctComplete / 100) * BAR_WIDTH)
    const barColor = ms.atRisk ? chalk.red : chalk.green
    const bar = barColor('█'.repeat(barLen) + '░'.repeat(BAR_WIDTH - barLen))
    const pct = `${ms.pctComplete}%`
    const detail = chalk.dim(`${ms.ptsDone}/${ms.ptsTotal} pts done`)
    const daysStr = ms.atRisk
      ? chalk.red(`${ms.daysLeft}d left`)
      : `${ms.daysLeft}d left`

    const label = ms.label.length > 14
      ? ms.label.substring(0, 14)
      : ms.label.padEnd(14)
    console.log(`  ${label} ${bar}  ${pct}  ${detail}  · ${daysStr}`)

    const ptsRemaining = ms.ptsTotal - ms.ptsDone
    const burnInfo = ms.daysLeft > 0
      ? `remaining: ${ptsRemaining} pts · ~${ms.ptsPerDayRequired} pts/day needed`
      : `remaining: ${ptsRemaining} pts · past deadline`
    const burnColor = ms.atRisk ? chalk.red : chalk.dim
    const statusIcon = ms.atRisk ? ' · at risk ⚠' : ' · on track ✓'
    console.log(`  ${' '.repeat(14)} ${burnColor(burnInfo + statusIcon)}`)
  }
}

module.exports = { renderAll, renderVelocity, renderWorkload, renderMilestones }
```

- [ ] **Step 2: Smoke-test module loads**

Run:
```bash
node -e "const r = require('./src/renderers/terminal'); console.log('renderer OK, exports:', Object.keys(r).join(', '))"
```

Expected: `renderer OK, exports: renderAll, renderVelocity, renderWorkload, renderMilestones`

- [ ] **Step 3: Commit**

```bash
git add src/renderers/terminal.js
git commit -m "feat: add terminal renderer — bar charts with colour-coded story points"
```

---

### Task 7: CLI Entry Point

**Files:**
- Create: `huly-dash.js`
- Remove: `index.js` (replaced by huly-dash.js)

- [ ] **Step 1: Write huly-dash.js**

```js
#!/usr/bin/env node

const { program } = require('commander')
const { createConnection } = require('./src/connection')
const { fetchVelocity, avgPtsPerDay } = require('./src/fetchers/velocity')
const { fetchWorkload } = require('./src/fetchers/workload')
const { fetchMilestones } = require('./src/fetchers/milestones')
const { renderAll, renderVelocity, renderWorkload, renderMilestones } = require('./src/renderers/terminal')

program
  .name('huly-dash')
  .description('Analytics dashboard for Huly workspaces')
  .option('--url <url>', 'Huly instance URL (overrides HULY_URL)')
  .option('--workspace <name>', 'Workspace name (overrides HULY_WORKSPACE)')

program
  .command('velocity')
  .description('Show issue velocity (story points closed per week)')
  .option('--days <n>', 'Lookback window in days', '30')
  .action(async (opts) => {
    const client = await connect(program.opts())
    try {
      const data = await fetchVelocity(client, { days: parseInt(opts.days, 10) })
      renderVelocity(data, { days: parseInt(opts.days, 10), workspace: resolveWorkspace(program.opts()) })
    } finally {
      await client.close()
    }
  })

program
  .command('workload')
  .description('Show open issue workload per team member')
  .action(async () => {
    const client = await connect(program.opts())
    try {
      const data = await fetchWorkload(client)
      renderWorkload(data)
    } finally {
      await client.close()
    }
  })

program
  .command('milestones')
  .description('Show milestone progress and burn rate')
  .action(async () => {
    const client = await connect(program.opts())
    try {
      const data = await fetchMilestones(client)
      renderMilestones(data)
    } finally {
      await client.close()
    }
  })

program
  .command('all')
  .description('Show all dashboards (velocity + workload + milestones)')
  .option('--days <n>', 'Lookback window for velocity', '30')
  .action(async (opts) => {
    const days = parseInt(opts.days, 10)
    const client = await connect(program.opts())
    try {
      const velocity = await fetchVelocity(client, { days })
      const workload = await fetchWorkload(client)
      const velocityAvg = avgPtsPerDay(velocity, days)
      const milestones = await fetchMilestones(client, { avgPtsPerDayOverride: velocityAvg })
      renderAll(
        { velocity, workload, milestones },
        { days, workspace: resolveWorkspace(program.opts()) }
      )
    } finally {
      await client.close()
    }
  })

async function connect (opts) {
  return createConnection({
    url: opts.url,
    workspace: opts.workspace
  })
}

function resolveWorkspace (opts) {
  return opts.workspace || process.env.HULY_WORKSPACE || 'unknown'
}

program.parseAsync().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
```

- [ ] **Step 2: Make the script executable**

Run:
```bash
chmod +x huly-dash.js
```

- [ ] **Step 3: Delete the old index.js**

Run:
```bash
rm index.js
```

- [ ] **Step 4: Verify CLI help output**

Run:
```bash
node huly-dash.js --help
```

Expected output should show: `huly-dash`, the four commands (`velocity`, `workload`, `milestones`, `all`), and the global `--url` / `--workspace` options.

- [ ] **Step 5: Commit**

```bash
git add huly-dash.js
git rm index.js
git commit -m "feat: add huly-dash CLI entry point with velocity/workload/milestones/all commands"
```

---

### Task 8: End-to-End Smoke Test

**Files:**
- None (manual verification)

- [ ] **Step 1: Verify .env is configured**

Check that `.env` contains valid credentials:
```bash
cat .env
```

Should have `HULY_URL`, `HULY_WORKSPACE`, and either `HULY_TOKEN` or `HULY_EMAIL`+`HULY_PASSWORD` set.

- [ ] **Step 2: Run `huly-dash all`**

```bash
node huly-dash.js all
```

Expected: connected output showing Velocity, Workload, and Milestones sections with real data from the workspace. If the workspace has no issues, the sections will be empty but should not error.

- [ ] **Step 3: Run individual commands**

```bash
node huly-dash.js velocity --days 14
node huly-dash.js workload
node huly-dash.js milestones
```

Each should produce its own section of output without errors.

- [ ] **Step 4: Test error case — missing credentials**

```bash
HULY_WORKSPACE= node huly-dash.js all
```

Expected: error message `Missing HULY_WORKSPACE. Set it in .env or pass --workspace.`

- [ ] **Step 5: Link globally (optional)**

```bash
npm link
huly-dash all
```

Expected: same output as `node huly-dash.js all`

- [ ] **Step 6: Commit any fixes from smoke test**

If any issues were discovered and fixed during smoke testing, commit those fixes:

```bash
git add -A
git commit -m "fix: address issues found in end-to-end smoke test"
```

Only create this commit if there were actual changes to commit.
