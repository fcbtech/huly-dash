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
  console.log(chalk.dim('─'.repeat(60)))

  if (data.velocity) renderVelocity(data.velocity, options)
  if (data.workload) renderWorkload(data.workload)
  if (data.milestones) renderMilestones(data.milestones)
  if (data.pipeline) renderPipeline(data.pipeline)
  if (data.breakdown) renderBreakdown(data.breakdown, options)
  if (data.quality) renderQuality(data.quality)

  console.log(chalk.dim('─'.repeat(60)))
}

function renderVelocity (weeks, options = {}) {
  const days = options.days || 30
  const totalPts = weeks.reduce((s, w) => s + w.ptsClosed, 0)
  const avgPerWeek = weeks.length > 0 ? Math.round(totalPts / weeks.length) : 0
  const totalPausedDays = weeks.reduce((s, w) => s + (w.pausedDays || 0), 0)
  const calendarDays = days
  const activeDays = Math.max(calendarDays - totalPausedDays, 1)
  const effectivePerWeek = Math.round((totalPts / activeDays) * 7)

  console.log('')
  const effectiveStr = totalPausedDays > 0
    ? ` · effective: ${effectivePerWeek} pts/active-week`
    : ''
  console.log(
    chalk.green.bold('◆ Velocity') +
    chalk.dim(`  last ${days} days · avg ${avgPerWeek} pts/week${effectiveStr}`)
  )

  const maxPts = Math.max(...weeks.map((w) => w.ptsClosed), 1)

  for (const week of weeks) {
    const barLen = Math.round((week.ptsClosed / maxPts) * BAR_WIDTH)
    const bar = chalk.blue('█'.repeat(barLen) + '░'.repeat(BAR_WIDTH - barLen))
    const pts = chalk.green(`${week.ptsClosed} pts`)
    const count = chalk.dim(`(${week.issuesClosed} issues)`)
    const pauseStr = week.pausedDays > 0
      ? chalk.yellow(` · ${week.pausedDays}d paused`)
      : ''
    const trend = week.trend === 'best'
      ? chalk.green('  ↑ best')
      : week.trend === 'low'
        ? chalk.red('  ↓ low')
        : ''
    console.log(`  ${week.weekLabel.padEnd(14)} ${bar}  ${pts}  ${count}${pauseStr}${trend}`)

    // Category sub-rows
    if (week.byCategory) {
      const maxCatPts = Math.max(
        ...Object.values(week.byCategory).map((c) => c.pts),
        1
      )
      for (const [cat, data] of Object.entries(week.byCategory)) {
        if (data.pts === 0 && data.count === 0) continue
        const catBarLen = Math.round((data.pts / maxCatPts) * BAR_WIDTH)
        const catBar = chalk.dim('█'.repeat(catBarLen) + '░'.repeat(BAR_WIDTH - catBarLen))
        const label = cat.padEnd(12)
        console.log(`    ${chalk.dim(label)} ${catBar}  ${data.pts} pts  (${data.count})`)
      }
    }
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
      chalk.dim('  unassigned: ') +
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

function renderPipeline (pipeline) {
  console.log('')
  console.log(
    chalk.cyan.bold('◆ Pipeline') +
    chalk.dim('  Dev → QA → UAT → Release')
  )

  const maxCount = Math.max(...pipeline.stages.map((s) => s.count), 1)

  for (const stage of pipeline.stages) {
    const barLen = Math.round((stage.count / maxCount) * BAR_WIDTH)
    const bar = stage.stalled > 0
      ? chalk.yellow('█'.repeat(barLen) + '░'.repeat(BAR_WIDTH - barLen))
      : chalk.cyan('█'.repeat(barLen) + '░'.repeat(BAR_WIDTH - barLen))
    const label = stage.name.padEnd(10)
    const issueWord = stage.count === 1 ? 'issue' : 'issues'
    const stalledStr = stage.stalled > 0
      ? chalk.yellow(`  ⚠ ${stage.stalled} stalled`)
      : ''
    console.log(`  ${label} ${bar}  ${stage.count} ${issueWord} · ${stage.pts} pts${stalledStr}`)
  }

  if (pipeline.bottlenecks.length > 0) {
    console.log('')
    console.log(chalk.yellow('  ⚠ Bottlenecks'))
    for (const b of pipeline.bottlenecks.slice(0, 5)) {
      console.log(
        `  ${b.identifier}  ${b.stage.padEnd(8)}  ${b.daysInStage}d  ${b.assignee}` +
        chalk.dim(`  — stuck > threshold`)
      )
    }
  }

  if (pipeline.slips.length > 0) {
    console.log('')
    console.log(chalk.yellow('  Schedule slips'))
    for (const s of pipeline.slips.slice(0, 5)) {
      console.log(
        `  ${s.identifier}  ${s.field.padEnd(8)}  +${s.slipDays}d` +
        chalk.dim(`  (expected ${s.expected}, actual ${s.actual})`)
      )
    }
  }
}

function renderBreakdown (breakdown, options = {}) {
  const days = options.days || 30

  console.log('')
  console.log(
    chalk.yellow.bold('◆ Breakdown') +
    chalk.dim('  effort by category')
  )

  renderBreakdownSection('Open (backlog)', breakdown.open)
  renderBreakdownSection(`Closed (last ${days}d)`, breakdown.closed)
}

function renderBreakdownSection (title, data) {
  const totalPts = Object.values(data).reduce((s, d) => s + d.pts, 0)
  const totalCount = Object.values(data).reduce((s, d) => s + d.count, 0)

  if (totalPts === 0 && totalCount === 0) return

  console.log('')
  console.log(chalk.dim(`  ${title.padEnd(24)} pts           count`))

  const SMALL_BAR = 14

  for (const [cat, d] of Object.entries(data)) {
    if (d.pts === 0 && d.count === 0) continue
    const pctPts = totalPts > 0 ? Math.round((d.pts / totalPts) * 100) : 0
    const pctCount = totalCount > 0 ? Math.round((d.count / totalCount) * 100) : 0

    const ptsBarLen = Math.round((pctPts / 100) * SMALL_BAR)
    const ptsBar = chalk.green('█'.repeat(ptsBarLen) + '░'.repeat(SMALL_BAR - ptsBarLen))
    const countBarLen = Math.round((pctCount / 100) * SMALL_BAR)
    const countBar = chalk.blue('█'.repeat(countBarLen) + '░'.repeat(SMALL_BAR - countBarLen))

    const label = cat.padEnd(12)
    const ptsStr = `${pctPts}%`.padStart(4)
    const ptsTotalStr = `${d.pts}pts`.padStart(6)
    const countStr = `${pctCount}%`.padStart(4)
    const countTotalStr = `${d.count}`.padStart(4)

    console.log(`  ${label} ${ptsBar} ${ptsStr} ${ptsTotalStr}   ${countBar} ${countStr} ${countTotalStr}`)
  }
}

function renderQuality (quality) {
  console.log('')
  console.log(
    chalk.red.bold('◆ Quality') +
    chalk.dim('  developer rework metrics')
  )

  if (quality.developers.length === 0) {
    console.log(chalk.dim('  No review data in this window'))
    return
  }

  console.log('')
  console.log(chalk.dim('  Developer    1st pass    bounces   bug yield      rework ratio'))

  for (const dev of quality.developers) {
    const name = dev.name.length > 10
      ? dev.name.substring(0, 10)
      : dev.name.padEnd(10)

    const BAR_5 = 5
    const passBarLen = Math.round((dev.firstPassRate / 100) * BAR_5)
    const passBar = '█'.repeat(passBarLen) + '░'.repeat(BAR_5 - passBarLen)
    const passColor = dev.firstPassRate < 80 ? chalk.red : chalk.green
    const passStr = passColor(`${dev.firstPassRate}% ${passBar}`)

    const bounceStr = `${dev.bouncebacks}`.padStart(2)
    const bugYieldStr = dev.parentIssues > 0
      ? `${dev.avgBugYield} bugs/task`
      : chalk.dim('n/a')
    const reworkStr = dev.taskPts > 0
      ? `${dev.reworkRatio}% (${dev.reworkPts}/${dev.taskPts} pts)`
      : chalk.dim('n/a')

    const flagged = dev.firstPassRate < 80 || dev.reworkRatio > 40
    const flag = flagged ? chalk.red('  ⚠') : ''

    console.log(`  ${name} ${passStr}   ${bounceStr}         ${bugYieldStr.padEnd(14)} ${reworkStr}${flag}`)
  }

  const s = quality.summary
  console.log('')
  console.log(
    chalk.dim('  Team: ') +
    `${s.teamFirstPassRate}% first-pass · ${s.teamAvgBugYield} avg bugs/task · ${s.teamReworkRatio}% rework ratio`
  )
}

module.exports = {
  renderAll,
  renderVelocity,
  renderWorkload,
  renderMilestones,
  renderPipeline,
  renderBreakdown,
  renderQuality
}
