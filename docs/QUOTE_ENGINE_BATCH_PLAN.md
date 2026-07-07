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
