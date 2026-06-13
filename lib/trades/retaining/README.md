# Retaining Trade Module MVP

This module is an isolated foundation for retaining wall intelligence. It follows `docs/TRADE_MODULE_CONTRACT.md` and is not wired into the live quote flow yet.

## Boundary

Universal Quotecord behaviour remains outside this module:

- transcript capture
- transcription
- generic quote extraction
- `ProcessedQuote` schema
- QuoteFacts registry
- customer preview
- quote saving
- Xero/JMS export

Retaining-specific behaviour belongs here:

- detecting likely retaining wall text
- extracting simple wall sections
- calculating wall face area
- preserving replacement/new wall signals
- preserving timber, drainage, post, access, and waste/removal notes
- preparing review-friendly calculator results
- future retaining renderers and export intent

This module must not import or modify planting or decking modules. Existing planting and decking regressions should remain unaffected.

## MVP Calculator Scope

The current calculator only performs deterministic face-area arithmetic:

```text
length x height = wall face square metres
```

It supports one or more wall sections and returns:

- face area per wall section
- total face area
- new/replacement/unknown wall kind
- timber retaining flag
- drainage flag
- posts/post holes flag
- access difficulty flag
- waste/removal notes
- review warnings

It does not calculate:

- post count
- hole depth
- timber quantities
- concrete volumes
- drainage metal quantities
- labour prices
- material prices
- engineering requirements

Those belong in later, reviewable calculator phases.

## Editable Output

`RetainingCalculatorResult` is designed to be shown in an internal review step before any customer rendering or export:

- each section has a stable `id`
- dimensions stay editable
- calculated face area records its source
- warnings point to fields that need confirmation
- scope flags are explicit values instead of prose

## Example

Input:

```text
Build a 10m long retaining wall, 600mm high.
```

Expected calculator result:

- Wall 1: `10m x 0.6m`, `6m2`
- Total face area: `6m2`

## Future Integration

Recommended next steps:

1. Add QuoteFacts contribution through `lib/trades/registry.ts`.
2. Add an internal review card for retaining calculator results.
3. Add a customer renderer behind explicit retaining module support.
4. Add Xero/JMS export intent lines after user-confirmed export mappings exist.
