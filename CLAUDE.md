# CLAUDE.md

## Project Overview

huly-dash is a CLI toolkit for Huly workspace analytics and automation. Two tools:

1. **`huly-dash`** — Terminal dashboard showing velocity, workload, milestones, pipeline, breakdown, and quality metrics
2. **`huly`** — CLI to update Huly issues from git hooks and scripts (status changes, time logging, comments)

## Tech Stack

- Node.js (CommonJS) with yarn (not npm — npm can't resolve `workspace:` protocol in @hcengineering packages)
- `@hcengineering/api-client` for Huly WebSocket API
- `@hcengineering/tracker`, `@hcengineering/task`, `@hcengineering/contact`, `@hcengineering/tags` for domain classes
- `commander` for CLI, `chalk` for terminal output
- `node-fetch@2` polyfill for Node < 18

## Architecture

Two-layer design: fetchers query the Huly API and return plain JS objects; renderers consume those objects and format for terminal output. Fetchers never import renderers. Renderers never call the API.

```
huly-dash.js              — CLI entry point (commander commands, wires fetchers → renderers)
src/
  connection.js           — connect to Huly, return client
  huly.js          — standalone CLI for updating issues from hooks
  fetchers/
    tags.js               — shared tag resolution + issue categorization
    velocity.js           — closed issues by week, category splits, pause-aware
    workload.js           — open issues per assignee
    milestones.js         — milestone % complete, burn rate, at-risk
    pipeline.js           — SDLC stage detection from custom date fields
    breakdown.js          — effort allocation by category (features/bugs/tech-debt)
    quality.js            — developer rework metrics (bounceback + bug yield)
  renderers/
    terminal.js           — chalk bar charts, colour-coded output
hooks/
    post-commit           — git hook: first commit → Dev Start + In Progress
    post-merge            — git hook: merge to main → In Review (QA)
    gh-huly-wrapper.sh    — wraps `gh pr create` to comment on Huly issue
    install.sh            — installs hooks into any repo
```

## Workspace-Specific IDs

These are hardcoded for our Huly workspace and would need updating for other workspaces:

- **Status IDs** in `src/huly.js` (`STATUS_IDS` object) — `inReview` and `paused` are workspace-specific
- **Custom field IDs** in `src/fetchers/pipeline.js` (`CUSTOM_FIELDS` object) — these are the SDLC date field IDs
- **Status IDs** in `src/fetchers/velocity.js` — looks up "Paused" by name, should be safe
- **GitHub Action** in `.github/workflows/huly-sync.yml` — has hardcoded status and custom field IDs

To find your workspace's IDs, run:
```js
// Statuses
const statuses = await client.findAll(core.class.Status, {})
statuses.forEach(s => console.log(s.name, s._id, s.category))

// Custom fields
const attrs = await client.findAll(core.class.Attribute, {})
attrs.filter(a => a._id.startsWith('custom')).forEach(a => console.log(a.name, a.label, a._id))
```

## Key Patterns

- All fetchers accept an optional `tagMap` parameter to avoid duplicate tag queries when running multiple fetchers
- `closedAt` is only populated for GitHub PRs, not regular issues — velocity and breakdown fall back to `modifiedOn`
- `--pauses` and `--quality` flags are opt-in because they query per-issue transaction history (slow for large workspaces)
- Time values: `estimation`, `reportedTime`, `remainingTime` are in story points/hours. `TimeSpendReport.value` is hours.

## Commands Reference

```bash
# Dashboard
node huly-dash.js all --days 30          # fast default (excludes quality)
node huly-dash.js all --quality --pauses # full (slower)
node huly-dash.js velocity --days 14
node huly-dash.js workload
node huly-dash.js milestones
node huly-dash.js pipeline
node huly-dash.js breakdown --days 30
node huly-dash.js quality --days 30

# Issue updates
node src/huly.js dev-start ENG-XXXX
node src/huly.js pr-created ENG-XXXX --pr <url>
node src/huly.js pr-merged ENG-XXXX --pr <url>
node src/huly.js in-review ENG-XXXX
node src/huly.js done ENG-XXXX
node src/huly.js qa-start ENG-XXXX
node src/huly.js released ENG-XXXX
node src/huly.js log-time ENG-XXXX 2.5 "description"
node src/huly.js estimate ENG-XXXX 8
node src/huly.js comment ENG-XXXX "message"
```

## Running Tests

No test suite yet. Smoke test against a live workspace:
```bash
node huly-dash.js all --days 7
node src/huly.js comment ENG-XXXX "test"
```

## Dependencies Note

Uses yarn because @hcengineering packages publish with `workspace:` protocol in their dependency specs. npm cannot resolve these. The `resolutions` field in package.json pins all transitive @hcengineering deps to 0.7.382.
