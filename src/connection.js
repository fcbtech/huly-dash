const { connect } = require('@hcengineering/api-client')
require('dotenv').config()

async function createConnection (options = {}) {
  const url = options.url || process.env.HULY_URL || 'https://huly.app'
  const workspace = options.workspace || process.env.HULY_WORKSPACE
  const token = process.env.HULY_TOKEN
  const email = process.env.HULY_EMAIL
  const password = process.env.HULY_PASSWORD

  if (!workspace) {
    throw new Error('Missing HULY_WORKSPACE. Set it in .env or pass --workspace.')
  }

  const authOptions = token
    ? { token, workspace }
    : { email, password, workspace }

  if (!token && (!email || !password)) {
    throw new Error('Missing credentials. Set HULY_TOKEN or HULY_EMAIL + HULY_PASSWORD in .env.')
  }

  const client = await connect(url, authOptions)
  return client
}

module.exports = { createConnection }
