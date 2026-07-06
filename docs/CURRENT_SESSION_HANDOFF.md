# Current Session Handoff

Compact restart summary so a new session can get oriented without pasting long
chat history. This is for **context compaction only** — the roadmap source of
truth is `docs/QUOTE_ENGINE_BATCH_PLAN.md`.

## Read these first

- `docs/QUOTE_ENGINE_BATCH_PLAN.md` — approved batch roadmap (source of truth)
- `docs/GOLDEN_QUOTE_RUNNER.md` — how the golden runner + pipeline-backed tests work
- `docs/QUOTE_ENGINE_RELIABILITY_GOAL.md` — reliability contract + golden quotes
- `.cursor/rules/quoting-engine-principles.mdc`
- `.cursor/rules/customer-preview-contract.mdc`
- `.cursor/rules/specialist-classification.mdc`
- `.cursor/rules/export-contract.mdc`

## Product direction

> This is not a generic voice-to-quote app. It is a garden and landscaping quote
> processor. Voice/paste/customer form are only input methods. The value is
> reliable quote processing: customer wording, internal assumptions, calculators,
> warnings, quote options, and JMS/Xero-ready lines.

## Current branch

```text
wip/export-mapping-refactor-from-cursor
```

Do not merge to main.

## Current checkpoint

```text
3730528 Add quote engine batch plan
6c65923 Add pipeline-backed Michelia golden test
0c21f73 Extract transcript processing pipeline
1f299a7 Add lawn establishment quantity calculators
d511b27 Prevent decking takeover on mixed landscaping quotes
1c89378 Detect Adam mixed-landscaping quote failures
e18d44f Add golden quote regression runner
2b45019 Recover labour export lines from parsed allowances
d69caab Add deterministic quote auditor foundation
589004b Add quote engine reliability goal
```

Notes:
- `docs/QUOTE_ENGINE_BATCH_PLAN.md` is committed (`3730528`).
- `docs/CURRENT_SESSION_HANDOFF.md` (this file) is for context compaction only.

## What works now

- Golden quote runner exists (`npm run test:golden-quotes`).
- Extracted pipeline exists (`lib/pipeline/process-transcript.ts`, `processTranscriptToQuote`).
- Michelia has a pipeline-backed golden test (real pipeline, mocked OpenAI deps).
- Quote Auditor exists with deterministic validators (V01–V04, V06, V08).
- Adam/Titirangi failures are now detected (and the decking misclassification is fixed).
- Lawn-establishment calculators exist for 100.8m² / 5.04m³ / 5kg / $129
  (`lib/calculators/soil-volume.ts`, `lib/calculators/lawn-establishment.ts`).
- Route extraction allows headless pipeline tests with mocked OpenAI deps.

## Current limitations

- Garden Bed and Adam are not yet pipeline-backed golden tests (fixture-only).
- Adam lawn-establishment calculators exist but are not fully wired into the live pipeline yet.
- Optional Ficus hedge still needs warning/calculation work.
- KB / price-list mapping v2 is future work.
- AI semantic review is not approved yet.
- Other trades are not approved yet.

## Next approved batch

```text
QA-6 — Pipeline-backed Garden Bed Renovation golden quote
```

Goal:
- Convert the Garden Bed Renovation fixture to use `processTranscriptToQuote()` with mocked extraction.
- Prove labour 7h + 2h + 8h = 17h.
- Prove no `$7`, `$2`, `$8` pricing facts.
- Prove optional works remain optional.
- Do not change runtime logic unless the pipeline-backed test exposes a blocker.

## Batch rules

- One quote failure, one batch, one contract, one commit.
- `git status --short` before edits.
- Do not commit generated files (`next-env.d.ts`, `tsconfig.tsbuildinfo`, `.DS_Store`, `.tmp/`).
- Run relevant tests and `npm run build`.
- Do not commit until approved.
- No AI semantic review.
- No new trades.
- No broad route refactor.
- No self-serve KB upload UI yet.

## Standard opening prompt for new sessions

```text
Read docs/CURRENT_SESSION_HANDOFF.md and docs/QUOTE_ENGINE_BATCH_PLAN.md first.

Then run:
git branch --show-current
git status --short
git log --oneline -n 10

Do not edit files yet. Summarise the current checkpoint and confirm the next approved batch.
```
