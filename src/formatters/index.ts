import { formatJson } from './json'

export { formatJson } from './json'
export {
  formatIssueList,
  formatIssueDetail,
  formatProjectList,
  formatProjectDetail,
  formatMilestoneList,
  formatMilestoneDetail,
  formatMemberList
} from './table'

export function output (data: unknown, formatted: string, json: boolean): void {
  if (json) {
    console.log(formatJson(data))
  } else {
    console.log(formatted)
  }
}
