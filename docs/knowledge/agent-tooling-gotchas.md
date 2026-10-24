# Agent tooling gotchas

Facts about Claude Code and this Windows + Git Bash setup that each cost a debugging round once (2026-10-24).

- **Backslashes through the Bash tool:** writing a file with a heredoc via the Bash tool turned `\\` into `\` (regexes like `/[\\/]/` broke). Write code with the Write/Edit tools, not shell heredocs.
- **New skills mid-session:** a skill folder created during a session may not be invocable until Claude Code rescans (it appeared after a while, or after a restart). New agents appeared immediately. Settings deny rules applied immediately.
- **Path-scoped rules:** `.claude/rules/*.md` with a `paths:` list of quoted globs load only after a matching file is read (verified with headless `claude -p` runs).
- **Hook payload paths:** Bash commands arrive with Git Bash paths (`/c/Users/...`, `/tmp`); Node on Windows resolves those onto the current drive unless converted (see `toNativePath` in `.claude/hooks/guard-bash.js`). `os.tmpdir()` can be an 8.3 short path.
- **Shell parser roles:** in the vendored ECC parser, role kind `opaque` means "unknown program", not "unparsed text"; unparsed text is `task.opaque`.
- **`claude -p` with `--allowedTools Read`:** the variadic flag swallows the prompt; use `--allowedTools=Read` after the prompt.
