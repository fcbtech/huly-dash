# Huly Dash v2 — Custom Fields & Enhanced Views Design Spec

**Date:** 2026-04-02
**Status:** Approved

---

## Overview

Three new CLI views for `huly-dash` plus an upgrade to the existing velocity view. All leverage custom fields (SDLC date tracking) and tags (issue categorization) discovered in the workspace.

Changes follow the existing two-layer architecture (fetchers → renderers) with one new shared helper for tag resolution.

---

## New Views

### A. Pipeline (`huly-dash pipeline`)

Shows where open issues sit in the Dev → QA → UAT → Release pipeline.

### C. Issue Type Breakdown (`huly-dash breakdown`)

Shows effort allocation by work category (features, bugs, tech-debt, etc.) using both story points and issue count.

### D. Improved Velocity (`huly-dash velocity` — replaces existing)

Uses `closedAt` instead of `modifiedOn`, shows automatic category splits, and calculates pause-aware effective velocity.

---

## Shared Tag Helper

**File:** `src/fetchers/tags.js`

Since views A (pipeline doesn't use tags directly), C, and D all need tag-based categorization, a shared helper avoids repeated queries.

### `fetchTagMap(client)` → `Map<issueId, string[]>`

Fetches all `TagReference` objects and builds a lookup from issue ID to array of tag titles. Example: `"abc123" → ["issue-bug", "ok-tested"]`.

### `TAG_CATEGORIES` constant

Groups tags into work categories:

```js
const TAG_CATEGORIES = {
  features: ["new-feature"],
  bugs: ["issue-bug", "issue-production-bug", "issue-staging-bug"],
  techDebt: ["ia-tech-debt", "code-refactor"],
  tasks: ["task", "ad-hoc"],
  research: ["research"]
}
```

Anything not matching → `"other"`.

### `categorizeIssue(issueTags)` → `string`

Returns the category for an issue given its tag list. Priority order when multiple category tags exist: bugs > features > techDebt > tasks > research. If no category tags → `"other"`.

---

## View A: Pipeline

**File:** `src/fetchers/pipeline.js`

### Stage Detection

Uses a combination of custom date fields and issue status. Checked in reverse order (latest stage wins):

| Stage | Condition |
|-------|-----------|
| Released | `Release Actual` date is set |
| In UAT | `UAT Start` is set, `Release Actual` is not |
| In QA | `QA Start` is set, `UAT Start` is not |
| In Dev | `Dev Start` is set, `QA Start` is not |
| Waiting | No custom dates, status is active (In Progress, In Review, Todo, Paused) |
| Backlog | No custom dates, status is Backlog |

For issues without custom date fields (majority currently), they fall into Waiting or Backlog based on status. As the team populates date fields, issues automatically get placed in the correct pipeline stage.

### Custom Field Mapping

```js
const CUSTOM_FIELDS = {
  devStart: "custom69cbdd3dae0caf5c9168a6f6",
  devEndExpected: "custom69cbdd6fae0caf5c9168a792",
  devEndActual: "custom69cbdd7cae0caf5c9168a796",
  qaStart: "custom69cbddd0ae0caf5c9168a830",
  qaEndExpected: "custom69cbdde2ae0caf5c9168a834",
  qaEndActual: "custom69cbddf1ae0caf5c9168a838",
  uatStart: "custom69ccee9b9cb2ec858b656bb7",
  uatEnd: "custom69cceeac9cb2ec858b656bbb",
  releaseExpected: "custom69cceebd9cb2ec858b656bbf",
  releaseActual: "custom69cceed59cb2ec858b656bc4"
}
```

### Bottleneck Detection

For each stage, flag issues where elapsed time in that stage exceeds a threshold:
- Dev: > 5 days (`Dev Start` set, no `QA Start`, age > 5d)
- QA: > 3 days
- UAT: > 3 days

### Schedule Accuracy

Where both Expected and Actual date fields exist for Dev End or QA End, compute slip as `actualDate - expectedDate` in days. Report as `+Nd` when positive.

### Data Contract

```js
{
  stages: [
    { name: "Backlog", count: 40, pts: 120 },
    { name: "Waiting", count: 12, pts: 36 },
    { name: "In Dev", count: 5, pts: 24, stalled: 1 },
    { name: "In QA", count: 3, pts: 12, stalled: 0 },
    { name: "In UAT", count: 1, pts: 4, stalled: 0 },
    { name: "Released", count: 8, pts: 32 }
  ],
  bottlenecks: [
    { identifier: "ENG-16157", stage: "In Dev", daysInStage: 7, assignee: "Neeraj" }
  ],
  slips: [
    { identifier: "ENG-16157", field: "Dev End", expected: "2025-01-27", actual: "2025-01-29", slipDays: 2 }
  ]
}
```

### CLI

```
huly-dash pipeline
```

### Renderer

```
◆ Pipeline  Dev → QA → UAT → Release
  Backlog    ████████████████████  40 issues · 120 pts
  Waiting    ██████░░░░░░░░░░░░░░  12 issues · 36 pts
  In Dev     ███░░░░░░░░░░░░░░░░░   5 issues · 24 pts  ⚠ 1 stalled
  In QA      ██░░░░░░░░░░░░░░░░░░   3 issues · 12 pts
  In UAT     █░░░░░░░░░░░░░░░░░░░   1 issue  · 4 pts
  Released   ████░░░░░░░░░░░░░░░░   8 issues · 32 pts

  ⚠ Bottlenecks
  ENG-16157  In Dev  7d  Neeraj  — stuck > 5d threshold
```

---

## View C: Issue Type Breakdown

**File:** `src/fetchers/breakdown.js`

### Scope

Two sections:
- **Open (backlog):** All non-done issues — shows current investment distribution
- **Closed (recent):** Issues closed within the lookback window — shows what effort was actually spent on

### Data Contract

```js
{
  open: {
    features: { pts: 80, count: 15 },
    bugs: { pts: 45, count: 30 },
    techDebt: { pts: 24, count: 8 },
    tasks: { pts: 12, count: 10 },
    research: { pts: 4, count: 2 },
    other: { pts: 20, count: 25 }
  },
  closed: {
    features: { pts: 120, count: 20 },
    bugs: { pts: 60, count: 35 },
    techDebt: { pts: 30, count: 10 },
    tasks: { pts: 18, count: 14 },
    research: { pts: 8, count: 3 },
    other: { pts: 16, count: 18 }
  }
}
```

### CLI

```
huly-dash breakdown [--days <n>]    # default: 30, affects "closed" section
```

### Renderer

Shows % bars for both points and count side by side. The divergence between pts% and count% is the key insight (e.g. "bugs are 24% of effort but 35% of issue count" → lots of small bugs eating time).

```
◆ Breakdown  effort by category

  Open (backlog)                pts           count
  features   ████████████░░░░░░  43%  80pts   ████████░░░░░░░░░░  17%  15
  bugs       ██████████░░░░░░░░  24%  45pts   ████████████████░░  33%  30
  tech-debt  █████░░░░░░░░░░░░░  13%  24pts   ████░░░░░░░░░░░░░░   9%   8
  tasks      ███░░░░░░░░░░░░░░░   6%  12pts   █████░░░░░░░░░░░░░  11%  10
  other      █████░░░░░░░░░░░░░  11%  20pts   █████████████░░░░░  28%  25

  Closed (last 30d)             pts           count
  features   ████████████████░░  48% 120pts   ████████░░░░░░░░░░  20%  20
  bugs       █████████░░░░░░░░░  24%  60pts   ██████████████░░░░  35%  35
  tech-debt  ██████░░░░░░░░░░░░  12%  30pts   ████░░░░░░░░░░░░░░  10%  10
  tasks      ████░░░░░░░░░░░░░░   7%  18pts   ██████░░░░░░░░░░░░  14%  14
  research   ██░░░░░░░░░░░░░░░░   3%   8pts   █░░░░░░░░░░░░░░░░░   3%   3
  other      ███░░░░░░░░░░░░░░░   6%  16pts   █████████░░░░░░░░░  18%  18
```

---

## View D: Improved Velocity (replaces existing)

**File:** `src/fetchers/velocity.js` (modified in place)

### Changes from v1

1. **Use `closedAt` instead of `modifiedOn`** — `modifiedOn` changes when someone comments on a closed issue; `closedAt` is the actual close timestamp.

2. **Automatic category split** — each week bucket includes sub-totals by tag category (using the shared tag helper).

3. **Pause-aware effective velocity** — for each closed issue, reconstruct its status timeline from `TxUpdateDoc` records. Subtract time spent in Paused status. Report both calendar velocity and effective velocity (pts per active working time).

### Pause Calculation

For each closed issue in the window:
1. Fetch all `TxUpdateDoc` where `objectId === issue._id` and `operations.status` exists
2. Sort by `modifiedOn` ascending to build timeline
3. Sum time spent in the Paused status (between entering Paused and transitioning to any other status)
4. `activeTime = elapsedTime - pausedTime`

### Data Contract

```js
[{
  weekLabel: "Mar 10–16",
  ptsClosed: 42,
  issuesClosed: 12,
  pausedDays: 2.1,       // total paused days summed across all issues closed this week
  byCategory: {
    features: { pts: 20, count: 4 },
    bugs: { pts: 14, count: 5 },
    techDebt: { pts: 8, count: 2 },
    other: { pts: 0, count: 1 }
  },
  trend: "best" | "low" | null
}]
```

Summary-level effective velocity is computed from the aggregate: `totalPts / (totalCalendarDays - totalPausedDays) * 7` gives pts per active week.

### CLI

```
huly-dash velocity [--days <n>]    # default: 30
```

Same command as before — this is a drop-in replacement.

### Renderer

```
◆ Velocity  last 30 days · avg 78 pts/week · effective: 92 pts/active-week
  Mar 10–16    ████████████████████  42 pts  (12 issues) · 2.1d paused
    features   ██████████░░░░░░░░░░  20 pts  (4)
    bugs       ███████░░░░░░░░░░░░░  14 pts  (5)
    tech-debt  ████░░░░░░░░░░░░░░░░   8 pts  (2)
  Mar 17–23    ████████████████░░░░  36 pts  (8 issues) · 0.5d paused
    features   ████████████░░░░░░░░  24 pts  (3)
    bugs       ██████░░░░░░░░░░░░░░  12 pts  (5)
```

Categories with 0 pts in a given week are omitted.

### Performance Note

The pause calculation requires fetching transactions per issue. To keep this manageable, only fetch transactions for issues closed in the lookback window. For a 30-day window this is typically 50–150 issues × 1 query each.

---

## View E: Developer Quality / Rework

**File:** `src/fetchers/quality.js`

Combines two metrics to measure developer efficiency and code quality as seen through the QA process.

### Metric 1: Bounceback Rate (per developer)

For each developer, examine their issues that reached In Review within the lookback window. Walk `TxUpdateDoc` status transitions and count backward moves (In Review/Done → In Progress/Todo). Report as:
- **First-pass rate:** % of issues that went straight through without bouncing back
- **Bounce count:** total bouncebacks across all their issues

### Metric 2: QA Bug Yield + Rework Ratio (per developer)

For parent issues (features/tasks with sub-issues) assigned to a developer, count child issues tagged as bugs (`issue-bug`, `issue-production-bug`, `issue-staging-bug`) that were created after the parent first entered In Review or a QA custom date was set.

Per developer:
- **Bug yield:** average bugs spawned per parent issue reviewed
- **Task pts:** total estimation on their parent issues (original work)
- **Rework pts:** total estimation on bug sub-issues spawned from their tasks during QA
- **Rework ratio:** `reworkPts / taskPts` as a percentage — captures severity, not just count

### Data Contract

```js
{
  developers: [
    {
      name: "Himanshu",
      issuesReviewed: 12,        // issues that reached In Review
      bouncebacks: 2,            // times sent back to In Progress
      firstPassRate: 83,         // % (10/12)
      parentIssues: 5,           // features/tasks with sub-issues
      taskPts: 60,               // estimation on parent issues
      qaBugsSpawned: 8,          // bug sub-issues created during/after QA
      reworkPts: 24,             // estimation on bug sub-issues from QA
      avgBugYield: 1.6,          // bugs per parent issue
      reworkRatio: 40            // % — reworkPts/taskPts
    }
  ],
  summary: {
    teamFirstPassRate: 89,
    teamAvgBugYield: 1.2,
    teamReworkRatio: 28,
    totalBouncebacks: 5,
    totalQaBugs: 18
  }
}
```

### CLI

```
huly-dash quality [--days <n>]    # default: 30
```

### Renderer

```
◆ Quality  last 30 days · developer rework metrics

  Developer    1st pass    bounces   bug yield      rework ratio
  Himanshu     83% ████░   2         1.6 bugs/task  40% (24/60 pts)  ⚠
  Suneet C     100% █████  0         0.8 bugs/task  12% (6/50 pts)
  Neeraj       75% ███░░   3         2.1 bugs/task  55% (22/40 pts)  ⚠
  Deveshi      90% ████░   1         1.0 bugs/task  20% (8/40 pts)

  Team: 89% first-pass · 1.2 avg bugs/task · 28% rework ratio
```

Developers flagged with `⚠` when first-pass rate < 80% OR rework ratio > 40%.

### Performance Note

Like velocity, this fetcher queries transactions per issue. Limited to issues that reached In Review within the lookback window plus their bug sub-issues.

---

## Updated `all` Command

`huly-dash all` runs all views in sequence:

1. Velocity (improved, with category splits and pause awareness)
2. Workload (unchanged)
3. Milestones (unchanged)
4. Pipeline (new)
5. Breakdown (new)
6. Quality (new)

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/fetchers/tags.js` | Create — shared tag resolution helper |
| `src/fetchers/pipeline.js` | Create — pipeline stage detection |
| `src/fetchers/breakdown.js` | Create — issue type breakdown |
| `src/fetchers/quality.js` | Create — developer rework metrics |
| `src/fetchers/velocity.js` | Modify — closedAt, category splits, pause-aware |
| `src/renderers/terminal.js` | Modify — add renderPipeline, renderBreakdown, renderQuality, update renderVelocity |
| `huly-dash.js` | Modify — add `pipeline`, `breakdown`, `quality` commands, update `all` |

---

## What's Out of Scope

- Bug-specific health view (deprioritized in favor of pause-aware velocity)
- Flow efficiency as a standalone view (pause impact folded into velocity)
- Time tracking analysis (low adoption: 1/100 issues with reportedTime)
- Historical trend storage
