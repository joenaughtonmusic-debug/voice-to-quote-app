# Measurement Extraction & Confidence MVP

This is a universal estimating utility for finding measurements and uncertainty in natural language text.

It is not a trade module. It lives in `lib/core/measurement-extraction/` because it should eventually benefit many trades, including decking, retaining, fencing, paving, planting, electrical, plumbing, and future modules.

## Purpose

Given natural language text, the extractor returns:

- measurements
- units
- normalized metre values when possible
- confidence
- source text
- review notices

Examples:

```text
Build a deck 4m x 5m
```

Returns two high-confidence metre measurements.

```text
Deck about 5 metres wide and maybe 3.8 metres out
```

Returns measurements with lower confidence and review notices.

```text
Retaining wall roughly 10 metres long and 800 high
```

Returns `10m` and an inferred `800mm` height with review notices.

## Architecture

This module is intentionally isolated.

It does not:

- modify `ProcessedQuote`;
- write to QuoteFacts;
- change customer preview;
- change Xero export;
- call OpenAI;
- assume any trade-specific meaning.

Measurements remain generic. Trade modules may later choose to consume this utility inside their own detectors or calculators, but the utility itself should not know about decks, retaining walls, fences, plants, or any other trade.

## Confidence

Confidence is deterministic:

- `high`: explicit measurement and unit with no uncertainty language.
- `medium`: approximate language, inferred unit, or missing/unknown unit.
- `low`: uncertainty language such as `maybe` or `possibly`.

Review notices explain why a measurement needs review.

## Future Integration Possibilities

Future modules may use this utility to:

- detect dimensions before running a trade calculator;
- preserve measurement source text;
- flag approximate or uncertain dimensions in internal review;
- avoid duplicating unit parsing in every trade module.

Do not wire this into `ProcessedQuote` or QuoteFacts until a future task explicitly chooses the integration boundary.
