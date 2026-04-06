# Huly CLI — Design Spec

**Date:** 2026-04-03
**Status:** Approved

---

## Overview

A general-purpose CLI (`huly`) for interacting with a Huly workspace from the terminal. Modeled after `gh` (GitHub CLI) — noun-verb command style, flags-only input, human-friendly table output by default with `--json` for scripting. Built in TypeScript.

Separate from the existing `huly-dash` analytics tool. Lives in the same repo but is its own entry point and package binary.

---

## Architecture

Layered library + thin CLI. Three layers with strict dependency direction:

```
bin/
  huly.ts                  ← CLI entry point (commander setup, top-level error handling)

src/
  config/
    store.ts               ← read/write ~/.config/huly/config.json (url, workspace, token)
    auth.ts                ← login flow: email+password → token, persist to store

  lib/
    client.ts              ← connect(config) → HulyClient wrapper (findAll, close, etc.)
    issues.ts              ← listIssues, getIssue, createIssue, updateIssue, closeIssue
    milestones.ts          ← listMilestones, getMilestone
    projects.ts            ← listProjects, getProject
    members.ts             ← listMembers, getMember
    statuses.ts            ← listStatuses, resolveStatusCategory

  commands/
    auth.ts                ← huly auth login / logout / status
    issue.ts               ← huly issue list / view / create / update / close
    milestone.ts           ← huly milestone list / view
    project.ts             ← huly project list / view
    member.ts              ← huly member list

  formatters/
    table.ts               ← human-readable table output (chalk + cli-table3)
    json.ts                ← raw JSON output
    index.ts               ← picks formatter based on --json flag
```

**Data flow:** `bin/huly.ts` → `commands/*` (parse flags) → `lib/*` (query Huly) → `formatters/*` (render output)

**Rules:**
- `lib/` never imports from `commands/` or `formatters/`
- `commands/` never calls the Huly API directly — always through `lib/`
- `formatters/` are stateless — receive data, return strings

---

## Config & Auth

**Config location:** `~/.config/huly/config.json`

```json
{
  "url": "https://huly.app",
  "workspace": "tranzact",
  "token": "eyJ..."
}
```

**Commands:**

- `huly auth login --url <url> --workspace <ws> --email <email> --password <pass>` — authenticates via the Huly API, stores the returned token + url + workspace in config
- `huly auth logout` — deletes the config file
- `huly auth status` — prints current url, workspace, and whether the token is present

**Behavior:**
- Every command checks for config before running. If no config exists, prints "Not logged in. Run `huly auth login` first." and exits with code 1.
- `--url` and `--workspace` flags on any command override config values for that invocation (but don't persist).
- Token is stored plainly in the config file (same trust model as `gh` and most CLIs). No keychain integration for v1.

---

## Issue Commands (v1 core)

### `huly issue list`

```
huly issue list [--project <id>] [--assignee <name>] [--status <name>]
                [--priority <urgent|high|medium|low>] [--milestone <name>]
                [--limit <n>] [--json]
```

Default: lists open issues across the workspace sorted by most recently modified. Shows identifier, title, status, assignee, priority, estimation.

### `huly issue view <identifier>`

```
huly issue view PROJ-123 [--json]
```

Shows full detail: title, description, status, assignee, priority, estimation, milestone, due date, created/modified dates.

### `huly issue create`

```
huly issue create --title <title> --project <id>
                  [--description <text>] [--assignee <name>]
                  [--priority <urgent|high|medium|low>] [--estimation <pts>]
                  [--milestone <name>] [--due <YYYY-MM-DD>]
```

`--title` and `--project` are required. Everything else optional.

### `huly issue update <identifier>`

```
huly issue update PROJ-123 [--title <text>] [--assignee <name>]
                           [--priority <level>] [--status <name>]
                           [--estimation <pts>] [--milestone <name>]
                           [--due <YYYY-MM-DD>]
```

Only the provided flags are changed; everything else left untouched.

### `huly issue close <identifier>`

```
huly issue close PROJ-123
```

Sets the issue status to the first "Won" category status in its project.

### Identifier Resolution

Issues are referenced by their human-readable identifier (e.g., `PROJ-123`), not internal IDs. The lib layer resolves these to Huly `_id` values.

---

## Supporting Commands (v1)

### `huly project list`

```
huly project list [--json]
```

Lists all projects (tracker spaces) in the workspace. Shows identifier, name, and issue count.

### `huly project view <identifier>`

```
huly project view PROJ [--json]
```

Shows project details: name, identifier, description, member count, open/closed issue counts.

### `huly milestone list`

```
huly milestone list [--project <id>] [--json]
```

Lists milestones. Shows label, status (planned/in-progress/completed), target date, % complete by points.

### `huly milestone view <name>`

```
huly milestone view "Sprint 12" [--project <id>] [--json]
```

Shows milestone detail: label, target date, status, points done/total, issue breakdown.

### `huly member list`

```
huly member list [--json]
```

Lists workspace members. Shows name and email.

---

## Output Formatting

**Table output (default):**
- Colored with `chalk` — status badges (green for done, yellow for in-progress, red for urgent/overdue)
- Truncated columns for terminal width (title capped, long descriptions ellipsized)
- Issue identifiers in bold for scannability

**JSON output (`--json`):**
- Raw objects, no color codes, no truncation
- Suitable for piping to `jq`, scripting, etc.

---

## Error Handling

- Auth errors → "Not logged in. Run `huly auth login` first." (exit 1)
- Connection failures → "Could not connect to <url>. Check your network and URL." (exit 1)
- Not found (bad identifier) → "Issue PROJ-999 not found." (exit 1)
- Missing required flags → commander's built-in error + usage hint
- All errors go to stderr; data goes to stdout

**Exit codes:**
- 0 = success
- 1 = error

---

## Tech Stack & Dependencies

| Package | Purpose |
|---|---|
| `typescript` | Language |
| `tsx` | Dev runner (no build step during development) |
| `tsup` | Production build (single bundled output) |
| `commander` | CLI argument parsing |
| `chalk` | Terminal colors |
| `cli-table3` | Table formatting |
| `@hcengineering/api-client` | Huly connection + querying |
| `@hcengineering/tracker` | Issue/Milestone class identifiers |
| `@hcengineering/contact` | Person/Member resolution |
| `@hcengineering/task` | Status category constants |
| `@hcengineering/core` | Core class identifiers |

**Build:**
- `tsup bin/huly.ts --format cjs` → produces `dist/huly.js`
- `package.json` `bin` points to `dist/huly.js`
- Development: `tsx bin/huly.ts` for quick iteration

---

## Out of Scope (v1)

- Interactive prompts / TUI
- Shell completions
- Create/update for milestones and projects
- Keychain credential storage
- Multiple workspace profiles
- Analytics dashboard commands (stays in `huly-dash`)
