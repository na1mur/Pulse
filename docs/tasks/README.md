# Task files

One file per spec task being delivered (`docs/tasks/<task-id>.md`), written by the `deliver-task` skill. It is the task's memory: anyone (human or agent) can pick a task up from its file. The ledger (`LEDGER.md`) shows the status of every task started.

## Template

```markdown
# <task-id> - <task title>

Status: in progress | in QA | blocked | done
Owner agents: <backend-engineer, core-engineer, ...>

## Brief
<spec rows pasted by `node scripts/spec.mjs`, "Done when" verbatim; open decisions it depends on>

## Design
<link to docs/design/... and FE-NNN decisions made, UI tasks only>

## Plan
### Slices
1. <slice> - <agent> - <how it is tested>
### Interfaces
<contract changes, signatures, events, files>
### Review focus
<riskiest rules and edge cases>

## Reports
<each agent's report and fix reports, appended in order>

## QA
<link to docs/qa/<task-id>.md and verdicts per round>
```
