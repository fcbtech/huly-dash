import { type PlatformClient } from '@hcengineering/api-client'
import contact, { type Person } from '@hcengineering/contact'
import type { MemberRow } from '../types'

function formatName (name: string | undefined): string {
  if (!name) return 'Unknown'
  if (name.includes(',')) {
    const [last, first] = name.split(',')
    return `${first} ${last}`.trim()
  }
  return name
}

export async function listMembers (client: PlatformClient): Promise<MemberRow[]> {
  const persons = await client.findAll(contact.class.Person, {})

  return persons.map((p) => ({
    name: formatName(p.name),
    email: '',
    role: 'member',
    active: true
  }))
}
