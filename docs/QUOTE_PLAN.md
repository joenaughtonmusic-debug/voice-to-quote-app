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

## Next slice (not implemented)

Wire `buildQuotePlan` into `processTranscriptToQuote` as a **dormant, injectable
`planQuote` dep**, and make one consumer read it: feed `plan.main` labour text (not the
whole transcript) into `recoverMissingLabourLineItem`, and emit optional-bucket labour
as an optional line item. That is the first real behaviour change (fixes Adam's hedge
in the live pipeline) — a separate, approved batch.
