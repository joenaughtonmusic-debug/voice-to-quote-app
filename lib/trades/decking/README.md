# Decking Trade Module MVP

This module is the first isolated foundation for decking-specific intelligence. It is intentionally not wired into the live quote flow yet.

## Boundary

Universal Quotecord behaviour remains outside this module:

- transcript capture
- transcription
- generic quote extraction
- customer review shell
- quote saving
- Xero/JMS export adapter orchestration

Decking-specific behaviour belongs here:

- detecting likely decking text
- representing deck areas
- calculating simple square metre totals
- preserving subframe/posts/framing notes
- collecting waste/removal notes
- preparing editable calculator results
- future decking renderers and export intent

This module must not import or modify the planting module. Planting regressions should remain unaffected.

## MVP Calculator Scope

The current calculator only performs deterministic area arithmetic:

```text
length x width = square metres
```

It supports one or more deck areas and returns:

- area per section
- total deck area
- board type when supplied
- full build / boards-only / unknown scope
- existing posts/subframe flags
- waste/removal notes
- review warnings

It does not calculate:

- joist counts
- bearer sizes
- post quantities
- concrete volumes
- fixing quantities
- labour prices
- material prices

Those belong in later, reviewable calculator phases.

## Editable Output

`DeckingCalculatorResult` is designed to be shown in an internal review step before any customer rendering or export:

- each area has a stable `id`
- dimensions stay editable
- calculated area records its source
- warnings point to fields that need confirmation
- scope flags are explicit enums instead of prose

## Example

Input:

```text
Quote for Steve at 12 Oak Road. Build a 4m x 5m pine deck. Also replace decking boards on a 3m x 4m section where posts already exist. Remove old decking waste.
```

Expected calculator result:

- Area 1: `4m x 5m`, `20m2`, `full_build`
- Area 2: `3m x 4m`, `12m2`, `decking_boards_only`, existing posts
- Total area: `32m2`
- Waste/removal: old decking waste
- Warnings: confirm subframe status where unclear

## Future Integration

Recommended next steps:

1. Add tests around `calculateDecking` and `detectDeckingFromText`.
2. Add a decking extraction profile that produces `DeckingCalculatorRequest`.
3. Add an internal review card for decking calculator results.
4. Add a customer renderer behind explicit decking module selection.
5. Add Xero/JMS export intent lines after user-confirmed export mappings exist.
