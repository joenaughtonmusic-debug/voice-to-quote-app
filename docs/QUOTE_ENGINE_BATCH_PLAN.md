# Quote Engine Batch Plan

**Working plan for the quote engine. Read this before starting any batch.**

> **One quote failure, one batch, one contract, one commit.**

This file exists to keep every session narrow and approved. It prevents:

- broad refactors without approval
- adding new trades too early
- adding AI semantic review too early
- drifting into a generic voice-to-quote SaaS
- trying to solve every Adam/Titirangi issue in one batch

Branch: `wip/export-mapping-refactor-from-cursor` — **do not merge to main**.

---

## Product direction

This is **not** a generic "voice-to-quote" tool.

The product is:

> A garden and landscaping **quote processor** that turns messy site notes into
> customer quote wording, internal labour/material assumptions, warnings, quote
> options, and JMS/Xero-ready lines.

Voice, paste, and a customer form are only **input methods**. The value is the
quoting/estimating engine and the reliability of its output across every layer
(customer preview, internal review, matched JMS, Xero/JMS export).

---

## Current committed checkpoint

```text
589004b Add quote engine reliability goal
d69caab Add deterministic quote auditor foundation
2b45019 Recover labour export lines from parsed allowances
e18d44f Add golden quote regression runner
1c89378 Detect Adam mixed-landscaping quote failures
d511b27 Prevent decking takeover on mixed landscaping quotes
1f299a7 Add lawn establishment quantity calculators
0c21f73 Extract transcript processing pipeline
6c65923 Add pipeline-backed Michelia golden test
```

Reference docs: `docs/QUOTE_ENGINE_RELIABILITY_GOAL.md`, `docs/GOLDEN_QUOTE_RUNNER.md`.

---

## Approved next sequence

### QA-6 — Pipeline-backed Garden Bed Renovation golden quote
Goal:
- Convert the Garden Bed Renovation golden fixture to use `processTranscriptToQuote()` with mocked extraction.
- Prove labour 7h + 2h + 8h = **17h**.
- Prove no `$7`, `$2`, `$8` pricing facts.
- Prove optional works remain optional.
- Do not change runtime logic unless the pipeline-backed test exposes a blocker.

**Status: done** (commit `434b0e3` — "Add pipeline-backed garden bed golden quote coverage").

Garden Bed is now driven through the real `processTranscriptToQuote` via the test
"Golden Quote 2 — Garden bed renovation (PIPELINE-BACKED)". The mocked extraction has
**no labour line**, so the live pipeline's `applyPerTaskHourAllowances` recovers
7h + 2h + 8h = **17h** at $110/hr → **$1,870**, with no `$7`/`$2`/`$8` pricing facts,
garden mix/mulch kept optional-only, and no customer-preview metadata leak or template
takeover. No runtime logic changed.

### QA-7 — Pipeline-backed Adam/Titirangi golden quote
Goal:
- Convert the Adam/Titirangi fixture to use `processTranscriptToQuote()` with mocked extraction.
- Prove the extracted pipeline preserves mixed landscaping scope.
- Keep known remaining warnings for optional Ficus hedge, topsoil/lawn seed KB mapping, retaining drainage/post spacing.
- Do not require live OpenAI.

**Status: done — landed as a partial pipeline-backed test; all three captured
divergences were then fixed by QA-8 (classification + address) and QA-9 (preview).**

Adam/Titirangi is driven through the real `processTranscriptToQuote` via a
pipeline-backed test ("Golden Quote 3 — Adam/Titirangi (PIPELINE-BACKED)") that now
holds the **full** contract. QA-7 landed the test and captured three runtime
divergences from the QA-3 desired contract; QA-8 and QA-9 fixed all three:

1. ✅ **Classification (fixed by QA-8)** — previously normalised to `retaining`; now
   stays `general_landscaping` (retaining is treated as a sub-component). This also
   resolved `V06-missing-topsoil-lawn-scope` / `V06-missing-lawn-seed`.
2. ✅ **Customer preview (fixed by QA-9)** — no longer taken over by the planting
   renderer; the mixed-landscaping assembly renderer surfaces the real scope
   (retaining wall / polythene / topsoil / lawn seed). See QA-9 below.
3. ✅ **Address (fixed by QA-8)** — previously dropped the `Titirangi` suburb; now
   preserved as `20 Lemnos Street, Titirangi` (`V08-suburb-missing` no longer fires).

### QA-8 — Fix Adam/Titirangi mixed-landscaping pipeline path (classification + address)
Goal:
- Keep Adam/Titirangi as `general_landscaping` when the primary work is lawn
  levelling/topsoil/lawn seed and retaining is only a sub-component.
- Preserve the `Titirangi` suburb: "20 Lemnos Street in Titirangi" → "20 Lemnos
  Street, Titirangi".
- Do NOT change planting-calculator behaviour or artificially force the renderer
  (customer-preview takeover stays a knownFailure, deferred to QA-9).

**Status: done.**

Two small, focused production fixes:
- `lib/retaining-processing.ts` — `isRetainingTranscript` gains
  `LANDSCAPING_PRIMARY_OVER_RETAINING_PATTERN`, so a lawn-levelling-primary transcript
  with a sub-component retaining wall is no longer rebuilt as a retaining quote.
- `lib/address-extraction.ts` — `addressCandidatePattern` accepts an
  "in &lt;suburb&gt;" clause and `cleanCandidate` normalises it to the comma form.

Verified: `test:golden-quotes`, `test:retaining`, `test:general-landscaping-mvp`,
`test:core` (+ `test:retaining-mvp`, `test:fencing-mvp`, `test:pipeline`) and
`npm run build`. The Adam pipeline-backed partial test now additionally asserts
`general_landscaping` and the preserved `Titirangi` suburb.

**Still deferred (was the original QA-8 goal):** wiring
`lib/calculators/soil-volume.ts` + `lib/calculators/lawn-establishment.ts` into the
**live** pipeline so topsoil (100.8m²/5.04m³) and the lawn-seed bag ($129) are computed
by the pipeline rather than supplied by the recorded extraction. Tracked as a follow-up.

### QA-9 — Optional Ficus hedge: stop the customer-preview planting takeover
Goal:
- Preserve the optional Ficus hedge as optional scope text.
- Do not fabricate a plant count / hedge length / planting area when the optional
  hedge lacks enough detail.
- Fix the customer-preview planting takeover on Adam/Titirangi without touching the
  renderer or suppressing planting intent globally.

**Status: done.**

Root cause: the planting calculator's `lengthPattern` read "16.8m for the retaining
wall" and `isLikelyPlantName` accepted "the retaining wall" as a plant name, so a
bogus 16.8 m planting request was created → `plant_calculator_results` populated →
customer-preview renderer flipped to `planting-presentation` and dropped the
polythene/lawn-seed scope.

Fix (one focused edit): `lib/calculators/planting/index.ts` `isLikelyPlantName` now
rejects structural landscaping nouns (`retaining|wall|fence|posts?|polythene|topsoil`),
so `addRequest` drops the fabricated request. No renderer changes, no planting-intent
suppression, no Adam hard-coding. The optional Ficus hedge stays as optional scope text
with no invented count (it has no explicit count/row length).

Result: the Adam/Titirangi pipeline path now uses the mixed-landscaping assembly
renderer and the pipeline-backed golden test holds the **full** contract. Locked by a
unit test in `lib/calculators/planting/index.test.ts` and the upgraded golden test.

Deferred (unchanged): calculating a real hedge plant count when enough detail exists,
and the "2 people × 1 day = 16h" optional labour, remain future work — QA-9 only
removes the fabrication, it does not add a real hedge calculation.

### QA-10 — Computed facts source of truth (design only)
Goal:
- Design `ProcessedQuote.computed` (or equivalent).
- Centralise labour hours/totals, plant count, soil volume, material quantities.
- Stop customer preview, internal review, matched JMS, and export from re-deriving the same truth separately.

**Status: design-only pending**

### AI-0 — mixed planting+paving classified/extracted as a mixed job (paver root cause)
Context: live diagnosis of the Sarah/Ellerslie controlled-mode run showed the paver area is
**dropped at extraction**, not at rendering. The classifier labels this mixed planting+paving
job as `planting`; the planting-specialist extraction then focuses on plants and never captures
"Lower paver area: 1.5m × 3.5m". Confirmed on BOTH gpt-4o-mini and gpt-5.2 extraction — so it is
a classification/routing miss, not model weakness. `render_intent` (AI-1) cannot restore scope
extraction never captured, so this must land first.

Goal:
- When a transcript has planting AND a distinct non-planting trade area (paving/retaining/deck/
  hard fill/etc.), classify/route it as mixed `general_landscaping`, not pure `planting`, so the
  general-landscaping extraction + assembly captures ALL scope (incl. the paver).
- Do NOT reclassify a genuinely pure planting job (Michelia must stay `planting`).

Likely approach (decide in batch): a deterministic post-classify guard (mirroring QA-8's
`LANDSCAPING_PRIMARY_OVER_RETAINING_PATTERN`) that detects multiple distinct trade areas and
keeps the quote `general_landscaping`, rather than a prompt change.

Done criteria:
- Live Sarah re-run: paver area is captured in the ProcessedQuote scope (extraction), classified
  `general_landscaping`.
- Regression: Michelia stays `planting`; golden Client B / Adam mixed-landscaping unaffected;
  classification + golden + general-landscaping suites green.
- `npm run build`; commit on its own.

**Status: done** (commit `38e5614` — "Route mixed planting+structural jobs to landscaping (AI-0)"). Classifies Sarah `landscaping` 10/10; planting goldens unchanged. Discovered downstream: the extraction then drops the paver ~30-40% of the time regardless of model — handled by AI-0b.

### AI-0b — extraction coverage-check retry (paver drop is non-deterministic, not a model gap)
Context: with AI-0 the Sarah/Ellerslie job classifies `landscaping` **10/10**, but the extraction
**non-deterministically drops the paver sub-area**. Measured live: gpt-4o-mini **6/10** captured,
gpt-5.2 **4/10** — so a stronger model does NOT help (worse), confirming it is a prompt/extraction
weakness, not model capability. Fix the reliability, not the model.

Goal:
- Deterministically detect distinct work items the extraction should contain and, when one is
  missing, retry extraction; if STILL missing after the retry cap, surface a LOUD review notice —
  never a silent drop.

Requirements (from approval):
1. The coverage check is **deterministic** — "what should be there" is derived from the transcript
   by **reusing the AI-0 `transcriptMentionsNonPlantingStructuralTrade` detector** (and its noun
   set), NOT by asking an AI. v1 scope: verify each detected non-planting structural trade area
   (paver/paving/retaining wall/decking/hard fill) present in the transcript also appears in the
   extracted scope/materials.
2. If an item is still missing after retries, emit a `severity: "error"` review notice (loud,
   internal review) so it is never silently dropped.

Plan:
- Extend `extractQuoteWithRetry` (currently retries only on parse/API errors) so a SUCCESSFUL but
  **coverage-incomplete** extraction is also retryable, up to a cap (propose 2 coverage retries →
  3 attempts total; configurable).
- On exhaustion with a still-missing item: attach a loud coverage review notice (new
  `source: "coverage"`), listing the specific missing item(s).

Expected capture math (per-attempt capture p ≈ 0.6, gpt-4o-mini, treating attempts as ~independent):
- 1 attempt (today):      capture 60%, **silent** miss 40%
- 2 attempts (1 retry):   capture 1 − 0.4² = **84%**
- 3 attempts (2 retries): capture 1 − 0.4³ = **93.6%**
- Residual (~6%) is NOT silent — it becomes a loud review notice. Net: **0% silent drops.**

Cost / latency of extra attempts:
- Per extraction attempt ≈ gpt-4o-mini, ~2.1k input + ~3.5k output tokens ≈ **$0.0024** and **~12s**.
- Retries fire ONLY when a structural item is detected AND that attempt missed it — pure
  planting/maintenance/etc. jobs never trigger (zero overhead).
- Expected extra for a mixed-structural job ≈ 0.4 + 0.16 ≈ **~0.56 extra attempts** (~+7s, ~+$0.001);
  worst case 2 retries (~+24s, ~+$0.005). Negligible cost; bounded, subset-only latency.

Done criteria:
- Live Sarah re-run (10×): capture rate rises to ≥ ~90%, and on any residual miss a loud
  coverage review notice fires (verified) — no silent drop in any of the 10.
- Deterministic coverage-check unit tests; retry-on-miss + notice-on-exhaustion tests (mocked
  extraction, no live OpenAI).
- Regression: golden / general-landscaping / planting / core green; `npm run build`. Commit on its own.

**Status: approved — active (next, before AI-1).**

### AI-1 — render_intent mixed-trade guard (controlled-mode regression)
Context: controlled mode (`ENABLE_AI_QUOTE_PLAN`, dev-only) lets an accepted/normalised AI
QuotePlan drive the quote. Live verification of 5 real transcripts found one customer-facing
regression: **Sarah/Ellerslie** (planting + paving) — the AI plan's planting main bucket set
`render_intent.mainIsPlanting = true`, so `selectCustomerRendererPath` chose
`planting-presentation` and **the paver area (1.5m × 3.5m) fell out of the customer scope**.

Goal:
- A planting main bucket must NOT collapse a job that also has non-planting structural work
  (paving/retaining/decking/hard fill/topsoil/concrete/fencing). Sarah must keep the paver area.
- Plan-source-agnostic: protect both the AI-driven and deterministic paths.

Plan:
- Add a pure detector `hasNonPlantingStructuralScope(...)`, reusing the existing
  `isStructuralNonPlantLabel` helper so the structural definition stays single-sourced.
- Apply at the `render_intent` derivation in `lib/pipeline/process-transcript.ts`:
  `mainIsPlanting = isPlantingBucket(...) && !hasNonPlantingStructuralScope(...)`.
- Belt-and-suspenders (kept in scope): also guard
  `selectCustomerRendererPath`/`isPrimaryPlantingQuote` in `lib/customer-renderer-intent.ts` so
  a mixed job can't route to plants-only from any angle, even with an externally-supplied
  render_intent.

Done criteria:
- Unit/pipeline test: Sarah-style plan (planting main + paving scope) → `mainIsPlanting === false`
  → assembly (mixed) renderer → paver retained.
- Regression: Michelia (pure planting) stays `planting-presentation`; golden Client B unaffected;
  planting-parity / cutover / golden suites green.
- **Live re-run of the Sarah/Ellerslie transcript with controlled mode on — the paver area is
  actually back in the customer scope** (not just unit tests passing).
- `npm run build`; commit on its own.

**Status: approved — queued after AI-0b (render_intent guard; keeps the now-captured non-planting scope in the customer preview).**

### AI-2 — AI-plan optional-works passthrough
Context: same verification found the AI plan's optional buckets (Finn's water-blasting, Dane's
optional edging) do NOT reach the customer `optional_quotes` — they only feed internal
`optional_priced_works`.

Goal:
- When the AI plan drives, map its `optional` buckets into customer-facing `optional_quotes`
  WITHOUT changing `quote_options` semantics or breaking the existing de-dup / customer-optional-works
  contract (guardrail).

Plan (scope fully after AI-1 lands, since AI-1 may change how mixed jobs render optionals):
- Bucket → QuoteOption mapping, de-duplicated against optionals the extraction already produced,
  reconciled with the Slice-3a/3b priced-optional-works path.
- Tests + golden + `test:customer-optional-works`.

**Status: approved — queued (do NOT start before AI-1 lands).**

### Later — KB / Price List Schema v2
Goal:
- canonical item names
- supplier names
- customer display names
- aliases
- units
- rates
- tax/account codes
- JMS/Xero mapping
- review status
- fuzzy match review

**Status: future — only after engine reliability improves.**

---

## Rules for every batch

Every batch must include:

1. `git status --short` before edits (confirm a clean starting tree).
2. A clear, narrow scope.
3. Tests added/updated.
4. The exact required test commands.
5. `npm run build`.
6. No generated/cache files committed (`next-env.d.ts`, `tsconfig.tsbuildinfo`, `.DS_Store`, `.tmp/`).
7. No commit until approved.
8. A final summary: files changed, tests run + results, build result, and remaining issues.

---

## Do NOT do yet

- AI semantic review
- electrical / plumbing / cleaning modules
- self-serve KB upload UI
- Playwright browser tests
- major UI redesign
- broad route refactor
- full SaaS onboarding
