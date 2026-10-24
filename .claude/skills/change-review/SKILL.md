---
name: change-review
description: "Review a change along two axes in parallel sub-agents: Standards (does it follow Pulse's documented standards?) and Spec (does it do what its task asked, no more, no less?). Used by the auto-commit gate before every commit except trivial docs edits; also when the user asks to review work in progress or 'review since X'."
---

> Adapted from mattpocock/skills `code-review` (MIT, commit 5beb35b; licence in this folder). Changes: renamed (the built-in `/code-review` exists); defaults to reviewing the files of an uncommitted change; uses `docs/REBUILD_SPEC.md` / `docs/AGENTIC_SETUP.md` rows as the spec and Pulse's rules as standards; returns a block / pass verdict for `auto-commit`.

Two-axis review of a change:

- **Standards**: does the code conform to this repo's documented standards?
- **Spec**: does the change faithfully implement the task it belongs to?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

## Process

### 1. Pin the change

- Default (called from `auto-commit`): the uncommitted files that belong to the task; `auto-commit` passes their paths. Diff command: `git diff HEAD -- <paths>`, plus the new files among them (`git ls-files --others --exclude-standard -- <paths>` lists files individually); the sub-agents read new files whole. Without a path list, use all uncommitted work.
- If the user names a fixed point (SHA, branch, `HEAD~3`): `git diff <fixed-point>...HEAD` and `git log <fixed-point>..HEAD --oneline`.

Confirm that any ref resolves (`git rev-parse`) and that the change is non-empty (the diff **or** the new-file list) before spawning sub-agents.

### 2. Identify the spec source

The spec is the task the change implements:

1. The task / item IDs given by the caller (`auto-commit` passes them), e.g. `T1.4`, `A1.8`.
2. Otherwise IDs in the commit messages or the user's request.
3. Pull **only the relevant rows**: the task row from `docs/REBUILD_SPEC.md` section 12 (including "Done when"), the feature rows and `R-xx` rules it cites; or the item from `docs/AGENTIC_SETUP.md`. Do not paste the whole spec.
4. If no task can be identified, use the user's request in this session as the spec. If even that is unclear, skip the Spec sub-agent, say so in the report, and decide the verdict on Standards alone.

### 3. Identify the standards sources

Every file that documents how code is written here, as far as it exists and applies to the touched paths: `CLAUDE.md`, the matching `.claude/rules/*.md`, `docs/ARCHITECTURE.md`, `docs/FE_GUIDE.md` (UI changes), the Pulse overrides at the top of stack skills that the change touches, and the `code-review-and-quality` skill as the general rubric.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

For a change with **no executable code** (docs, rules, agent or skill definitions) one sub-agent may cover both axes, as long as it gets both briefs and reports under both headings. Code, tests, hooks and build config always get two separate sub-agents.

Issue both sub-agent calls together and wait until both have returned before aggregating. Tell both: the commit hash in a checklist tick and anything else that only exists after committing is **not** a finding.

**Standards sub-agent prompt** should include:

- The diff command and the untracked-file list (or commit list).
- The list of standards-source files from step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and the untracked-file list (or commit list).
- The relevant spec rows from step 2, pasted.
- The brief: "Report: (a) requirements the task asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec row for each finding. Under 400 words."

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes.

### 6. Verdict (for `auto-commit`)

- **Block** if there is any hard standards violation, or any Spec finding of type (a) missing or (c) wrong. Fix, re-verify, then review again.
- **Pass with notes** for judgement-call smells and scope-creep findings: mention them in the report to the user; fix the cheap ones before committing.
- **Ask the user** when you believe a blocking finding is a false positive, or when the round limit of the caller (`auto-commit`: 3 rounds in total) runs out. Never commit over an unresolved block.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the task asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
