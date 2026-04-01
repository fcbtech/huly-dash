const { connect, connectRest } = require('@hcengineering/api-client')

// Configuration — fill in your credentials
const HULY_URL = process.env.HULY_URL || 'https://huly.app'
const HULY_EMAIL = process.env.HULY_EMAIL || ''
const HULY_PASSWORD = process.env.HULY_PASSWORD || ''
const HULY_TOKEN = process.env.HULY_TOKEN || ''
const HULY_WORKSPACE = process.env.HULY_WORKSPACE || ''

async function main() {
  const authOptions = HULY_TOKEN
    ? { token: HULY_TOKEN, workspace: HULY_WORKSPACE }
    : { email: HULY_EMAIL, password: HULY_PASSWORD, workspace: HULY_WORKSPACE }

  // WebSocket client (persistent connection)
  const client = await connect(HULY_URL, authOptions)

  console.log('Connected to Huly:', HULY_URL)

  // Example: find all spaces
  // const spaces = await client.findAll(core.class.Space, {})
  // console.log('Spaces:', spaces)

  await client.close()
}

main().catch(console.error)
