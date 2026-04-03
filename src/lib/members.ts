import { type PlatformClient } from '@hcengineering/api-client'
import contact, { type Employee } from '@hcengineering/contact'
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
  const employees = await client.findAll(contact.class.Employee, {})

  return employees.map((emp) => ({
    name: formatName(emp.name),
    email: '', // email is stored in channels, not directly on Employee
    role: emp.role || 'USER',
    active: emp.active
  }))
}
