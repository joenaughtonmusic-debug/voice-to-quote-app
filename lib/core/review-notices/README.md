# Review Notices MVP

This module is an isolated universal review/assumptions layer.

It is intended to eventually surface uncertainty, missing information, and estimator checks before quote preview or export.

Potential future checks include:

- approximate measurements
- inferred units
- missing measurements
- missing materials or species
- missing access notes
- missing waste or disposal notes
- trade-specific review checks

## Current Status

The MVP is isolated and testable.

It does not:

- modify `ProcessedQuote`;
- write to QuoteFacts;
- change customer preview;
- change Xero export;
- change template recommendation;
- change planting, decking, retaining, or measurement extraction behaviour.

The only current contributor converts measurement extraction signals into universal review notices.

## Architecture

Review notices use a small contributor registry:

```text
ReviewNoticeInput
↓
ReviewNoticeContributor[]
↓
buildReviewNotices(input)
↓
ReviewNotice[]
```

Each notice has:

- `id`
- `message`
- `severity`
- `source`
- `category`
- optional metadata

## Severity

Review notices are guidance by default. They must not block quote creation unless a future workflow explicitly treats `error` notices as blocking.

- `info`: useful context or a soft review reminder.
- `warning`: should be reviewed before sending or export.
- `error`: reserved for future hard validation.

## Measurement Contributor

The measurement contributor currently creates notices for:

- approximate language such as `about`, `roughly`, `around`, and `approximately`;
- uncertain language such as `maybe` and `possibly`;
- inferred or missing units such as `800 high` inferred as `800mm`.

Clean exact measurements such as `4m x 5m` produce no review notices.

## Future Integration

This module may later power an internal review UI, trade-specific review sections, or pre-export checks.

Any integration should be explicit, opt-in, and covered by regression tests.
