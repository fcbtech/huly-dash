const tags = require('@hcengineering/tags').default

const TAG_CATEGORIES = {
  features: ['new-feature'],
  bugs: ['issue-bug', 'issue-production-bug', 'issue-staging-bug'],
  techDebt: ['ia-tech-debt', 'code-refactor'],
  tasks: ['task', 'ad-hoc'],
  research: ['research']
}

// Priority order for when an issue has multiple category tags
const CATEGORY_PRIORITY = ['bugs', 'features', 'techDebt', 'tasks', 'research']

// Reverse lookup: tag title → category
const TAG_TO_CATEGORY = {}
for (const [category, tagTitles] of Object.entries(TAG_CATEGORIES)) {
  for (const title of tagTitles) {
    TAG_TO_CATEGORY[title] = category
  }
}

async function fetchTagMap (client) {
  const tagRefs = await client.findAll(tags.class.TagReference, {})
  const map = new Map()
  for (const ref of tagRefs) {
    if (!map.has(ref.attachedTo)) {
      map.set(ref.attachedTo, [])
    }
    map.get(ref.attachedTo).push(ref.title)
  }
  return map
}

function categorizeIssue (issueTags) {
  if (!issueTags || issueTags.length === 0) return 'other'
  for (const category of CATEGORY_PRIORITY) {
    if (issueTags.some((t) => TAG_CATEGORIES[category].includes(t))) {
      return category
    }
  }
  return 'other'
}

function isBugTag (issueTags) {
  if (!issueTags) return false
  return issueTags.some((t) => TAG_CATEGORIES.bugs.includes(t))
}

module.exports = { TAG_CATEGORIES, CATEGORY_PRIORITY, fetchTagMap, categorizeIssue, isBugTag }
