# Shape

> From pbakaus/impeccable `reference/shape.md`, Apache-2.0, commit 9368675. Pulse changes: Phase 2 uses the FE guide and the `design-decision` skill instead of impeccable's new-work flow; the brief is saved to `docs/design/`.
>
> **In Pulse, whoever runs this as a subagent (e.g. `ux-designer`) never asks the owner directly.** "Ask", "confirm" and "run `design-decision`" below mean: return the questions or the `DECISION NEEDED` block to the main session, which asks the owner (through `design-decision` once it exists, otherwise directly) and resumes the subagent.

Discover what should be made and how it should work, then return a confirmed design brief without code.

## Phase 1: Discovery interview

Do not write code or choose visual direction yet.

### Cadence

- Use the structured question tool when available; otherwise ask and stop.
- Ask two or three related questions per round, then wait. One round is the default; add a second only when the answers expose a material gap.
- Do not dump a questionnaire, repeat settled facts, or turn obvious facts into menus. Assert the likely reading and invite correction.
- A sparse prompt requires at least one answer round. A precise prompt may need only a compact confirmation.

### Round 1: purpose, people, and outcome

Choose the two or three questions that most change the result:

- What is this surface or feature for, and what problem must it solve?
- Who specifically reaches it, in what situation and state of mind?
- What is the primary thing they must understand or do? What would success look like?
- What is uniquely true here that a neighboring product or generic template could not claim?

### Round 2: material, behavior, and boundaries

Run only for material unresolved decisions:

- What real content, evidence, data, and assets must the experience carry? What are realistic minimum, typical, and maximum ranges?
- Which states and transitions matter: first-run, empty, loading, error, success, permissions, overflow, or expert use?
- What is the intended fidelity, breadth, and interactivity: exploration, production-ready screen, full flow, or broader surface?
- What must remain untouched? What would make the result feel wrong even if it looked polished?
- Which platform, framework, performance, accessibility, localization, or delivery constraints are binding?

Never ask for CSS values or canned aesthetic lanes. Answer from the spec (section 10) and `docs/FE_GUIDE.md` first; ask only what they leave open.

## Phase 2: Resolve the design direction

Apply every rule the FE guide already has. For each design or flow decision it does not cover, run the `design-decision` skill: options for the owner, a recommendation, the owner's choice recorded in the guide. Never pick a new pattern silently.

## Phase 3: Write the brief

Write the smallest useful brief:

1. **Job and audience:** who arrives, their context and need.
2. **Outcome and proof:** primary task/action, success, real evidence, and product-specific truth.
3. **Selected direction:** visual authority, structural/interaction thesis, sequence, focal moment, and implementation consequence.
4. **Scope and boundaries:** fidelity, breadth, interactivity, named target, what remains untouched, and explicit anti-goals.
5. **States and ranges:** realistic content/data ranges and material states.
6. **Interaction and layout:** hierarchy, topology, responsiveness, affordances, feedback, and transitions; intent, not CSS.
7. **Constraints and open decisions:** platform, delivery, accessibility, localization, reusable components, and choices a builder must not invent.

Use three to five bullets when the task is settled; use the full structure only for ambiguous, multi-screen, or standalone planning. Do not restate the conversation.

## Confirm and stop

Present the brief for explicit confirmation or one correction round, save it as `docs/design/<task-id>-<slug>.md`, then stop: shape never writes code.

When no human or structured answer mechanism exists, mark assumptions plainly, return the brief, and stop.
