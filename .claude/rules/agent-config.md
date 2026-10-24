---
paths:
  - ".claude/**"
  - "CLAUDE.md"
  - "docs/AGENTIC_SETUP.md"
---

# Editing the agent setup

- **Project-local only.** Skills, agents, rules, hooks and settings for Pulse live in this repo's `.claude/`; never write to `~/.claude/` or other user-level locations.
- **Where guidance goes:**
  - `CLAUDE.md`: only what every session needs, whatever files it touches. Keep it short.
  - `.claude/rules/*.md`: guidance for an area. Scope it with frontmatter `paths:` as a YAML list of **quoted** globs (verified 2026-10-24: the rule loads only after a matching file is read). A rule without `paths:` loads in every session, so it must be worth that cost.
  - Skills: procedures that run on demand. Subagents (`.claude/agents/`): roles with their own prompt and tools.
- **Third-party skills, agents and code:** follow `find-skills`' read-before-install steps, keep the licence next to the copy, and record source, commit, licence and Pulse changes in `.claude/THIRD_PARTY.md`.
- **Hooks:** pipe-test the command with a synthetic payload before wiring it, then prove it fires. A settings file created mid-session may need `/hooks` or a restart before Claude Code watches it. After changing anything in `.claude/hooks/`, run `node --test .claude/hooks/guards.test.js .claude/hooks/session-hooks.test.js` and add a case for the new behaviour. Write hook code with the Write/Edit tools, not shell heredocs (see `docs/knowledge/agent-tooling-gotchas.md`).
- **Checklist:** when an item of `docs/AGENTIC_SETUP.md` lands, tick it with what was verified and the commit hash, then run `bash scripts/check-docs.sh`.
