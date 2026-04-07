# CLAUDE.md

## Project Overview

Two CLI tools for Huly workspace management:

1. **`huly-dash`** — Terminal dashboard: velocity, workload, milestones, pipeline, breakdown, and quality metrics
2. **`huly`** — Issue management CLI: create issues, change status, log time, estimate, comment — used directly and by git hooks

## Tech Stack

- Node.js (CommonJS) with yarn (not npm — npm can't resolve `workspace:` protocol in @hcengineering packages)
- `@hcengineering/api-client` for Huly WebSocket API
- `@hcengineering/tracker`, `@hcengineering/task`, `@hcengineering/contact`, `@hcengineering/tags` for domain classes
- `commander` for CLI, `chalk` for terminal output
- `node-fetch@2` polyfill for Node < 18

## Architecture

Two-layer design for the dashboard: fetchers query the Huly API and return plain JS objects; renderers consume those objects and format for terminal output. Fetchers never import renderers. Renderers never call the API.

The `huly` CLI (`src/huly.js`) is a standalone tool that connects to Huly and performs issue operations directly.

```
huly-dash.js              — Dashboard CLI (commander, wires fetchers → renderers)
src/
  huly.js                 — Issue management CLI (status, time, create, comment)
  connection.js           — Connect to Huly, return client
  fetchers/
    tags.js               — Shared tag resolution + issue categorization
    velocity.js           — Closed issues by week, category splits, pause-aware
    workload.js           — Open issues per assignee
    milestones.js         — Milestone % complete, burn rate, at-risk
    pipeline.js           — SDLC stage detection from custom date fields
    breakdown.js          — Effort allocation by category (features/bugs/tech-debt)
    quality.js            — Developer rework metrics (bounceback + bug yield)
  renderers/
    terminal.js           — Chalk bar charts, colour-coded output
hooks/
    post-commit           — Git hook: first commit → Dev Start + In Progress
    post-merge            — Git hook: merge to main → In Review (QA)
    gh-huly-wrapper.sh    — Wraps `gh pr create` to comment on Huly issue
    install.sh            — Installs hooks into any repo
.github/workflows/
    huly-sync.yml         — GitHub Action: PR merge → In Review (for web merges)
```

## Workspace-Specific IDs

These are hardcoded for our Huly workspace and would need updating for other workspaces:

- **Status IDs** in `src/huly.js` (`STATUS_IDS` object) — `inReview` and `paused` are workspace-specific
- **Custom field IDs** in `src/fetchers/pipeline.js` (`CUSTOM_FIELDS` object) — SDLC date field IDs
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
- `create-sub` increments the project sequence number to generate the next `ENG-XXXX` identifier
- `pr-merged` auto-logs dev time by calculating working hours between Dev Start and merge date (8h/day)

## Huly API Capabilities

The client exposes full CRUD via WebSocket:

| Method | What it does |
|--------|-------------|
| `findAll(class, query)` | Query documents |
| `createDoc(class, space, data)` | Create a document |
| `updateDoc(class, space, id, updates)` | Update fields |
| `removeDoc(class, space, id)` | Delete a document |
| `addCollection(class, space, attachedTo, ...)` | Create attached document (sub-issues, comments, time reports) |
| `getAccount()` | Get current user info |

Key classes: `tracker.class.Issue`, `tracker.class.Milestone`, `tracker.class.Project`, `tracker.class.TimeSpendReport`, `contact.class.Person`, `tags.class.TagReference`, `chunter.class.ChatMessage`, `core.class.TxUpdateDoc` (transaction history)

## Commands Reference

```bash
# Dashboard
node huly-dash.js all --days 30          # Fast default (excludes quality)
node huly-dash.js all --quality --pauses # Full (slower)
node huly-dash.js velocity --days 14
node huly-dash.js workload
node huly-dash.js milestones
node huly-dash.js pipeline
node huly-dash.js breakdown --days 30
node huly-dash.js quality --days 30

# Issue management
node src/huly.js create-sub ENG-XXXX "title" [--estimate N] [--assignee me]
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

## Git Automation Flow

```
Developer Workflow                Huly Update (automatic)
────────────────────────────────────────────────────────────
git checkout -b ENG-1234/feat     (nothing yet)
git commit (first on branch)      → In Progress + Dev Start
...more commits...                (no duplicate triggers)
gh pr create                      → PR link comment on issue
PR merged (local or GitHub web)   → In Review + Dev End + dev time auto-logged
QA passes                         → (manual) huly done / released
```

## Running Tests

No test suite yet. Smoke test against a live workspace:
```bash
node huly-dash.js all --days 7
node src/huly.js comment ENG-XXXX "test"
```

## Dependencies Note

Uses yarn because @hcengineering packages publish with `workspace:` protocol in their dependency specs. npm cannot resolve these. The `resolutions` field in package.json pins all transitive @hcengineering deps to 0.7.382.
