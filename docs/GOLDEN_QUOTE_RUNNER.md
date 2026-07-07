# Golden Quote Runner

Headless regression harness for the quote engine. Lets us check real quote
contracts across every output layer **without** pasting transcripts into
localhost.

```bash
npm run test:golden-quotes
```

Location: `lib/golden-quotes/`

```
lib/golden-quotes/
  contracts.ts     # declarative contract types + evaluateContract() (pure)
  runner.ts        # buildProjection(): runs the REAL output-layer functions
  index.test.ts    # node:test entry — asserts each fixture, prints reports
  fixtures/
    michelia-planting.ts
    garden-bed-renovation.ts
    adam-titirangi.ts
  tsconfig.test.json
```

## What each fixture declares

- `transcript`
- `expectedClassification` (RegExp on `job_type`)
- `customerPreviewContains` / `customerPreviewMustNotContain`
- `internalFacts` (plant count, labour hours/total, materials …)
- `expectedMatchedLineItems` (JMS panel substrings)
- `expectedAudit` (pass, or must-include / must-not-include issue ids)
- `knownFailures` (documented current gaps, not asserted)
- `buildProcessedQuote()` (see mocked boundary below)

## What is REAL vs MOCKED

The runner reuses the app's own functions — it reimplements **no** domain logic:

| Layer | Real function used |
|---|---|
| Customer preview | `buildCustomerPreviewQuoteInput` → `buildCustomerQuotePreview` → `buildCustomerDraftPreviewModel` → `renderCustomerDraftPreviewText` |
| Quote Audit | `auditProcessedQuote` |
| Matched JMS | `formatMatchedJmsLineItems` |
| Internal review | `processedQuoteToEditableSections` |
| Plant maths | `calculatePlantingQuote` + `matchPlantRowsFromLibrary` (Michelia) |
| Labour maths | `recoverMissingLabourLineItem`, `extractPerTaskHourAllowances` |
| Pricing guard | `extractPricing` (garden-bed: proves no `$7/$2/$8`) |

**Mocked boundary:** the OpenAI extraction call and the ~35 post-processing
helpers trapped inside `app/api/process-quote/route.ts` cannot run headlessly.
So each fixture's `buildProcessedQuote()` **stubs the AI-extracted fields**
(classification, scope, materials, optional works) and rebuilds the
**deterministic** parts with the real exported helpers above. Every fixture
states exactly what it stubs in `mockingNotes`.

Consequence: the harness proves the **downstream** layers are correct given good
extraction. It does **not** by itself prove the route produces good extraction —
each fixture stubs the AI-extracted fields. Where a fix lives in deterministic
code, it is verified by a real unit test (e.g. the decking detector below).

### Adam/Titirangi routing fix (QA-3)

QA-2 added auditor validators that **detected** the Adam failures. QA-3 fixes the
first of them: the decking detector (`lib/trades/decking/detector.ts`) now
requires explicit deck intent, so `posts` + a `6m by 16.8m` area no longer trip
decking. Verified by `lib/trades/decking/index.test.ts`
("does not detect decking from a lawn/retaining job…").

The Adam fixture now encodes the **desired** mixed-landscaping output:

| Was (QA-2 broken) | Now (QA-3) |
|---|---|
| `job_type: decking`, `Deck area 1`, `Decking boards` | `general_landscaping`, no decking output |
| topsoil/lawn scope missing | retaining wall, polythene, topsoil, lawn seed in scope |
| suburb `Titirangi` dropped | `20 Lemnos Street, Titirangi` |
| audit fired V04/V06/V08 | V04, V06-decking-leak, V06-missing-topsoil/lawn-seed, V08 all resolved |

Adam's audit status is still `needs_review` because `V06-optional-hedge-unwarned`
remains **by design**.

### Adam/Titirangi topsoil + lawn seed (QA-4)

Two deterministic calculators now compute the lawn-establishment facts (verified by
`lib/calculators/lawn-establishment.test.ts`, `npm run test:lawn-establishment`):

- `lib/calculators/soil-volume.ts` — `6m × 16.8m × 50mm` → **100.8m² / 5.04m³**
  (requires an explicit "depth"/"deep" word, so a `400mm high` wall is never read
  as a spread depth; never fires on decking/planting text).
- `lib/calculators/lawn-establishment.ts` — parses `5kg bag, $129 for the bag` →
  `{ lawn seed, 1 bag, 5kg, $129, spoken }` (`5kg` is never read as `$5`).

The Adam fixture calls these, so its topsoil line (`Qty 5.04 m3`) and lawn-seed line
(`Qty 1 bag`, `Total 129`) are genuinely computed. KB item mapping for those lines
remains future work (`needs_review`). Still future: hedge plant-count/spacing and
retaining post-spacing/drainage.

## Route extraction — DONE (the REAL pipeline is now callable headlessly)

The transcript→ProcessedQuote pipeline was moved out of the Next.js POST handler
into `lib/pipeline/process-transcript.ts`. Behaviour is unchanged — it is the same
code, moved verbatim (the only substantive edits were injecting the two OpenAI
calls as deps and two type-only casts that the route previously relied on
`typescript.ignoreBuildErrors` to hide).

```ts
processTranscriptToQuote(
  input: ProcessTranscriptInput,          // { transcript, templateContext?, knowledgeItemContext?, primaryTrade?, ... }
  deps?: ProcessTranscriptDeps,           // { classify?, extractQuote?, logger? } — inject to run offline
): Promise<ProcessTranscriptResult>       // { quote, fallbackUsed, classification, leadDetails }
```

- `app/api/process-quote/route.ts` is now a thin wrapper: parse request → call
  `processTranscriptToQuote` → `NextResponse.json(result.quote)`.
- **What is now callable headlessly:** the full deterministic pipeline — lead
  extraction, the 18-step nested chain, `apply*BillOptions`, calculators,
  `recoverMissingLabourLineItem`, `normaliseDaysLabourLineItem`,
  `clearStaleLabourWarningsAfterRecovery`, and `auditProcessedQuote`. Verified by
  `lib/pipeline/process-transcript.test.ts` (`npm run test:pipeline`): the real
  pipeline recovers labour to 12h/$1,320 and attaches `audit_result` with **no
  browser and no live OpenAI**.
- **What still needs mocking:** the two OpenAI calls — `classify` (classification)
  and `extractQuote` (the extraction that returns the raw `ProcessedQuote`). Tests
  inject both via `deps`. Everything after extraction is real.

### Pipeline-backed golden quotes (QA-5)

A fixture can now be driven through the **real** pipeline instead of its
hand-authored `buildProcessedQuote()`. Add a `pipeline` block to the fixture:

```ts
pipeline: {
  extractedQuote,   // raw AI output (imperfect on purpose — e.g. no labour line)
  knowledgeItems,   // KB context: plant rows + labour item (top-level fields)
  classification,   // { specialist, reason }
}
```

`runGoldenQuoteThroughPipeline(fixture)` (in `runner.ts`) calls
`processTranscriptToQuote` with those mocked deps, then asserts the **same**
declarative contract against the real result via the shared
`buildProjectionFromQuote`.

**Michelia is now pipeline-backed.** The golden suite has a test
("Golden Quote 1 — Michelia planting (PIPELINE-BACKED)") that runs the Michelia
transcript through `processTranscriptToQuote` with a mocked extraction that has
**no plant results and no labour line**, and proves the real pipeline computes
plant count 30 / spacing 500mm, recovers labour to 12h/$1,320, attaches
`audit_result`, keeps the timber border optional, and produces no `long hedge` /
`metres long. The` — all with no live OpenAI and no browser.

| Golden quote | Fixture-path test | Pipeline-backed test |
|---|---|---|
| Michelia planting | ✅ | ✅ (QA-5) |
| Garden bed renovation | ✅ | ✅ (QA-6) |
| Adam/Titirangi | ✅ | ⚠️ partial (QA-7) — see below |

### Partial pipeline-backed Adam/Titirangi (QA-7)

Adam/Titirangi is now driven through the **real** `processTranscriptToQuote`, but its
pipeline-backed test ("Golden Quote 3 — Adam/Titirangi (PIPELINE-BACKED, PARTIAL)")
is deliberately **partial**. Unlike Michelia and Garden Bed — where the live pipeline
reproduces the full desired contract — the Adam transcript currently **diverges** from
the QA-3 hand-built desired state in three ways when run through the live pipeline:

1. **Classification** — job_type is normalised to `retaining` (the retaining
   component takes over the lawn-levelling primary) instead of `general_landscaping`.
2. **Customer preview** — taken over by the retaining/planting renderer; it renders a
   "Retaining Wall Quote" and **drops** the polythene / topsoil / lawn-seed scope
   (so `V06-missing-topsoil-lawn-scope` and `V06-missing-lawn-seed` fire).
3. **Address** — the real lead extractor drops the `Titirangi` suburb
   (`V08-suburb-missing` fires); only `20 Lemnos Street` survives.

These are **runtime gaps, not test gaps** — the fixture-path test masks them by
hand-building the target `ProcessedQuote`. They are recorded in the fixture's
`knownFailures` and are broader than QA-8 (which only wires the lawn calculators):
fixing the retaining-vs-landscaping classification, the renderer takeover, and the
suburb extraction is a future runtime batch.

The QA-7 pipeline-backed test therefore asserts **only the subset the live pipeline
genuinely gets right**: it runs headlessly with an `audit_result`, recovers the client
name (`Adam`), keeps the decking gate closed (no decking line items/artefacts), keeps
the optional Ficus hedge optional, and preserves the supplied topsoil (`Qty 5.04 m3`)
and lawn-seed (`Qty 1 bag`, `Total 129`, no `$5` misread) material lines through to the
JMS panel. The fixture-path tests still assert the full desired contract.

### Pipeline-backed Garden Bed renovation (QA-6)

**Garden Bed is now pipeline-backed.** The golden suite has a test
("Golden Quote 2 — Garden bed renovation (PIPELINE-BACKED)") that runs the Garden
Bed transcript through `processTranscriptToQuote` with a mocked extraction that has
**no labour line item**, and proves the real pipeline's `applyPerTaskHourAllowances`
sums the per-task allowances (7h + 2h + 8h) to **17h** and prices them at $110/hr →
**$1,870** (`Qty 17 hours`, `Total 1870` in the JMS panel), attaches `audit_result`,
classifies as `general_landscaping` (not retaining), keeps garden mix/mulch in
optional works only (never in required materials), produces **no** `$7` / `$2` / `$8`
pricing facts, and yields a customer preview with no `Title:` / `Job type:` /
`Cadence:` leak and no Retaining/Planting/One-Off Garden Tidy takeover — all with no
live OpenAI and no browser.

The fixture's two labour internal-facts compare `Number(...)` (not exact strings) so
the same contract passes on both paths: the fixture path hand-sets `"1870"`, while
the pipeline path totals `"1870.00"` (`calculateLineItemTotal` uses `toFixed(2)`).

## Adding a new golden quote

1. Add `lib/golden-quotes/fixtures/<name>.ts` exporting a `GoldenQuoteFixture`.
2. Register it in the `FIXTURES` array and add a `test(...)` in `index.test.ts`.
3. Add its files to `tsconfig.test.json` `include` if tsc does not pick them up.
