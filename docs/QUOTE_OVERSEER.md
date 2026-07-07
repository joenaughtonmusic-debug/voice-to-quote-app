# Quote Overseer (MVP)

A deterministic, local **post-generation review layer**. It runs *after* a quote
is generated and rendered, over the assembled output artifacts, and returns
structured findings. It **never mutates the quote** and **does not call OpenAI**.

```
Transcript → deterministic quote engine → customer preview / JMS / Xero lines → reviewQuote(...) → findings
```

Location: `lib/quote-overseer/` — `reviewQuote(input): QuoteOverseerResult`.

## Overseer vs Quote Auditor

| | Quote Auditor (`lib/quote-auditor`) | Quote Overseer (`lib/quote-overseer`) |
|---|---|---|
| Runs | inside the pipeline, before rendering | after generation, on rendered output |
| Sees | the `ProcessedQuote` | rendered customer copy, JMS panel, Xero lines, renderer path |
| Checks | V01–V08 (data-level) | cross-layer / output artifacts |
| Mutates? | no (attaches `audit_result`) | no |

The Overseer complements the Auditor — it does **not** duplicate V01–V08. It
catches the class of bug the Auditor structurally cannot see, e.g. a renderer
takeover that drops real scope from the customer copy.

## Input / output

- `QuoteOverseerInput`: `{ quote, customerPreviewText, rendererPath?, matchedJmsLines?, xeroExportLines?, rawTranscript? }`
- `QuoteOverseerResult`: `{ status: "ok" | "review" | "blocked", findings, errorCount, warningCount }`
  - `ok` = no findings; `review` = warnings/info only; `blocked` = at least one error.
- `QuoteOverseerFinding`: `{ id, check, severity, layer, message, evidence?, suggestion? }`

## Reviewers (MVP)

| Check | id prefix | Severity | What it flags |
|---|---|---|---|
| `customer_preview_leaks_labour` (O2) | `O2-…` | error | Labour hours/cost exposed in customer copy (not ordinary prices) |
| `export_mapping_incomplete` (O4) | `O4-…` | warning | Missing item/account/tax mapping — **only when `xeroExportLines` supplied**; reuses `collectXeroLineItemWarnings` |
| `customer_preview_missing_scope` (O5) | `O5-…` | warning | A primary scope item whose *distinctive* terms are entirely absent from the preview |
| `customer_copy_not_ready` (O7) | `O7-…` | error | Metadata labels (`Title:`/`Job type:`/`Cadence:`), raw `job_type` slug, or a verbatim internal note in customer copy |

Design notes:
- **O5 is conservative** — it only flags when *none* of a scope item's distinctive
  tokens (content words unique to that item) survive in the preview, so ordinary
  paraphrasing never trips a false positive.
- **O2 targets labour only** — customer quotes may legitimately show prices/totals.
- **O4 is opt-in** — it never runs on the customer-preview smoke tests, so known KB
  gaps don't fail them.
- Reviewers are pure `(input) => finding[]` functions composed in `index.ts`; one
  throwing is surfaced as an `info` finding and never crashes the layer.

## Status / next

- **Not wired into the pipeline or route yet** — MVP is the library + tests only.
- Future reviewers: O1 unit mismatch, O3 labour-total consistency, O6 renderer-path
  mismatch. An AI/OpenAI review pass is explicitly out of scope for this MVP.

## Tests

- `npm run test:quote-overseer` — per-reviewer positive/negative cases (synthetic inputs).
- `npm run test:golden-quotes` — "Quote Overseer produces no customer-preview findings
  on the good golden quotes" (no false positives on the three real projections).
