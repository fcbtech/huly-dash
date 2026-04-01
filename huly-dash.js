#!/usr/bin/env node

const { program } = require('commander')
const { createConnection } = require('./src/connection')
const { fetchVelocity, avgPtsPerDay } = require('./src/fetchers/velocity')
const { fetchWorkload } = require('./src/fetchers/workload')
const { fetchMilestones } = require('./src/fetchers/milestones')
const { fetchPipeline } = require('./src/fetchers/pipeline')
const { fetchBreakdown } = require('./src/fetchers/breakdown')
const { fetchQuality } = require('./src/fetchers/quality')
const { fetchTagMap } = require('./src/fetchers/tags')
const {
  renderAll, renderVelocity, renderWorkload, renderMilestones,
  renderPipeline, renderBreakdown, renderQuality
} = require('./src/renderers/terminal')

program
  .name('huly-dash')
  .description('Analytics dashboard for Huly workspaces')
  .option('--url <url>', 'Huly instance URL (overrides HULY_URL)')
  .option('--workspace <name>', 'Workspace name (overrides HULY_WORKSPACE)')

program
  .command('velocity')
  .description('Show issue velocity (story points closed per week)')
  .option('--days <n>', 'Lookback window in days', '30')
  .option('--pauses', 'Include pause-aware effective velocity (slower)')
  .action(async (opts) => {
    const client = await connect(program.opts())
    try {
      const data = await fetchVelocity(client, { days: parseInt(opts.days, 10), includePauses: opts.pauses })
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
  .command('pipeline')
  .description('Show issue pipeline (Dev → QA → UAT → Release)')
  .action(async () => {
    const client = await connect(program.opts())
    try {
      const data = await fetchPipeline(client)
      renderPipeline(data)
    } finally {
      await client.close()
    }
  })

program
  .command('breakdown')
  .description('Show effort allocation by issue category')
  .option('--days <n>', 'Lookback window for closed section', '30')
  .action(async (opts) => {
    const client = await connect(program.opts())
    try {
      const data = await fetchBreakdown(client, { days: parseInt(opts.days, 10) })
      renderBreakdown(data, { days: parseInt(opts.days, 10) })
    } finally {
      await client.close()
    }
  })

program
  .command('quality')
  .description('Show developer quality and rework metrics')
  .option('--days <n>', 'Lookback window', '30')
  .action(async (opts) => {
    const client = await connect(program.opts())
    try {
      const data = await fetchQuality(client, { days: parseInt(opts.days, 10) })
      renderQuality(data)
    } finally {
      await client.close()
    }
  })

program
  .command('all')
  .description('Show all dashboards')
  .option('--days <n>', 'Lookback window', '30')
  .option('--quality', 'Include quality metrics (slower — queries per-issue transaction history)')
  .option('--pauses', 'Include pause-aware effective velocity (slower)')
  .action(async (opts) => {
    const days = parseInt(opts.days, 10)
    const client = await connect(program.opts())
    try {
      const tagMap = await fetchTagMap(client)
      const velocity = await fetchVelocity(client, { days, tagMap, includePauses: opts.pauses })
      const workload = await fetchWorkload(client)
      const velocityAvg = avgPtsPerDay(velocity, days)
      const milestones = await fetchMilestones(client, { avgPtsPerDayOverride: velocityAvg })
      const pipeline = await fetchPipeline(client)
      const breakdown = await fetchBreakdown(client, { days, tagMap })
      const quality = opts.quality
        ? await fetchQuality(client, { days, tagMap })
        : null
      renderAll(
        { velocity, workload, milestones, pipeline, breakdown, quality },
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
