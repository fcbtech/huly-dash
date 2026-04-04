#!/usr/bin/env node

/**
 * CLI tool to update Huly issues from git hooks and shell scripts.
 *
 * Usage:
 *   node huly-update.js dev-start ENG-14826
 *   node huly-update.js in-review ENG-14826 --pr "https://github.com/fcbtech/tranzact-v2/pull/5060"
 *   node huly-update.js done ENG-14826
 *   node huly-update.js comment ENG-14826 "Deployed to staging"
 */

if (!globalThis.fetch) {
  globalThis.fetch = require('node-fetch')
}

const { connect } = require('@hcengineering/api-client')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const tracker = require('@hcengineering/tracker').default
const core = require('@hcengineering/core').default
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

  if (!command || !issueRef) {
    console.error('Usage: huly-update <command> <ENG-XXXX> [options]')
    console.error('Commands: dev-start, pr-created, pr-merged, in-review, done, qa-start, released, comment')
    process.exit(1)
  }

  const issueNumber = parseInt(issueRef.replace(/^ENG-/i, ''), 10)
  if (isNaN(issueNumber)) {
    console.error('Invalid issue reference:', issueRef)
    process.exit(1)
  }

  const url = process.env.HULY_URL || 'https://huly.app'
  const workspace = process.env.HULY_WORKSPACE
  const authOptions = process.env.HULY_TOKEN
    ? { token: process.env.HULY_TOKEN, workspace }
    : { email: process.env.HULY_EMAIL, password: process.env.HULY_PASSWORD, workspace }
  const client = await connect(url, authOptions)

  try {
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
        // PR opened — set Dev End Actual, add comment. Status stays In Progress.
        const prUpdates = { [CUSTOM_FIELDS.devEndActual]: todayMs }
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, prUpdates)
        console.log('✓ ENG-' + issueNumber + ' Dev End Actual set')

        const prIdx2 = args.indexOf('--pr')
        if (prIdx2 !== -1 && args[prIdx2 + 1]) {
          await addComment(client, issue, 'PR opened: ' + args[prIdx2 + 1])
          console.log('✓ PR comment added')
        }
        break
      }

      case 'pr-merged': {
        // PR merged — move to In Review (ready for QA), set Dev End Actual if not set
        const mergeUpdates = { status: STATUS_IDS.inReview }
        if (!issue[CUSTOM_FIELDS.devEndActual]) {
          mergeUpdates[CUSTOM_FIELDS.devEndActual] = todayMs
        }
        await client.updateDoc(tracker.class.Issue, issue.space, issue._id, mergeUpdates)
        console.log('✓ ENG-' + issueNumber + ' → In Review (ready for QA)')

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

      default:
        console.error('Unknown command:', command)
        console.error('Commands: dev-start, pr-created, pr-merged, in-review, done, qa-start, released, log-time, estimate, comment')
        process.exit(1)
    }
  } finally {
    await client.close()
  }
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
