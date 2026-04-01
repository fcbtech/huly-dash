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

module.exports = { renderAll, renderVelocity, renderWorkload, renderMilestones }
