---
name: design-decision
description: Settle a UI design or flow question with the owner and record it in docs/FE_GUIDE.md so it is reused everywhere. Use whenever building or designing Pulse UI raises a choice the FE guide does not answer (layout, component behaviour, wording, interaction, state handling), when the ux-designer agent returns a DECISION NEEDED block, or when the owner asks to decide something about the UI.
---

# Design decision

Pulse's look and behaviour are decided by the owner, once, and then reused. This skill is the loop: check the guide, ask with options, apply, record.

## 1. Check before asking

Read `docs/FE_GUIDE.md` (the relevant sections, the decision log and open questions) and spec section 10. If a rule already covers the question, apply it, cite it (`FE-NNN` or the spec ID) and stop. Do not re-ask decided questions, and do not ask about things the spec already fixes.

## 2. Frame the decision

- **Question:** one sentence, in product terms ("How does the Log show a session that crosses midnight?"), not CSS.
- **Context:** where it appears, what the user is doing there, which spec rules constrain it.
- **Scope of reuse:** the kind of component or flow the answer will govern from now on ("every destructive row action", "all empty states"). A decision that only fits one screen is usually framed too narrowly.

## 3. Prepare options

2-4 genuinely different options, each with a short name, a one-line trade-off, and a preview:

- **ASCII preview** in the question's `preview` field for layout and flow choices;
- **live variants** with the `prototype` skill when the choice has to be seen or felt (desktop);
- **a mockup artifact** (static HTML, Material-style for Android) when neither fits.

Put the recommended option first and label it "(Recommended)", with the reason rooted in the spec, the existing guide and frequency of use. Check every option against accessibility (spec 9.4) and the size/performance budgets before offering it.

## 4. Ask the owner

- In the main session: use AskUserQuestion with the options and previews. Batch related decisions (up to 4 questions) instead of interrupting repeatedly.
- In a subagent (e.g. `ux-designer`): do not ask; return a `DECISION NEEDED` block (question, context, options with previews, recommended, applies to) to the main session.
- **Owner not available** (working unattended): do not decide. Add the question to "Open questions" in the guide, keep the work to what does not depend on it, and report it.

The owner may pick an option or describe another; their words win.

## 5. Apply and record

1. Apply the choice in the work at hand.
2. Add a row to the decision log (section 10): next `FE-NNN` ID, absolute date, the decision, the options considered, the choice, and what it applies to.
3. Write or update the reusable rule in the matching section of the guide as one short imperative line citing the ID, e.g. `- Destructive row actions use undo, not a confirmation dialog (FE-004).` Replace any "_Owner decisions:_ none yet" marker in that section.
4. If the decision changes tokens or a component's states, update sections 2-3 as well, and mention any existing UI that now contradicts the guide.
5. Remove the question from "Open questions" if it was listed there.

## 6. Commit

Guide changes are committed with the work that triggered them, through the `auto-commit` gate. A decision-only change (no code) is a docs commit: `Record FE-NNN: <decision>.`
