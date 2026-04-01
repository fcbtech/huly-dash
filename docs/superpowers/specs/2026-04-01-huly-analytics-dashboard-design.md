# Huly Analytics Dashboard — Design Spec

**Date:** 2026-04-01  
**Status:** Approved

---

## Overview

A terminal CLI tool (`huly-dash`) that connects to a single Huly workspace on demand and reports three analytics views: velocity, workload, and milestone health. All metrics are driven by story points (`estimation` field on `Issue`), not raw issue counts.

Designed with a two-layer architecture (fetcher + renderer) so the terminal renderer can later be swapped for a web UI or Slack integration without touching data logic.

---

## Architecture

Two independent layers communicate via plain JS objects:

```
huly-dash.js (CLI entry, commander)
    ↓
src/connection.js (shared Huly client — connect once, close after all fetchers run)
    ↓
src/fetchers/          ← queries Huly API, returns plain objects
    velocity.js
    workload.js
    milestones.js
    ↓
src/renderers/         ← consumes plain objects, formats for output
    terminal.js        ← active now (chalk + cli-table3)
    web.js             ← future
    slack.js           ← future
```

**Contract:** Fetchers never import from renderers. Renderers never call the Huly API. Data flows one way.

---

## CLI Interface

```
huly-dash velocity   [--days <n>]     # default: 30
huly-dash workload
huly-dash milestones
huly-dash all        [--days <n>]     # runs all three in sequence
```

Credentials are read from `.env` (`HULY_URL`, `HULY_WORKSPACE`, `HULY_EMAIL`/`HULY_PASSWORD` or `HULY_TOKEN`). `--workspace` and `--url` flags override env values.

---

## Data Contracts

### velocity.js

**Query:** Issues where `status.category === Won` (closed) and `modifiedOn` falls within the requested window. Grouped into calendar weeks. Note: `modifiedOn` is used as a proxy for close date — Huly does not expose a dedicated `closedAt` field. This is accurate in practice since closing an issue always triggers a modification.

**Returns:**
```js
[{
  weekLabel: string,      // e.g. "Mar 10–16"
  ptsClosed: number,      // sum of estimation for closed issues that week
  issuesClosed: number,   // raw count (shown as secondary)
  trend: 'best' | 'low' | null
}]
```

### workload.js

**Query:** All open issues with an assignee. Grouped by assignee, sorted by `ptsOpen` descending. Separately collects unassigned open issues.

**Returns:**
```js
{
  members: [{
    name: string,
    ptsOpen: number,       // sum of estimation for open issues
    issueCount: number,
    urgent: number,        // count of Urgent/High priority open issues
    overdue: number        // count where dueDate < now
  }],
  unassigned: {
    pts: number,
    count: number
  }
}
```

**Overloaded threshold:** member flagged as overloaded when `ptsOpen` > 2× workspace average.

### milestones.js

**Query:** All milestones in the workspace. For each milestone, fetch all its issues and split by done/open.

**Returns:**
```js
[{
  label: string,
  pctComplete: number,       // ptsDone / ptsTotal * 100
  ptsDone: number,
  ptsTotal: number,
  daysLeft: number,          // targetDate - today
  ptsPerDayRequired: number, // ptsRemaining / daysLeft
  atRisk: boolean            // true when ptsPerDayRequired > avgPtsPerDay (last 30d)
}]
```

`milestones.js` accepts an optional `avgPtsPerDay` parameter. When running `huly-dash all`, the orchestrator computes velocity first and passes the 30-day average. When running `huly-dash milestones` alone, the fetcher computes its own 30-day velocity average internally before evaluating `atRisk`.

```js
```

---

## Terminal Renderer

Output style: sections with inline bar charts, colour-coded via `chalk`.

- Green: healthy / on track
- Yellow/amber: warning (urgent issues, approaching threshold)
- Red: at risk / overdue / overloaded
- Grey: secondary info (raw issue counts, timestamps)

Bar width is normalised within each section (longest bar = full width). Issue counts always shown as dim secondary alongside story points.

---

## Huly API Usage

Uses `@hcengineering/api-client`'s `connect()` (WebSocket) and `findAll()`.

Key classes queried (via `@hcengineering/tracker`):
- `tracker.class.Issue` — `estimation`, `status`, `assignee`, `milestone`, `priority`, `dueDate`, `modifiedOn`
- `tracker.class.Milestone` — `label`, `targetDate`, `status`, `space`
- `tracker.class.IssueStatus` — to resolve status category (Won = closed)

The client connects once, runs all requested fetchers, then closes.

---

## Dependencies

| Package | Purpose |
|---|---|
| `@hcengineering/api-client` | Huly connection + querying |
| `@hcengineering/tracker` | Issue/Milestone class identifiers |
| `commander` | CLI argument parsing |
| `chalk` | Terminal colour output |
| `cli-table3` | Formatted table rendering |
| `dotenv` | `.env` credential loading |

---

## What's Out of Scope

- Real-time / live streaming updates
- Multiple workspace aggregation
- Web UI (designed for, but not built in this phase)
- Slack integration (designed for, not built in this phase)
- Historical data storage / trending over time
