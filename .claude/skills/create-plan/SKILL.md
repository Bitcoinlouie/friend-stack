---
name: create-plan
description: Creates a codebase-grounded implementation plan in documentation/plan-<slug>.md from an explicitly identified intent. Use only when the user explicitly invokes /create-plan.
disable-model-invocation: true
---

# Create Plan

Turn an agreed intent into an implementation-ready plan grounded in the
repository's current code, conventions, and tests.

## Implementation, not measurement validation

A plan implements a FEATURE. It does not validate a measurement. Calibration,
threshold tuning, agreement studies, and deciding whether an indicator tracks
the construct it claims to are separate research efforts developed later under
their own intent and plan.

- The plan's tests validate the IMPLEMENTATION: that the code behaves as
  specified, at its boundaries, without regressing what exists. They make no
  claim that the resulting measurement is calibrated or valid, and the plan
  must not imply they do.
- Never plan new calibration runs, validation studies, or measurement harnesses
  to prove an indicator is right. Only the user can add those to scope, by
  asking for them specifically. Running EXISTING suites as regression gates is
  normal verification and stays.
- Every planned test costs review time and gate time forever. The test list is
  a decision the user confirms, not a detail the plan buries.
- Compute is not a constraint (§0.6). Never trim runs, repeats, or trials to
  save tokens or time; if an approach needs more, plan for more and say so.

## Output integrity — designed in, not hoped for (§0.5)

A plan that lets the tool present something untrue is worse than no plan. For
every output the change can emit, answer both: *could this be shown when it
isn't true, and what real step must have happened for it to be valid?* The
second answer must be enforced in code the plan names — not merely intended.

- The plan carries an explicit integrity section listing the risks it found and
  the mechanism that closes each one.
- Watch for the recurring four: sample or illustrative data reaching the real
  path; a displayed number kept in a second copy of a formula; a skipped or
  failed input that silently improves a score; a caveat that exists in prose but
  not in the output.
- One source of truth per rule. If the change introduces a second place a grade,
  threshold, or status can be computed, the plan says why and how they are
  pinned together.
- Where a guard is what keeps an output honest, the plan pins it with a test in
  `implementation/tests/test_integrity_guards.py` or
  `implementation/service/tests/test_integrity.py`, alongside the existing ones.

## Non-negotiable workflow

1. Always ask the user to identify the source intent file. Do not infer it.
2. Read the complete intent, `CLAUDE.md`, `documentation/LAS.md` (canon) and
   `documentation/RECAP.md`.
3. Investigate before planning:
   - Read related plans and design docs.
   - Trace the relevant code paths, types, data flow, persistence boundaries,
     UI states, and integration points.
   - Locate existing tests, evaluation suites, fixtures, scripts, and
     analogous implementations.
   - Inspect relevant recent development when it affects the current state.
   - Verify every path, symbol, behavior, and command named in the plan.
4. Always ask focused questions before writing:
   - Resolve ambiguities or contradictions in the intent.
   - Confirm implementation constraints, compatibility or migration needs,
     scope boundaries, delivery sequencing, and required proof.
   - Present the proposed test list for explicit confirmation: name each new
     or changed test file, what it validates about the implementation, what it
     deliberately does NOT cover (calibration, whether the measurement is
     valid), and any material cost it adds to the repository gate.
   - Present the integrity risks found and the mechanism closing each one, and
     ask the user to confirm none is missing.
   - Propose codebase-supported choices when useful, but ask the user to
     decide; never silently choose.
   - Confirm the `documentation/plan-<slug>.md` path and whether an existing
     file may be replaced.
   - If everything appears settled, summarize the proposed implementation
     direction and ask the user to confirm it.
5. Wait for the answers. Do not write the plan in the same turn as the
   questions.
6. Create or revise the confirmed `documentation/plan-<slug>.md`.
7. Audit the finished plan against the intent and repository. Remove guesses,
   stale references, vague tasks, and untestable completion claims.

Use structured questions when choices are known. Ask conversationally when the
answer needs explanation. Ask only questions whose answers are not already
available in the repository.

## Document standard

The plan must say exactly how the intent will come to life in this codebase
without implementing it.

Use this shape when applicable:

```markdown
# Plan — <short title>

Implements [<intent name>](<relative path>).

## Outcome
<Concrete end state and explicit non-goals.>

## Phase 1 — <coherent implementation slice>
### `<path>` — `<symbol or responsibility>`
- Exact behavior, data-model, API, state, and integration changes.
- Edge cases, failure behavior, compatibility, and migration requirements.

## Integrity risks (§0.5)
- <Output that could be shown untrue> — <the code that prevents it, and the
  test that pins it.>

## Verification
### Tests
- Exact test files and cases to add or update, and the command that runs them:
  `python3 -m unittest discover implementation/tests`,
  `python3 tests/test_integrity.py` (from `implementation/service/`).
### Real-run verification
- The actual run that proves the change, its vantage point, and the observable
  outcome that counts as passing. A real output exists only after the run that
  produced it.

## Delivery order
1. Dependency-aware sequence with independently verifiable slices.

## Done
- Observable, testable completion criteria traced to the intent.
```

Adapt headings to the work; do not add empty boilerplate.

## Planning rules

- Name exact files and symbols where the repository supports that precision.
- Explain contracts and interactions, not merely “update” or “refactor.”
- Separate verified current state from proposed changes.
- Preserve established architecture unless the intent requires changing it.
- Call out migrations, backward compatibility, cleanup, and rollout when they
  are genuinely relevant.
- Include tests for normal behavior, boundaries, regressions, and failures —
  implementation proof only, never a claim that a measurement is calibrated.
- Include applicable EXISTING repository test suites and rendered-output
  inspection as regression gates; do not invent new evaluation suites.
- Where a run is part of the proof, name its vantage point (residential or
  cloud, and where) — vantage is part of the measurement, and one results file
  never mixes two.
- Plain language (§0.11): say what happens in ordinary words; explain in-house
  shorthand on first use or drop it.
- Make phases coherent implementation slices, not arbitrary file groupings.
- Do not hide unresolved decisions in implementation language. Ask first; if
  the user explicitly defers one, mark it as a blocker or named open decision.

## Handoff

After writing, report the plan path and summarize any explicit blockers or
deferred decisions. Do not begin implementation unless the user asks.
