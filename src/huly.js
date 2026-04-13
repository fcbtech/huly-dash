#!/usr/bin/env node

/**
 * CLI tool for managing Huly issues from the terminal and git hooks.
 *
 * Usage:
 *   node huly.js dev-start ENG-14826
 *   node huly.js pr-merged ENG-14826 --pr "https://github.com/org/repo/pull/123"
 *   node huly.js create-sub ENG-14826 "Sub-task title" --estimate 4
 *   node huly.js log-time ENG-14826 2.5 "description"
 *   node huly.js comment ENG-14826 "Deployed to staging"
 */

if (!globalThis.fetch) {
  globalThis.fetch = require('node-fetch')
}

const { connect } = require('@hcengineering/api-client')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const tracker = require('@hcengineering/tracker').default
const core = require('@hcengineering/core').default
const { generateId } = require('@hcengineering/core')
const chunter = require('@hcengineering/chunter').default

const CUSTOM_FIELDS = {
  devStart: 'custom69cbdd3dae0caf5c9168a6f6',
  devEndExpected: 'custom69cbdd6fae0caf5c9168a792',
  devEndActual: 'custom69cbdd7cae0caf5c9168a796',
  qaStart: 'custom69cbddd0ae0caf5c9168a830',
  qaEndExpected: 'custom69cbdde2ae0caf5c9168a834',
  qaEndActual: 'custom69cbddf1ae0caf5c9168a838',
  uatStart: 'custom69ccee9b9cb2ec858b656bb7',
  uatEnd: 'custom69cceeac9cb2ec858b656bbb',
  releaseExpected: 'custom69cceebd9cb2ec858b656bbf',
  releaseActual: 'custom69cceed59cb2ec858b656bc4'
}

const STATUS_IDS = {
  backlog: 'tracker:status:Backlog',
  todo: 'tracker:status:Todo',
  inProgress: 'tracker:status:InProgress',
  inReview: '67a05e0143abf4484b6479d4',
  done: 'tracker:status:Done',
  paused: '67a05cf443abf4484b6479c8',
  canceled: 'tracker:status:Canceled'
}

async function main () {
  const args = process.argv.slice(2)
  const command = args[0]
  const issueRef = args[1] // e.g. "ENG-14826"

  if (!command) {
    console.error('Usage: huly <command> [ENG-XXXX] [options]')
    console.error('Commands: create, create-sub, dev-start, pr-created, pr-merged, in-review, done, qa-start, released, log-time, estimate, comment')
    process.exit(1)
  }

  const url = process.env.HULY_URL || 'https://huly.app'
  const workspace = process.env.HULY_WORKSPACE
  const authOptions = process.env.HULY_TOKEN
    ? { token: process.env.HULY_TOKEN, workspace }
    : { email: process.env.HULY_EMAIL, password: process.env.HULY_PASSWORD, workspace }
  const client = await connect(url, authOptions)

  try {
    // Commands that don't require an existing issue
    if (command === 'create') {
      await handleCreate(client, args.slice(1))
      return
    }

    // All other commands require an issue reference
    if (!issueRef) {
      console.error('Usage: huly ' + command + ' <ENG-XXXX> [options]')
      process.exit(1)
    }

    const issueNumber = parseInt(issueRef.replace(/^ENG-/i, ''), 10)
    if (isNaN(issueNumber)) {
      console.error('Invalid issue reference:', issueRef)
      process.exit(1)
    }

    const issues = await client.findAll(tracker.class.Issue, { number: issueNumber })
    if (issues.length === 0) {
      console.error('Issue ENG-' + issueNumber + ' not found')
      process.exit(1)
    }

    const issue = issues[0]
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()

    switch (command) {
      case 'dev-start': {
        const updates = { status: STATUS_IDS.inProgress }
        if (!issue[CUSTOM_FIELDS.devStart]) {
          updates[CUSTOM_FIELDS.devStart] = todayMs
        }
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, updates)
        console.log('✓ ENG-' + issueNumber + ' → In Progress' + (!issue[CUSTOM_FIELDS.devStart] ? ' (Dev Start set)' : ''))
        break
      }

      case 'pr-created': {
        // PR opened — add comment. Status stays In Progress. Dev End set on merge.
        const prIdx2 = args.indexOf('--pr')
        if (prIdx2 !== -1 && args[prIdx2 + 1]) {
          await addComment(client, issue, 'PR opened: ' + args[prIdx2 + 1])
          console.log('✓ PR comment added to ENG-' + issueNumber)
        } else {
          console.log('✓ ENG-' + issueNumber + ' (no --pr flag, nothing to do)')
        }
        break
      }

      case 'pr-merged': {
        // PR merged — set Dev End Actual, move to In Review (ready for QA),
        // auto-log dev time if Dev Start is set
        const mergeUpdates = {
          status: STATUS_IDS.inReview,
          [CUSTOM_FIELDS.devEndActual]: todayMs
        }
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, mergeUpdates)
        console.log('✓ ENG-' + issueNumber + ' → In Review (Dev End Actual set)')

        // Auto-log dev time from Dev Start → now
        const devStartMs = issue[CUSTOM_FIELDS.devStart]
        if (devStartMs) {
          const devHours = Math.round(((todayMs - devStartMs) / (24 * 60 * 60 * 1000)) * 8 * 10) / 10 // working hours (8h/day)
          if (devHours > 0) {
            const account = await client.getAccount()
            const employeeId = await resolveEmployee(client, account)
            await client.addCollection(
              tracker.class.TimeSpendReport,
              issue.space,
              issue._id,
              tracker.class.Issue,
              'reports',
              {
                value: devHours,
                employee: employeeId,
                date: Date.now(),
                description: 'Dev time (auto-logged from Dev Start → PR merge)'
              }
            )
            console.log('✓ Auto-logged ' + devHours + 'h dev time (Dev Start → merge)')
          }
        }

        const prIdx3 = args.indexOf('--pr')
        if (prIdx3 !== -1 && args[prIdx3 + 1]) {
          await addComment(client, issue, 'PR merged: ' + args[prIdx3 + 1])
          console.log('✓ Merge comment added')
        }
        break
      }

      case 'in-review': {
        // Manual: move to In Review (for QA/UAT)
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, {
          status: STATUS_IDS.inReview
        })
        console.log('✓ ENG-' + issueNumber + ' → In Review')
        break
      }

      case 'done': {
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, {
          status: STATUS_IDS.done
        })
        console.log('✓ ENG-' + issueNumber + ' → Done')
        break
      }

      case 'qa-start': {
        const updates = { [CUSTOM_FIELDS.qaStart]: todayMs }
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, updates)
        console.log('✓ ENG-' + issueNumber + ' QA Start set')
        break
      }

      case 'released': {
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, {
          [CUSTOM_FIELDS.releaseActual]: todayMs
        })
        console.log('✓ ENG-' + issueNumber + ' Release Actual set')
        break
      }

      case 'comment': {
        const message = args.slice(2).join(' ')
        if (!message) {
          console.error('Usage: huly-update comment ENG-XXXX "your message"')
          process.exit(1)
        }
        await addComment(client, issue, message)
        console.log('✓ Comment added to ENG-' + issueNumber)
        break
      }

      case 'log-time': {
        // Usage: huly-update log-time ENG-XXXX 2.5 "optional description"
        const hours = parseFloat(args[2])
        if (isNaN(hours) || hours <= 0) {
          console.error('Usage: huly-update log-time ENG-XXXX <hours> ["description"]')
          process.exit(1)
        }
        const desc = args.slice(3).join(' ') || ''
        const account = await client.getAccount()
        const employeeId = await resolveEmployee(client, account)
        await client.addCollection(
          tracker.class.TimeSpendReport,
          issue.space,
          issue._id,
          tracker.class.Issue,
          'reports',
          {
            value: hours,
            employee: employeeId,
            date: Date.now(),
            description: desc
          }
        )
        console.log('✓ Logged ' + hours + 'h on ENG-' + issueNumber + (desc ? ' (' + desc + ')' : ''))
        break
      }

      case 'estimate': {
        // Usage: huly-update estimate ENG-XXXX 8
        const pts = parseFloat(args[2])
        if (isNaN(pts) || pts < 0) {
          console.error('Usage: huly-update estimate ENG-XXXX <story-points>')
          process.exit(1)
        }
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, {
          estimation: pts,
          remainingTime: pts
        })
        console.log('✓ ENG-' + issueNumber + ' estimated at ' + pts + ' pts')
        break
      }

      case 'create-sub': {
        // Usage: huly-update create-sub ENG-XXXX "Title" [--estimate N] [--assignee me]
        const title = args[2]
        if (!title) {
          console.error('Usage: huly-update create-sub ENG-XXXX "title" [--estimate N] [--assignee me]')
          process.exit(1)
        }

        const estIdx = args.indexOf('--estimate')
        const estimation = estIdx !== -1 ? parseFloat(args[estIdx + 1]) || 0 : 0

        const assignIdx = args.indexOf('--assignee')
        let assignee = null
        if (assignIdx !== -1 && args[assignIdx + 1] === 'me') {
          const account = await client.getAccount()
          assignee = await resolveEmployee(client, account)
        } else if (issue.assignee) {
          assignee = issue.assignee
        }

        // Get project to increment sequence
        const projects = await client.findAll(tracker.class.Project, { _id: issue.space })
        const project = projects[0]
        const newNumber = project.sequence + 1

        const statuses = await client.findAll(core.class.Status, {})
        const backlogId = statuses.find((s) => s.name === 'Backlog' && s.ofAttribute === 'tracker:attribute:IssueStatus')?._id

        await client.addCollection(
          tracker.class.Issue,
          issue.space,
          issue._id,
          tracker.class.Issue,
          'subIssues',
          {
            title,
            description: null,
            status: backlogId,
            priority: 0,
            number: newNumber,
            assignee,
            estimation,
            remainingTime: estimation,
            reportedTime: 0,
            reports: 0,
            childInfo: [],
            parents: [{
              parentId: issue._id,
              parentTitle: issue.title,
              identifier: issue.identifier,
              space: issue.space
            }],
            identifier: 'ENG-' + newNumber,
            kind: 'tracker:taskTypes:Issue',
            dueDate: null,
            milestone: null,
            component: null,
            relations: [],
            subIssues: 0,
            comments: 0,
            rank: ''
          }
        )

        await client.updateDoc(tracker.class.Project, issue.space, issue.space, {
          sequence: newNumber
        })

        console.log('✓ Created ENG-' + newNumber + ' "' + title + '" under ' + issue.identifier + (estimation ? ' (' + estimation + ' pts)' : ''))
        break
      }

      default:
        console.error('Unknown command:', command)
        console.error('Commands: create, create-sub, dev-start, pr-created, pr-merged, in-review, done, qa-start, released, log-time, estimate, comment')
        process.exit(1)
    }
  } finally {
    await client.close()
  }
}

/**
 * Create a new top-level issue.
 * Usage: huly create "Title" [--description text] [--estimate N] [--assignee me] [--priority urgent|high|medium|low] [--tag tag-name]
 */
async function handleCreate (client, args) {
  const title = args[0]
  if (!title || title.startsWith('--')) {
    console.error('Usage: huly create "title" [--description text] [--estimate N] [--assignee me] [--priority urgent|high|medium|low] [--tag tag-name]')
    process.exit(1)
  }

  const descIdx = args.indexOf('--description')
  const description = descIdx !== -1 ? args[descIdx + 1] || '' : ''

  const estIdx = args.indexOf('--estimate')
  const estimation = estIdx !== -1 ? parseFloat(args[estIdx + 1]) || 0 : 0

  const priorityMap = { urgent: 1, high: 2, medium: 3, low: 4 }
  const priIdx = args.indexOf('--priority')
  const priority = priIdx !== -1 ? (priorityMap[args[priIdx + 1]] || 0) : 0

  const assignIdx = args.indexOf('--assignee')
  let assignee = null
  if (assignIdx !== -1 && args[assignIdx + 1] === 'me') {
    const account = await client.getAccount()
    assignee = await resolveEmployee(client, account)
  }

  // Get project
  const projects = await client.findAll(tracker.class.Project, {})
  const project = projects[0]
  const newNumber = project.sequence + 1
  const issueId = generateId()
  const descriptionRef = description
    ? await client.uploadMarkup(tracker.class.Issue, issueId, 'description', description, 'markdown')
    : null

  const statuses = await client.findAll(core.class.Status, {})
  const backlogId = statuses.find((s) => s.name === 'Backlog' && s.ofAttribute === 'tracker:attribute:IssueStatus')?._id

  await client.addCollection(
    tracker.class.Issue,
    project._id,
    'tracker:ids:NoParent',
    tracker.class.Issue,
    'subIssues',
    {
      title,
      description: descriptionRef,
      status: backlogId,
      priority,
      number: newNumber,
      assignee,
      estimation,
      remainingTime: estimation,
      reportedTime: 0,
      reports: 0,
      childInfo: [],
      parents: [],
      identifier: 'ENG-' + newNumber,
      kind: 'tracker:taskTypes:Issue',
      dueDate: null,
      milestone: null,
      component: null,
      relations: [],
      subIssues: 0,
      comments: 0,
      rank: ''
    },
    issueId
  )

  await client.updateDoc(tracker.class.Project, project._id, project._id, {
    sequence: newNumber
  })

  // Add tag if specified
  const tagIdx = args.indexOf('--tag')
  if (tagIdx !== -1 && args[tagIdx + 1]) {
    const tags = require('@hcengineering/tags').default
    const tagElements = await client.findAll(tags.class.TagElement, {})
    const tagEl = tagElements.find((t) => t.title === args[tagIdx + 1])
    if (tagEl) {
      const allIssues = await client.findAll(tracker.class.Issue, { number: newNumber })
      if (allIssues.length > 0) {
        await client.addCollection(
          tags.class.TagReference,
          project._id,
          allIssues[0]._id,
          tracker.class.Issue,
          'labels',
          {
            tag: tagEl._id,
            title: tagEl.title,
            color: tagEl.color
          }
        )
      }
    } else {
      console.error('  Warning: tag "' + args[tagIdx + 1] + '" not found, skipping')
    }
  }

  const parts = []
  if (estimation) parts.push(estimation + ' pts')
  if (priority) parts.push(Object.keys(priorityMap).find((k) => priorityMap[k] === priority))
  if (assignee) parts.push('assigned to me')
  const suffix = parts.length > 0 ? ' (' + parts.join(', ') + ')' : ''

  console.log('✓ Created ENG-' + newNumber + ' "' + title + '"' + suffix)
}

async function resolveEmployee (client, account) {
  const contact = require('@hcengineering/contact').default
  const persons = await client.findAll(contact.class.Person, {})
  // Match by social ID from account
  const socialIds = account.socialIds || []
  for (const person of persons) {
    // Person._id is the employee ID if they have the Employee mixin
    // Check if any social identity matches
    const socialIdentities = await client.findAll(contact.class.SocialIdentity, {
      attachedTo: person._id
    })
    for (const si of socialIdentities) {
      if (socialIds.includes(si._id)) {
        return person._id
      }
    }
  }
  throw new Error('Could not resolve your employee ID. Make sure your Huly account is linked.')
}

async function addComment (client, issue, text) {
  await client.addCollection(
    chunter.class.ChatMessage,
    issue.space,
    issue._id,
    tracker.class.Issue,
    'comments',
    {
      message: JSON.stringify({
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text, marks: [] }]
        }]
      })
    }
  )
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
