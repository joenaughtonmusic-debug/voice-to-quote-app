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

## Route-extraction plan (to make the REAL pipeline testable end-to-end)

Today the transcript→ProcessedQuote pipeline only exists inside the Next.js POST
handler. To let fixtures call the real pipeline, extract it — mechanically, no
logic change:

1. **Create `lib/pipeline/process-transcript.ts`** exporting a pure
   `processTranscript(input): Promise<ProcessedQuote>` that contains the current
   body of `POST` in `app/api/process-quote/route.ts` (the 28-step chain +
   `recoverMissingLabourLineItem` / `normaliseDaysLabourLineItem` /
   `clearStaleLabourWarningsAfterRecovery` / `auditProcessedQuote`).
2. **Inject the LLM call** as a parameter (`extract: (prompt) => Promise<rawJson>`)
   so tests can pass a **recorded extraction fixture** and run fully offline.
   Production passes the real OpenAI call.
3. **Reduce the route** to a thin wrapper that parses the request, calls
   `processTranscript`, and returns `NextResponse.json`.
4. **Export the currently route-local post-processors** that the fixtures had to
   re-stub — notably `applyPerTaskHourAllowances` (garden-bed labour line
   assembly) and the classification/normalisation helpers — so
   `buildProcessedQuote()` can be replaced by a recorded-extraction → real-pipeline
   run.
5. Once (1)–(4) land, swap each fixture's `buildProcessedQuote()` for
   `processTranscript(transcript, { extract: recordedExtraction })`. The
   contracts stay identical; only the input source changes. Adam will then
   reflect **real** current output and its `knownFailures` become the backlog.

Do this as its own batch (it is the "extract pipeline" item in the Batch-1 plan);
it is intentionally **out of scope** for the initial harness so no broad refactor
of the 3,230-line route happens under the same change.

## Adding a new golden quote

1. Add `lib/golden-quotes/fixtures/<name>.ts` exporting a `GoldenQuoteFixture`.
2. Register it in the `FIXTURES` array and add a `test(...)` in `index.test.ts`.
3. Add its files to `tsconfig.test.json` `include` if tsc does not pick them up.
