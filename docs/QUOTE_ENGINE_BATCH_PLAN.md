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

### AI-0c — extend coverage-check-retry beyond structural nouns
Context: AI-0b's coverage check is deliberately scoped to the tight AI-0 structural-noun set
(paver/paving/retaining wall/decking/hard fill). The extraction non-determinism is almost
certainly NOT paver-specific — other distinct work items are just as droppable. AI-0b must not
quietly become the whole fix.

Goal:
- Reuse the SAME AI-0b coverage-check-retry + loud-notice machinery, but broaden the deterministic
  "what should be there" set to other distinct work items:
  - **labour lines** (per-task hour allowances / people×days the transcript states),
  - **optional works** (explicit "optional"/"option for" items),
  - **green waste** (stated green-waste allowance/amount),
  - **measured sub-areas** (distinct areas with dimensions, e.g. "1.5m x 3.5m").
- Keep each detector DETERMINISTIC (transcript-derived, not an AI guess) and over-trigger-safe.

Notes:
- Sequence after AI-0b proves the mechanism on the tight set and after we see the real
  cross-transcript miss profile from the 5-transcript verification (Tacoma hedge, optional
  water-blasting, "privet", green-waste details were all dropped too).
- Likely reuses existing deterministic extractors (labour-allowance-extraction, review-notices
  measurement detectors) as the "expected" source rather than new regexes where possible.

**Status: approved — queued after AI-0b (broaden coverage; do NOT fold into AI-0b's v1).**

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

---

## Bread-and-butter series (PRODUCTION_DIRECTION reset)

Per `docs/PRODUCTION_DIRECTION.md`: nail one-off tidy + ongoing maintenance first;
internal notes must never reach the customer; match the real quotes in
`docs/reference_quotes/` (ANSWER_KEYS.md). Mixed-trade / paver work (AI-0c, AI-1) is
**paused** — do not start it under this series.

### B1 — keep internal notes out of customer scope; price tidy labour/greenwaste from spoken figures
Internal planning notes (weekday/scheduling, hourly rate, labour hours, dump/tip rate,
greenwaste quantity, option-planning chatter) leaked into customer scope. Added a shared
`internal-scope-signals` gate applied in the tidy assembler AND `customerPreview.scopeItems`.
Labour/greenwaste become priced customer lines from spoken figures via the shared export
resolvers (inline "N hours at $R" → labour total; spoken "$130 of green waste" → greenwaste).

**Status: done** (commit `7181705`). Graded Xavier + David: 0 leaks, David labour $400, Xavier greenwaste $130.

### B3 — team/site notes out of the customer quote, retained internally
Access/hazard/parking/pet advisories (dog, gates, steep driveway, park on street) leaked to
the customer via the maintenance "Site Notes" section (Fiona) and `customerPreview.scopeItems`
(Rachel). Added `isTeamSiteNote` to the shared gate (advisory-framed so work items like
"install a gate" survive) and narrowed the maintenance customer Site Notes to customer-relevant
info only (e.g. green waste bin). Notes retained in the internal view.

**Status: done — pending commit.** Graded Fiona/Steve/Rachel: 0 leaks, capture (frequency, $85/$95 overrides, two bags) intact.

### B2 — greenwaste business-rule pricing (queued)
David's "1.5 days" greenwaste and other non-spoken quantities need a business-rule price to
reach a $ line (like the real $39.75), instead of staying flagged/unpriced. Deterministic
rule, spoken price still wins. Do NOT fold into B1.

**Status: approved — queued.**

### B4 — maintenance customer output is too thin (queued)
The maintenance customer draft renders only "Main Focus" bullets — it needs, to match Nadia
(QU-0521): a **per-visit price line**, a **greenwaste line**, and the **frequency shown**
(currently the cadence is captured but not surfaced). Also worth: a first-class **Team
instructions** output to receive the B3 access/hazard notes (currently they live in the
internal view only).

**Status: approved — queued (do NOT build yet).**

## Tidy send-ready (T-series)

Goal: make ONE-OFF TIDY fully send-ready against Xavier (QU-0572) and David (QU-0570) —
priced labour, greenwaste, extras, subtotal, GST, TOTAL in the line-item format, and
reliable (same transcript → same figures run-to-run). Tidy-only; does NOT touch maintenance
or paver batches. Joe's pricing rules: full day = 7.5h; hourly rate PER PERSON; spoken $ wins;
greenwaste $26.50/bag (6 bags = 1 trailer), flag odd units ("1.5 days"); weedkiller
extra-strength = $6.

### T1 — deterministic tidy pricing-facts layer (reliability foundation)
New `lib/export/tidy-pricing-facts.ts` parses pricing-relevant facts (spoken labour/greenwaste
totals, rate, hours, days, people, greenwaste qty, extras) straight from the RAW transcript.
Spoken totals wired as top priority in the labour/greenwaste resolvers (transcript threaded via
`raw_transcript` on the preview quote, so draft AND Xero export stay in parity).

**Status: done — pending commit.** Live: David labour **$400 6/6** (was ~4/6), Xavier greenwaste
**$130 6/6**, 0 leaks. (Xavier labour still varies — no spoken total; that is T2.)

### T2 — labour pricing rule (day-rate / crew → hours → $)
Full day = 7.5h; rate per person; spoken total wins. Xavier "full day, 2 people, $80/hr" →
7.5 × 2 × 80 = **$1,200** (computed + editable; NOT graded on his manually-adjusted $720).
David spoken $400 flows through. `dayRateLabourPrice` reads the deterministic T1 transcript
facts and sits above the AI-field allowance/inline paths (which vary); a stated "full day"
takes precedence over a bare "N hours" that belongs to a reduced-scope option.

**Status: done (computation) — pending commit.** Live: Xavier **$1,200 5/5**, David **$400 3/3**,
0 leaks. The professional description-paragraph presentation (scope-as-prose on the labour line,
no separate bullet Scope-of-Work) is the invoice-format work — folded into **T5** with the
greenwaste/extras/subtotal/GST/TOTAL lines and Xero parity, rather than half-done here.

### T3 — greenwaste pricing rule (folds in B2)
$26.50/bag; 6 bags = 1 trailer; spoken $ wins; flag odd units ("1.5 days") rather than guess.
`greenwasteRulePrice` computes from the deterministic T1 quantity facts; only a SINGLE
unambiguous quantity is priced (multiple quantities, e.g. Shirley's "two trailer loads … three
quarters", stay a qty display rather than being part-priced). An odd unit stays unpriced and is
flagged by the audit, never falling through to a line-item that could misread "1.5 days" as $1.50.
**This was B2.**

**Status: done — pending commit.** Xavier $130 (spoken wins), a stated bag/trailer quantity →
$26.50/bag ($318 for 2 trailers, $79.50 for 3 bags / ½ trailer), David "1.5 days" → flagged
(no $), deterministic across repeat runs. Cents-formatting to 2dp is the T5 invoice-format pass.

### T4 — priced extras / consumables
`lib/export/tidy-extras.ts` — a small, extensible price list (`TIDY_EXTRAS_PRICE_LIST`, add a row
to price a new extra). T1 captures which extras were mentioned; `resolveTidyExtras` prices each:
spoken $ next to the extra wins → price list → else flagged ("price to confirm"), never guessed.
Renders a customer "Extras" section (only when extras are present). For now: weedkiller
extra-strength = $6.

**Status: done — pending commit.** Xavier extra-strength weedkiller → **$6**; organic weedkiller
(not in the list) → flagged; a spoken "$8" beside the extra overrides the list; deterministic.

### T5 — subtotal + GST + TOTAL in the line-item format
Aggregate priced lines → subtotal, GST 15% inclusive, TOTAL, rendered as the invoice-style
table. Answer keys: Xavier $798.88 / GST $104.20; David $479.75 / GST $62.57. Depends on T1–T4.

**Status: approved — queued (after T2–T4).**

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
