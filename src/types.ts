export interface IssueRow {
  identifier: string
  title: string
  status: string
  statusCategory: 'todo' | 'active' | 'done' | 'cancelled' | 'backlog'
  assignee: string | null
  priority: string
  estimation: number
  milestone: string | null
  dueDate: string | null
  createdOn: string | null
  modifiedOn: string
}

export interface IssueDetail extends IssueRow {
  description: string | null
  project: string
  number: number
}

export interface ProjectRow {
  identifier: string
  name: string
  description: string
  issueCount?: number
}

export interface ProjectDetail extends ProjectRow {
  memberCount: number
  openIssues: number
  closedIssues: number
}

export interface MilestoneRow {
  label: string
  status: string
  targetDate: string
  pctComplete: number
  ptsDone: number
  ptsTotal: number
  project: string
}

export interface MilestoneDetail extends MilestoneRow {
  openIssues: number
  closedIssues: number
}

export interface MemberRow {
  name: string
  email: string
  role: string
  active: boolean
}
