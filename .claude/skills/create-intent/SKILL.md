---
name: create-intent
description: Creates or revises documentation/intent-<slug>.md from raw product or implementation ideas. Use only when the user explicitly invokes /create-intent.
disable-model-invocation: true
---

# Create Intent

Turn rough ideas into a short, human-readable intent that can be discussed and
revised before implementation planning.

## Implementation, not measurement validation

An intent describes a FEATURE to build. It is not a validation brief for that
feature. Validating a measurement — calibrating thresholds, checking an
indicator against real subjects, judging whether a score tracks the construct
it claims to — is a research effort in its own right, performed later under its
own intent. Indicators and thresholds are frozen before a validation run
(`CLAUDE.md`, run discipline); an intent that quietly changes one invalidates
the runs that used it.

- Do not fold calibration targets, threshold changes, or validation-run
  outcomes into a feature intent. If the raw idea contains them, name them
  plainly as later validation work and keep them out of the feature's success
  criteria.
- Never propose new calibration runs, validation studies, or agreement
  experiments. Only the user can put those in scope, by asking for them
  specifically.

## Output integrity — before writing anything (§0.5)

The intent must name every way the proposed feature could show a reader
something untrue: illustrative or sample data that could render as a real
result, a number displayed that is not the number computed, a skipped or failed
input that silently improves a score, a caveat that lives in prose but not in
the output.

- State those risks explicitly, in the intent and in chat. A risk nobody named
  is a risk nobody looked for.
- Say what the feature does NOT measure. "Not measured" is a state to surface,
  never a zero and never an omission.
- Success criteria must be honest about the evidence: no grade a partial run
  cannot support, no precision the measurement does not have.

## Non-negotiable workflow

1. Inspect before asking:
   - Read `CLAUDE.md`, `documentation/LAS.md` (canon: goal, methodology,
     indicator registry) and `documentation/RECAP.md`.
   - Read any existing intent for this work in `documentation/`.
   - Search relevant docs, code, tests, and recent development for the ideas
     the user supplied. Exhaust the source data before reasoning about what is
     missing (§0.7); if anything within reach is left unread, say so.
   - Distinguish verified current behavior from proposals.
2. Always ask the user focused questions before writing or editing the file.
   Never fill a gap with a guess.
   - Clarify the problem, desired outcome, user-visible behavior, scope,
     non-goals, constraints, and what success looks like.
   - Surface conflicts between the request and the repository.
   - If the input appears complete, summarize the intended interpretation and
     ask the user to confirm it.
   - Confirm the `documentation/intent-<slug>.md` path and whether an existing
     file may be replaced.
3. Wait for the answers. Do not write the intent in the same turn as the
   questions.
4. Create or revise the confirmed `documentation/intent-<slug>.md`.
5. Re-read the result and remove assumptions, implementation-plan detail,
   repetition, and unsupported claims.

Use structured questions when choices are known. Ask conversationally when the
answer needs explanation. Ask only questions whose answers are not already
available in the repository.

## Document standard

The intent records **what should become true and why**, not a file-by-file
implementation.

- Start with `# Intent — <short title>`.
- Open with one concise paragraph naming the problem and desired change.
- Organize the body around the few product or system ideas that matter.
- State agreed rules, boundaries, tradeoffs, and non-goals plainly.
- Refer to verified current behavior or paths only when they clarify the
  proposal.
- End with a concrete description of what success looks like when useful.
- Keep unresolved decisions visible only when the user explicitly chooses to
  defer them.
- Prefer prose and short bullets. Use the shortest document that preserves the
  agreed meaning.
- Plain language (§0.11): describe what happens in ordinary words. In-house
  shorthand — pillar letters, variant codes, rung names — gets explained on
  first use or dropped. A competent reader who has not been in the room must be
  able to follow every sentence.

Do not include phases, task checklists, exhaustive file lists, guessed APIs, or
a test matrix. Those belong in `/create-plan`.

## Handoff

After writing, report the path and briefly name any deliberately unresolved
questions. Invite discussion and iteration; do not begin implementation or
create a plan unless the user asks.
