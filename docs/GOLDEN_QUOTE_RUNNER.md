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
extraction. It does **not** yet prove the route produces good extraction. Golden
Quote 3 (Adam) is hand-authored to the **current broken** output and asserts the
bugs persist, so the suite turns red the moment the pipeline improves.

### Adam/Titirangi auditor coverage (QA-2)

The deterministic Quote Auditor now **detects** the Adam failures (detection
only — the quote is still wrong). The Adam fixture asserts these fire:

| Issue id | Catches |
|---|---|
| `V04-decking-on-non-decking` | decking calculator output on a non-decking transcript |
| `V06-decking-scope-leak` | `Deck area 1` / `Decking boards` in customer scope |
| `V06-missing-topsoil-lawn-scope` | topsoil/lawn establishment spoken but absent from the preview |
| `V06-missing-lawn-seed` (warning) | lawn seed spoken but omitted |
| `V06-optional-hedge-unwarned` (warning) | optional Ficus hedge present but never calculated/warned |
| `V08-suburb-missing` (warning) | `20 Lemnos Street in Titirangi` → suburb dropped |

Adam's audit status is therefore `needs_review`. Still **undetected / unfixed**
(future batches): topsoil volume calculation (5.04m³), preserving the `$129` lawn
seed price on a line item, and actually calculating the optional hedge.

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
