# Scope Notes

This module extracts universal exclusions and scope notes from estimator-style transcript text.

It is intentionally isolated. It does not modify `ProcessedQuote`, does not contribute `QuoteFacts`, and does not affect customer preview, Xero export, trade calculators, or review notices.

## Purpose

The extractor captures trade-neutral scope signals such as:

- exclusions: `No staining`
- inclusions: `Allow time for tidy up`
- client-supplied items: `Client supplying plants`
- retained or existing items: `Posts are staying`
- not-required work: `No removal needed`
- site notes: `Access is poor`

Each note includes:

- `type`
- `label`
- `source_text`
- `confidence`
- optional `metadata`

## Future Integration

Future work may use these notes to populate `QuoteFacts`, internal review cards, customer preview wording, or Xero/internal notes. That should be a separate integration task with explicit acceptance tests.

Scope notes are not pricing by themselves. They are deterministic guidance and should not create line items, totals, exclusions, or export rows until a future workflow chooses that boundary.
