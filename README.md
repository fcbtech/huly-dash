# huly-dash

Terminal analytics dashboard and issue management CLI for [Huly](https://huly.app) workspaces.

Two tools: **`huly-dash`** for team analytics and **`huly`** for issue management. Includes git hooks that automatically update Huly issues as you code.

## What It Does

### Dashboard (`huly-dash`)

```
huly-dash all  ·  workspace: tranzact  ·  2026-04-01
────────────────────────────────────────────────────────────

◆ Velocity  last 30 days · avg 78 pts/week
  Mar 10–16    ████████████████████  42 pts  (12 issues)
    features   ██████████░░░░░░░░░░  20 pts  (4)
    bugs       ███████░░░░░░░░░░░░░  14 pts  (5)
    tech-debt  ████░░░░░░░░░░░░░░░░   8 pts  (2)

◆ Workload  open issues · by story points
  Alice      ████████████████████  52 pts  (8 issues)  ⚠ overloaded
  Bob        ██████░░░░░░░░░░░░░░  24 pts  (5 issues)

◆ Pipeline  Dev → QA → UAT → Release
  Backlog    ████████████████████  40 issues · 120 pts
  In Dev     ███░░░░░░░░░░░░░░░░░   5 issues · 24 pts  ⚠ 1 stalled

◆ Breakdown  effort by category
  features   ████████████░░  43%  80pts   ████████░░░░░░  17%  15
  bugs       ██████████░░░░  24%  45pts   ████████████████  33%  30

◆ Quality  developer rework metrics
  Alice      83% ████░   2 bounces   1.6 bugs/task  40% rework  ⚠
```

**Views:**

| Command | What it shows |
|---------|--------------|
| `velocity` | Story points closed per week with category splits (features/bugs/tech-debt) and optional pause-aware effective velocity |
| `workload` | Open issue points per developer with overload/urgent/overdue flags |
| `milestones` | Milestone progress by points with burn rate and at-risk detection |
| `pipeline` | Where issues sit in Dev → QA → UAT → Release with bottleneck and schedule slip detection |
| `breakdown` | Effort allocation by category — points vs count side by side (open backlog + recently closed) |
| `quality` | Developer first-pass QA rate, bug yield, and rework ratio (pts spent on bug fixes vs original task) |
| `all` | Everything above in one view |

### Issue Management (`huly`)

Create issues, update status, log time, and manage your workflow from the terminal:

```bash
# Create a sub-issue under a parent
node src/huly.js create-sub ENG-14826 "Fix validation logic" --estimate 4 --assignee me

# Status transitions
node src/huly.js dev-start ENG-14826      # → In Progress + set Dev Start
node src/huly.js in-review ENG-14826      # → In Review (ready for QA)
node src/huly.js done ENG-14826           # → Done
node src/huly.js released ENG-14826       # Set Release Actual date

# Time tracking
node src/huly.js log-time ENG-14826 2.5 "Code review and testing"
node src/huly.js estimate ENG-14826 8     # Set story points

# Comments
node src/huly.js comment ENG-14826 "Deployed to staging"
```

### Git Automation (hooks)

Automatically updates Huly issues as you work:

```
First commit on branch  → Issue moves to In Progress, Dev Start date set
gh pr create            → Comment added to issue with PR link
PR merged               → Issue moves to In Review (QA), Dev End date set, dev time auto-logged
```

Works with both local merges and GitHub web UI merges (via GitHub Action).

## Setup

### Prerequisites

- Node.js 16+ (18+ recommended)
- [yarn](https://yarnpkg.com/) (npm won't work — see [Why Yarn?](#why-yarn))
- A [Huly](https://huly.app) account

### Install

```bash
git clone https://github.com/fcbtech/huly-dash.git
cd huly-dash
cp .env.example .env
```

Edit `.env` with your Huly credentials:

```env
HULY_URL=https://huly.app
HULY_WORKSPACE=your-workspace-name
HULY_EMAIL=you@company.com
HULY_PASSWORD=your-password
```

Then install dependencies:

```bash
yarn install
```

Verify it works:

```bash
node huly-dash.js all --days 7
```

### Install Git Hooks (optional)

To enable automatic Huly updates when you commit and create PRs:

```bash
# Install hooks into your project repo
./hooks/install.sh /path/to/your/repo

# Add the gh CLI wrapper to your shell
echo 'export HULY_DASH_DIR="'$(pwd)'"' >> ~/.zshrc
echo 'source "'$(pwd)'/hooks/gh-huly-wrapper.sh"' >> ~/.zshrc
source ~/.zshrc
```

**Branch naming convention:** Include the issue ID in your branch name:
```bash
git checkout -b ENG-14826/remove-deepcopy
git checkout -b feature/ENG-14826-fix-auth
```

### GitHub Action for PR Merges (optional)

The git hooks work locally, but if PRs are merged from the GitHub web UI, you need a GitHub Action. Copy `.github/workflows/huly-sync.yml` to your repo and add these secrets:

| Secret | Value |
|--------|-------|
| `HULY_URL` | `https://huly.app` (or your self-hosted URL) |
| `HULY_WORKSPACE` | Your workspace name |
| `HULY_EMAIL` | Huly account email |
| `HULY_PASSWORD` | Huly account password |

## Usage

### Dashboard

```bash
# All views (fast — excludes quality metrics)
node huly-dash.js all

# All views including quality (slower — queries per-issue history)
node huly-dash.js all --quality

# Include pause-aware effective velocity
node huly-dash.js all --pauses

# Individual views
node huly-dash.js velocity --days 14
node huly-dash.js velocity --pauses       # with effective velocity
node huly-dash.js workload
node huly-dash.js milestones
node huly-dash.js pipeline
node huly-dash.js breakdown --days 30
node huly-dash.js quality --days 30
```

### Issue Management

```bash
# Create sub-issues
node src/huly.js create-sub ENG-14826 "Fix validation logic" --estimate 4
node src/huly.js create-sub ENG-14826 "Write tests" --estimate 2 --assignee me

# Status changes
node src/huly.js dev-start ENG-14826      # → In Progress + Dev Start date
node src/huly.js pr-created ENG-14826 --pr https://github.com/org/repo/pull/123
node src/huly.js pr-merged ENG-14826 --pr https://github.com/org/repo/pull/123
node src/huly.js in-review ENG-14826      # → In Review (for QA/UAT)
node src/huly.js done ENG-14826           # → Done
node src/huly.js qa-start ENG-14826       # Set QA Start date
node src/huly.js released ENG-14826       # Set Release Actual date

# Time tracking
node src/huly.js log-time ENG-14826 2.5 "Code review and testing"
node src/huly.js estimate ENG-14826 8     # Set story points + remaining time

# Comments
node src/huly.js comment ENG-14826 "Deployed to staging"
```

### PR Workflow Commands

These are used by git hooks but can also be run manually:

| Command | What it does |
|---------|-------------|
| `dev-start` | Moves to In Progress, sets Dev Start date (if not already set) |
| `pr-created` | Adds PR link as comment on the issue |
| `pr-merged` | Moves to In Review, sets Dev End Actual, auto-logs dev time (hours between Dev Start and merge) |

## Automation Flow

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

## Customizing for Your Workspace

Some IDs are workspace-specific and will need updating if you use a different Huly workspace.

### Finding Your IDs

Connect to your workspace and run:

```bash
node -e "
require('dotenv').config()
if (!globalThis.fetch) globalThis.fetch = require('node-fetch')
const { connect } = require('@hcengineering/api-client')
async function run() {
  const client = await connect(process.env.HULY_URL, {
    email: process.env.HULY_EMAIL, password: process.env.HULY_PASSWORD,
    workspace: process.env.HULY_WORKSPACE
  })
  const core = require('@hcengineering/core').default

  console.log('=== Statuses ===')
  const statuses = await client.findAll(core.class.Status, {})
  statuses.forEach(s => console.log(s.name.padEnd(20), s._id, s.category))

  console.log('\n=== Custom Fields ===')
  const attrs = await client.findAll(core.class.Attribute, {})
  attrs.filter(a => a._id.startsWith('custom'))
    .forEach(a => console.log(a.label.padEnd(40), 'name:', a.name))

  await client.close()
}
run().catch(console.error)
"
```

### What to Update

| File | What | How to find |
|------|------|-------------|
| `src/huly.js` → `STATUS_IDS.inReview` | In Review status ID | Find "In Review" in status output |
| `src/huly.js` → `STATUS_IDS.paused` | Paused status ID | Find "Paused" in status output |
| `src/fetchers/pipeline.js` → `CUSTOM_FIELDS` | SDLC date field IDs | Find "Dev Start", "QA Start", etc. in custom fields output |
| `src/fetchers/tags.js` → `TAG_CATEGORIES` | Tag names for categorization | Check your workspace's tags in Huly UI |
| `.github/workflows/huly-sync.yml` | Status + custom field IDs | Same as above |

## Project Structure

```
huly-dash.js              Dashboard CLI entry point
src/
  huly.js                 Issue management CLI
  connection.js           Huly API connection
  fetchers/               Data fetchers (return plain objects)
    tags.js               Shared tag resolution + categorization
    velocity.js           Velocity with category splits + pause awareness
    workload.js           Workload per developer
    milestones.js         Milestone health
    pipeline.js           SDLC pipeline stages
    breakdown.js          Effort by category
    quality.js            Developer rework metrics
  renderers/
    terminal.js           Terminal output with chalk
hooks/
  post-commit             First commit → Dev Start
  post-merge              Merge to main → In Review
  gh-huly-wrapper.sh      gh pr create wrapper
  install.sh              Hook installer
.github/workflows/
  huly-sync.yml           GitHub Action for web PR merges
docs/
  huly-tracking-guidelines.md   Team guidelines for Huly data quality
```

## Why Yarn?

The `@hcengineering` packages are published with `workspace:` protocol in their dependency specs (a pnpm/yarn monorepo convention). npm cannot resolve these even with `overrides`. Yarn's `resolutions` field handles this correctly. Do not switch to npm — it will fail to install.

## License

ISC
