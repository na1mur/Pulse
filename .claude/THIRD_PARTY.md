# Third-party agent assets

Everything here was read in full (or its scripts and network calls checked) before installing; nothing runs code fetched at runtime. Licences are kept next to each copy. Update this file whenever an asset is added, changed or removed.

| Asset | Path | Source @ commit | Licence | Pulse changes |
|---|---|---|---|---|
| 13 engineering skills: test-driven-development, debugging-and-error-recovery, incremental-implementation, api-and-interface-design, frontend-ui-engineering, security-and-hardening, performance-optimization, code-review-and-quality, planning-and-task-breakdown, documentation-and-adrs, ci-cd-and-automation, observability-and-instrumentation, source-driven-development | `.claude/skills/<name>/` | addyosmani/agent-skills @aeac41d | MIT | none; precedence rules in `CLAUDE.md` |
| `find-skills` | `.claude/skills/find-skills/` | vercel-labs skills CLI helper (local `~/.agents/skills` copy) | see source | installs project-locally; read-before-install steps; no `npx skills add`, no `-g` |
| `change-review` | `.claude/skills/change-review/` | mattpocock/skills `code-review` @5beb35b | MIT | renamed; reviews the task's uncommitted files; Pulse spec rows as spec, Pulse rules as standards; block/pass/ask verdict for `auto-commit` |
| `tauri-v2` | `.claude/skills/tauri-v2/` | nodnarbnitram/claude-code-extensions @35e7f7d | MIT | none |
| `svelte5-best-practices` | `.claude/skills/svelte5-best-practices/` | ejirocodes/agent-skills @6e805e4 | MIT | SvelteKit and Svelte 4 migration references removed |
| `mobile-android-design` | `.claude/skills/mobile-android-design/` | wshobson/agents @0874a27 | MIT | none |
| `postgresql-table-design` | `.claude/skills/postgresql-table-design/` | wshobson/agents @0874a27 | MIT | Pulse overrides: UUID v7 keys, exclusion constraint, partial unique index |
| `rust-best-practices` | `.claude/skills/rust-best-practices/` | apollographql/skills @f9843dc | MIT | none |
| `nestjs-best-practices` | `.claude/skills/nestjs-best-practices/` | kadajett/agent-nestjs-skills @3986e0c | MIT (frontmatter) | Pulse overrides: zod contract validation, no TypeORM, UUIDs, plain WebSocket |
| `playwright-best-practices` | `.claude/skills/playwright-best-practices/` | currents-dev/playwright-best-practices-skill @283d5cb | MIT | none; for Svelte UI in a browser only (desktop E2E uses WebdriverIO + tauri-driver) |
| Hook parser `block-no-verify.js`, `lib/shell-scan.js`; `config-protection.js` | `.claude/hooks/vendor/ecc/` | affaan-m/ecc @90606c8 | MIT | marked "Pulse extension": destructive-push detection (skipped for unparsed prose), push reporting, command inspector for parsed commands; `config-protection.js`: `require.main` guard, Rust/Kotlin configs. Pulse's own code (`guard-*.js`, `lib/hook-io.js`, `lib/secrets.js`, tests) is not third-party. |
