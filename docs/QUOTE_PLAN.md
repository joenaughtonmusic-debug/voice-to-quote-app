# QuotePlan (design/validation slice)

A **pre-logic intermediate representation** for the two-stage quote intelligence
flow. Stage 1 sits after the transcript/extraction and before the deterministic
quote engine; it makes the **main-vs-optional boundary** and **per-bucket labour /
materials / measurements** explicit, so downstream logic no longer re-parses the raw
transcript scope-blind.

```
transcript → lead + classify → extraction → [QuotePlan]  → deterministic engine → preview / JMS / Xero → Quote Overseer
                                             ↑ this slice (types + deterministic builder only)
```

Location: `lib/quote-plan/` — `buildQuotePlan(input): QuotePlan`.

## Why it exists

`ProcessedQuote` can only hold **main** labour: it has a single `labour_allowance:
string`, and `optional_quotes` are `QuoteIntent` (`{ quote_title, job_type, scope,
cadence, notes }`) with **no labour/materials fields**. So there is nowhere to attach
"labour that belongs to an optional work". Deterministic labour steps (e.g.
`recoverMissingLabourLineItem`) then parse labour from the whole transcript and attach
it to the primary line items — which is how the optional Ficus hedge's "two people one
day" leaked into the **main** labour allowance.

The `QuotePlan` fixes the model: labour/materials/measurements are **owned by a
`WorkBucket`**, and every bucket knows whether it is `main` or `optional`.

## Status — NOT wired in

This slice is **types + a deterministic builder + tests only**. It is:
- **not** wired into `processTranscriptToQuote`,
- **not** using OpenAI (the builder reads an already-extracted quote),
- **not** changing `ProcessedQuote`, rendering, Xero export, customer preview, the
  Quote Overseer, or any runtime behaviour.

The goal here is to validate the data model and parsing shape.

## Shape

- `QuotePlan`: `{ quoteType, quoteTypeConfidence, main, optional[], exclusions, cadence?, uncertainties[] }`
- `WorkBucket`: `{ id, title, kind: "main" | "optional", scope[], labour[], materials[], measurements?, sourceText }`
- `LabourAllocation`: `{ raw, people?, days?, hours?, determinacy: "explicit" | "inferred" | "missing" }`
- `BuildQuotePlanInput`: `{ extraction: ProcessedQuote, transcript, classification: { specialist } }`

## How it works (deterministic)

1. Buckets **mirror the extraction**: `main` ← `primary_quote`; `optional[]` ← `optional_quotes`.
2. Each optional bucket **claims** the transcript sentences whose *distinctive* words
   (content words unique to that bucket vs the main and other optional buckets) appear
   in them. The main bucket keeps the rest.
3. Labour and measurements are parsed **per bucket, from its own claimed text** — so an
   optional sentence's labour can never leak into the main allowance. Main labour also
   excludes any sentence carrying an optionality marker (defensive).
4. Reuses existing primitives only: `parseLabourAllowanceText`,
   `extractPerTaskHourAllowances`, `extractSpokenSpacingMmFromText`.

## Tests

`npm run test:quote-plan` (`lib/quote-plan/build-plan.test.ts`), all with hand-built
extractions (no OpenAI):
- **Adam/Titirangi:** the optional Ficus hedge's "2 people × 1 day" (16h) lands on the
  optional bucket; **main labour has no 16h** — the core validation.
- **Maintenance:** `quoteType: maintenance`, `cadence` captured, green waste as a main material.
- **Michelia planting:** `14.2m` length + `500mm` spacing + 12h labour on the main
  planting bucket; the optional timber border has no planting measurement.
- **Garden tidy:** `quoteType: one_off_tidy`, main labour stays main, no fabricated
  optional/planting bucket.

## Slice 2 — first runtime wiring (done)

`buildQuotePlan` is now wired into `processTranscriptToQuote` behind a **dormant,
injectable `planQuote` dep** (defaults to `buildQuotePlan`; deterministic, no OpenAI).
It has exactly one runtime effect:

- The plan is built just before `recoverMissingLabourLineItem`, and the recovery's
  **fallback** text is scoped to `quotePlan.main.sourceText` (optional sentences
  removed) instead of the whole transcript. Recovery still prefers
  `labour_allowance`/notes/scope first, so legit main labour is unaffected; only
  *optional-only* labour (e.g. an optional hedge's "two people one day") is no longer
  recovered as the **main** structured labour line.
- Each optional bucket's labour is surfaced in `internal_notes` for review/pricing,
  e.g. `Optional works labour (review/price separately): Optional Ficus Tuffi hedge —
  2 people × 1 day = 16h.` (`internal_notes` is internal-only — never customer-facing.)

Not changed: `ProcessedQuote`, `recoverMissingLabourLineItem` internals,
`applyDeterministicLabourAllowances`/`applyPerTaskHourAllowances`, calculators,
rendering, Xero export, templates, and the Quote Overseer.

Covered by: `lib/pipeline/process-transcript.test.ts` (optional-only labour → no main
line + internal note; Michelia still recovers 12h) and the Adam/Titirangi
pipeline-backed golden test (no 16h main line; optional Ficus labour surfaced; full
contract still holds).

## Slice 3a — optional works become priceable (internal-only) (done)

Optional-bucket labour is now a **priceable** optional work in the output model, via a
new additive field on `ProcessedQuote`:

```ts
optional_priced_works?: QuoteOption[]
```

- It reuses the existing `QuoteOption` type (`category: "labour"`, `source:
  "ai_extraction"`) but is stored on this **separate** field — deliberately **not**
  `quote_options` — because the customer options card renders any priced
  `quote_options` entry (`customerOption()` doesn't filter `labour`). Keeping it
  separate means customer preview, the customer options card, and Xero export do not
  surface it in this slice.
- Built by the pure `buildOptionalPricedWorks(plan, rate)` (`lib/quote-plan/optional-priced-works.ts`),
  reusing the pipeline's main-labour recovery rate. When no rate is available the
  subtotal is `0` with a "Rate missing" warning — a rate is never fabricated.
- Displayed internal-only via `OptionalPricedWorksCard` in `quote-review.tsx`
  (`view === "internal"`). The Slice 2 `internal_notes` line is kept for now.

Not changed: `quote_options` semantics, customer preview, Xero/JMS export, calculators,
templates, the Quote Overseer, or `recoverMissingLabourLineItem`.

Staged rollout: **3a** = model + internal display; **3b** = customer preview (below);
**3c** = Xero/JMS export.

## Slice 3b — customer-facing optional works (done)

Priced optional works now render in the **customer-facing** quote preview, clearly
separated from the main quote and never counted in the main total.

- A pure formatter `buildCustomerOptionalWorksLines` (`lib/customer-optional-works.ts`)
  produces a customer-safe block, threaded through `CustomerDraftPreviewModel`
  (`customerOptionalWorks`) and appended by `renderCustomerDraftPreviewText` (all
  renderer paths) and rendered in `components/quote-draft.tsx`.
- **Only genuinely priced works are shown** — `subtotal > 0` and no rate-missing
  warning. Zero-subtotal / rate-missing works stay internal-only.
- **Price only, no labour hours.** The customer sees the work name and its optional
  price (e.g. `Optional Ficus Tuffi hedge` / `Optional price: $1,760`) under an
  "Optional works" heading with: *"The following optional work is not included in the
  main quote. It can be added if you would like to proceed with it."* Hours are
  deliberately omitted so the section stays consistent with the customer-preview rule
  that labour hours are internal — and so the Quote Overseer's O2 check does not flag
  it. Hours remain on the internal Slice 3a card.
- **No internal leak:** source/category/warnings/`internal_notes`/`ai_extraction` never
  appear in customer copy.
- **Untouched:** `quote_options` semantics, Xero/JMS export, calculators, templates,
  the Quote Overseer, and `recoverMissingLabourLineItem`.

### Slice 3b de-duplication fix

Browser testing revealed a priced optional work rendering **twice** customer-facing:
once as old optional scope (the assembly "Optional Works" section, which the React draft
renders directly via `assembleCustomerQuote(...).sections`) and once as the new priced
"Optional works" section. The live AI emits the optional work through **two** paths — in
`optional_quotes` *and* as an `Optional:`-prefixed line in `primary_quote.notes`/
`customer_scope` — so a title-only match was insufficient (it fixed the headless text but
not the browser).

Fixed in `lib/customer-quote-assembly/general-landscaping.ts` `optionalWorkItems`:
1. drop optional_quotes whose title matches an `optional_priced_works` label;
2. filter `isLabourLine` items (a raw labour phrase is never customer-facing scope);
3. **content-based de-dup** — drop any old optional line that shares ≥2 distinctive
   tokens (len ≥4, excluding generic words like optional/works/labour/plant/planting/…)
   with a priced work label. This covers *both* AI paths.

When the old section empties, `section()` returns null → a single priced optional works
section remains. Optional-quote details stay intact internally. Guarded against
over-suppression (unpriced optional works still render). Covered by assembly-level tests
in `general-landscaping-mvp-acceptance.test.ts` and a render-level test in
`golden-quotes/index.test.ts`.

### Known issue — deferred to next batch (QuotePlan measurements/calculator ownership)

The planting calculator still fabricates bogus plant options from non-plant measurements
("the retaining wall 6M", "the retaining wall 16.8M") because calculators re-extract
measurements from the raw transcript rather than from `plan.*.measurements`. This is the
next migration: **Slice 4/5 — measurements/calculator ownership via QuotePlan** (feed
calculators from plan buckets so a retaining-wall length can never become a planting
area). Not fixed in this batch.

### Browser / E2E note

There is **no** automated browser E2E for the customer draft: `POST /api/process-quote`
hard-requires `OPENAI_API_KEY` and calls live OpenAI, and there is no deterministic
customer-draft UI path — so the paste→quote flow can't be driven in a browser without
OpenAI or a production-route test hook (out of scope this batch). The **headless golden
render test** (`Golden Quote 3 … PIPELINE-BACKED`) exercises the exact renderer chain the
browser uses (`buildCustomerDraftPreviewModel` → `assembleCustomerQuote` →
`renderCustomerDraftPreviewText`) and is the browser-equivalent regression. Manual
browser checklist: run `npm run dev` with an `OPENAI_API_KEY`, paste the Adam/Titirangi
notes, and verify the customer draft shows one "Optional works" section with
`Optional price: $1,760`, retaining wall / polythene / topsoil, and no labour hours / raw
labour phrase; and the internal view shows the "Optional Works (priceable)" card.

## Milestone 1 — planting calculator owns its inputs (done)

The planting calculator now reads plant requests/measurements from the QuotePlan's
**planting buckets only** (`plantingScopeTextFromPlan`), not the raw transcript, and the
plan is built **before** the calculator step. A retaining-wall or topsoil measurement
lives in a non-planting bucket and can never be scavenged into a planting length/count,
so fabricated options like "the retaining wall 16.8M" are gone. `WorkBucket.measurements`
gained additive `provenance`, and `isStructuralNonPlantLabel` (exported from the planting
calculator) is a defensive guard on the two transcript-blind extractors.

## Milestone 2 — renderer/assembler follows QuotePlan intent (done)

Customer renderer/assembler selection follows the plan's **primary intent**, not a
`job_type` the output normalisers may have flipped to "Hedge Planting"/"retaining" once an
optional planting/retaining component was calculated. The pipeline records an additive
`ProcessedQuote.render_intent = { primaryTrade, mainIsPlanting }` from the pre-mutation
plan; `selectCustomerRendererPath` / `isPrimaryPlantingQuote` (in
`lib/customer-renderer-intent.ts`) gate the planting presentation and the planting
assembler on the MAIN work being genuinely planting, and route mixed landscaping to the
general assembly. True planting quotes (Michelia) still use the planting presentation.

## Milestone 3 — QuotePlan validation & AI-planner preparation (done)

`lib/quote-plan/validate.ts` adds the **deterministic gate an AI planner will sit behind**.
No live OpenAI, no keys, no env vars in this batch.

### How the AI planner will plug in

A future AI QuotePlan Planner emits a QuotePlan-shaped **draft** (untrusted). The pipeline
already has the dormant seam: `ProcessTranscriptDeps.draftPlanner?: (input) => unknown`.
When provided, the plan is resolved via:

```
resolveQuotePlan({ draft: draftPlanner(input), fallbackInput: input }).plan
```

Today `draftPlanner` is undefined in production, so `planQuote` stays the deterministic
`buildQuotePlan` and **runtime behaviour is unchanged** — the seam is exercised only by
injected tests.

### Why AI output is draft-only

Raw model output must never drive pricing/rendering. `resolveQuotePlan` returns
`{ plan, status, findings }`:

- **accepted** — draft normalised cleanly with no coercions and no error findings.
- **normalised** — safe coercions/drops were applied (e.g. string `"16"` → `16`), no
  error findings.
- **fallback** — any **error** finding (or an unusable draft) → the deterministic
  `buildQuotePlan` is used instead. Invalid AI output can never corrupt the quote.

`validateQuotePlan` checks (errors force fallback): quoteType present (unknown → warning);
main bucket exists with `kind: "main"`; optional buckets are `kind: "optional"`; unique
ids / no bucket both main+optional; labour people/days/hours finite & positive;
measurements finite, positive, and plausible (out-of-range → warning); material
quantities not negative; **optional labour not mis-attributed to main**; and **a planting
length never attributed to a structural bucket** (retaining wall / fence / topsoil).

### What stays deterministic forever

Calculators, pricing/quantity math, KB/JMS/Xero mapping, renderer/assembler assembly, the
QuotePlan validation itself, and the Quote Overseer/Auditor. AI is confined to producing a
draft plan (understanding) and later advisory review — never final numbers or output.

### Next batch recommendation

**Slice 3c** — include optional priced works in Xero/JMS export. Then progressively move
the remaining scope-blind paths (`applyDeterministicLabourAllowances`,
`applyPerTaskHourAllowances`, materials/measurements ownership) behind the plan, and only
then wire a live AI `draftPlanner` (gated by `resolveQuotePlan`, behind an explicit
env/flag), starting in shadow mode where its plan is compared to `buildQuotePlan` but not
yet used. Each is a separate, approved batch.

## Superseded notes (kept for history)

- **Slice 3c** — include optional priced works in Xero/JMS export (still pending).
- The "Known issue — retaining wall 6M/16.8M" above was fixed in Milestone 1.
