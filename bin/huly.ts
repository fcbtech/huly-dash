import { program } from 'commander'
import { registerAuthCommand } from '../src/commands/auth'
import { registerIssueCommand } from '../src/commands/issue'
import { registerProjectCommand } from '../src/commands/project'
import { registerMilestoneCommand } from '../src/commands/milestone'
import { registerMemberCommand } from '../src/commands/member'

program
  .name('huly')
  .description('General-purpose CLI for Huly workspaces')
  .version('0.1.0')
  .option('--url <url>', 'Huly instance URL (overrides config)')
  .option('--workspace <name>', 'Workspace name (overrides config)')

registerAuthCommand(program)
registerIssueCommand(program)
registerProjectCommand(program)
registerMilestoneCommand(program)
registerMemberCommand(program)

program.parseAsync().catch((err: any) => {
  console.error(err.message || err)
  process.exit(1)
})
