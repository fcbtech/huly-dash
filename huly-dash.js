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
