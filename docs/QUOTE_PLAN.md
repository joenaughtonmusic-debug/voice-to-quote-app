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

## Next slice (not implemented)

- **Slice 3c** — include optional priced works in Xero/JMS export.
- Then progressively move the remaining scope-blind paths
  (`applyDeterministicLabourAllowances`, `applyPerTaskHourAllowances`, materials,
  measurements, classification/template selection) behind the plan. Each is a
  separate, approved batch.
