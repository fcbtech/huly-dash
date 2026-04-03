import { type PlatformClient } from '@hcengineering/api-client'
import core, { type Ref, type Status, type StatusCategory } from '@hcengineering/core'
import task from '@hcengineering/task'

export interface StatusInfo {
  _id: Ref<Status>
  name: string
  category: Ref<StatusCategory> | undefined
}

const CATEGORY_LABELS: Record<string, string> = {}

export async function buildStatusMap (client: PlatformClient): Promise<Map<string, StatusInfo>> {
  const statuses = await client.findAll(core.class.Status, {})
  const map = new Map<string, StatusInfo>()

  for (const s of statuses) {
    map.set(s._id, {
      _id: s._id,
      name: s.name,
      category: s.category
    })
  }

  return map
}

export function categoryLabel (category: Ref<StatusCategory> | undefined): string {
  if (!category) return 'unknown'
  if (category === task.statusCategory.Won) return 'done'
  if (category === task.statusCategory.Lost) return 'cancelled'
  if (category === task.statusCategory.Active) return 'active'
  if (category === task.statusCategory.ToDo) return 'todo'
  if (category === task.statusCategory.UnStarted) return 'backlog'
  return 'unknown'
}

export function getWonStatusIds (statusMap: Map<string, StatusInfo>): Set<string> {
  const ids = new Set<string>()
  for (const [id, info] of statusMap) {
    if (info.category === task.statusCategory.Won) {
      ids.add(id)
    }
  }
  return ids
}

export function findStatusByName (
  statusMap: Map<string, StatusInfo>,
  name: string
): StatusInfo | undefined {
  const lower = name.toLowerCase()
  for (const info of statusMap.values()) {
    if (info.name.toLowerCase() === lower) {
      return info
    }
  }
  return undefined
}
