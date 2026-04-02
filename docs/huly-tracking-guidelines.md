# Huly Tracking Guidelines for the Engineering Team

These guidelines ensure consistent data quality in Huly so that `huly-dash` (and team leads) can accurately measure velocity, workload, pipeline health, and developer quality.

---

## Current Gaps (why this matters)

Based on an audit of our workspace:

| Field | Current Coverage | Target |
|-------|-----------------|--------|
| Estimation (story points) | 15% of open issues | 100% of active work |
| Assignee | 64% | 100% of non-backlog |
| Tags (issue type) | 51% | 100% |
| Priority | 11% set (89% "No priority") | 100% of active work |
| Due date | 3% | All milestone/sprint work |
| SDLC dates (Dev Start, etc.) | 6 issues total | All sprint issues |

Without these fields, the dashboard shows incomplete or misleading data. For example, 59% of open issues show as "other" in the breakdown view because they have no category tag.

---

## Required Fields — Every Issue

### 1. Story Points (Estimation)

**When to set:** At sprint planning or when the issue moves to Todo/In Progress.

**How to estimate:** Use your team's agreed scale. If you don't have one, start with hours of work:

| Points | Meaning |
|--------|---------|
| 1 | Trivial — under 1 hour |
| 2 | Small — half day |
| 4 | Medium — 1 day |
| 8 | Large — 2 days |
| 16 | XL — 3-5 days |
| 24+ | Epic — break it down into sub-issues |

**Why it matters:** Velocity, workload, milestones, and breakdown are all driven by story points. An issue with 0 estimation is invisible to every metric.

### 2. Assignee

**When to set:** Before the issue moves out of Backlog.

**Why it matters:** Workload distribution, quality metrics, and bottleneck detection all depend on knowing who owns the work. The 54 unassigned open issues currently show as "needs triage."

### 3. Tags (Issue Type)

**When to set:** When the issue is created.

**Which tag to use:** Every issue gets exactly one category tag:

| Tag | Use for |
|-----|---------|
| `new-feature` | New functionality, user-facing changes |
| `issue-bug` | Bugs found internally (dev/QA) |
| `issue-production-bug` | Bugs reported from production |
| `issue-staging-bug` | Bugs found in staging |
| `ia-tech-debt` | Refactoring, cleanup, upgrades |
| `code-refactor` | Code restructuring without behavior change |
| `task` | Operational work, config changes, admin |
| `research` | Spikes, investigations, POCs |
| `ad-hoc` | Unplanned/reactive work |

Additional tags (like `ok-tested`, `project`, `ia-ts`) can be added alongside the category tag.

**Why it matters:** The breakdown view shows where effort goes (features vs bugs vs tech-debt). Without tags, issues fall into "other" which tells us nothing.

### 4. Priority

**When to set:** When the issue is created or triaged.

**Use Huly's built-in priorities:**
- **Urgent** — blocking production or a release
- **High** — needed this sprint
- **Medium** — planned for upcoming sprint
- **Low** — nice to have, backlog

**Why it matters:** Workload view flags urgent/overdue issues per developer. Without priority, we can't surface what's critical.

---

## Required Fields — Sprint/Active Work

These fields are required for any issue that enters a sprint or moves to In Progress.

### 5. Due Date

**When to set:** At sprint planning.

**Set to:** The sprint end date, or the specific deadline if there is one.

**Why it matters:** Overdue detection in the workload view. Without due dates, we can't flag slipping work.

### 6. Milestone

**When to set:** At sprint planning.

**Why it matters:** Milestone health view tracks % complete by story points and flags at-risk milestones. Issues without milestones don't contribute to any milestone's progress tracking.

---

## SDLC Date Fields — For Pipeline Tracking

These custom date fields drive the Pipeline view. They're new and adoption is just starting. The goal is for every sprint issue to have these filled in as it progresses.

### When to fill each field:

| Field | When | Who |
|-------|------|-----|
| **Dev Start** | When you start coding | Developer |
| **Dev End - Expected** | At sprint planning (estimated completion) | Developer/Lead |
| **Dev End - Actual** | When dev work is actually done | Developer |
| **QA Start** | When QA picks up the issue | QA |
| **QA End - Expected** | When QA estimates they'll finish | QA |
| **QA End - Actual** | When QA is actually done | QA |
| **UAT Start** | When UAT begins | QA/Lead |
| **UAT End** | When UAT is signed off | QA/Lead |
| **Release Expected** | Planned release date | Lead |
| **Release Actual** | When it actually ships | Lead |

### What this enables:

- **Pipeline view:** Shows exactly where every issue sits in Dev → QA → UAT → Release
- **Bottleneck detection:** Flags issues stuck in Dev (>5 days), QA (>3 days), or UAT (>3 days)
- **Schedule accuracy:** Compares Expected vs Actual dates to measure estimation accuracy over time

### Minimum viable adoption:

If filling all 10 fields feels like too much, start with just these 4:
1. **Dev Start** — when you start
2. **QA Start** — when QA picks it up
3. **UAT Start** — when UAT begins
4. **Release Actual** — when it ships

These 4 alone give the pipeline view full stage detection.

---

## Status Transitions — Do Them Right

The status flow matters for velocity and quality metrics.

### Correct flow:

```
Backlog → Todo → In Progress → In Review → Done
                      ↕
                    Paused
```

### Rules:

1. **Move to In Progress** when you actually start working, not when you plan to.
2. **Move to In Review** when you submit for QA/review, not when you're "almost done."
3. **Use Paused** when work is blocked or deprioritized — don't leave it In Progress. The velocity view can calculate effective velocity (excluding paused time) when `--pauses` is used.
4. **Don't skip statuses.** Going straight from Todo to Done means the quality metrics can't detect bouncebacks.
5. **If QA rejects, move back to In Progress** (not Todo). This is how we measure first-pass QA success rate per developer.

### What this enables:

- **Velocity:** Accurate close dates from status transitions
- **Quality:** Bounceback detection (In Review → In Progress = QA rejection)
- **Flow:** Pause-aware effective velocity when `--pauses` flag is used

---

## Sub-Issues for QA Bugs

When QA finds a bug during review of a parent issue:

1. Create the bug as a **sub-issue** of the parent task
2. Tag it with `issue-bug` (or `issue-staging-bug` / `issue-production-bug`)
3. Add story point estimation to the bug

**Why it matters:** The quality view measures "bug yield" — how many bug sub-issues were created after a parent entered review. This is the rework ratio metric: story points spent fixing bugs vs story points of the original task.

---

## Quick Checklist

Before moving an issue out of Backlog:
- [ ] Story points estimated
- [ ] Assignee set
- [ ] Category tag applied
- [ ] Priority set

Before starting a sprint issue:
- [ ] Due date set
- [ ] Milestone assigned
- [ ] Dev Start date filled when work begins

When work changes hands:
- [ ] Status updated (In Progress → In Review → Done)
- [ ] QA Start date filled when QA picks it up
- [ ] Bugs created as sub-issues with bug tags

---

## Dashboard Commands Reference

```bash
huly-dash all                    # Full dashboard (fast — excludes quality)
huly-dash all --quality          # Full dashboard including quality metrics (slower)
huly-dash all --pauses           # Include pause-aware effective velocity (slower)

huly-dash velocity --days 14     # Velocity with category splits
huly-dash pipeline               # Where issues sit in Dev → QA → UAT → Release
huly-dash breakdown --days 30    # Effort allocation: features vs bugs vs tech-debt
huly-dash quality --days 30      # Developer first-pass rate and rework ratio
huly-dash workload               # Open work per developer
huly-dash milestones             # Milestone health and burn rate
```
