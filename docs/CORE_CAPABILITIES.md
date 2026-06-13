# Core Capabilities

This document tracks universal estimating capabilities that are not trade modules.

Core capabilities should be reusable by multiple trades without adding trade-specific fields to `ProcessedQuote` or leaking trade-specific behaviour into the universal workflow.

## Regression Commands

Run universal core capability tests with:

```text
npm run test:core
```

Run trade module regressions with:

```text
npm run test:trades
```

Current core command coverage:

- `npm run test:measurements`
- `npm run test:review-notices`

Current trade command coverage:

- `npm run test:decking`
- `npm run test:retaining`

## Measurement Extraction

Location:

```text
lib/core/measurement-extraction/
```

Purpose:

- Detect generic measurements from natural language text.
- Normalize supported units where possible.
- Flag approximate or uncertain measurements.
- Produce review notices.

Current status:

- Isolated and testable.
- Not wired into `ProcessedQuote`.
- Not wired into QuoteFacts.
- Not wired into customer preview.
- Not wired into Xero export.
- Not used by planting, decking, or retaining yet.

This isolation is intentional. Future tasks may choose to consume measurement extraction inside a trade module or internal review flow, but that wiring should be explicit and covered by regression tests.

## Review Notices

Location:

```text
lib/core/review-notices/
```

Purpose:

- Convert reusable review signals into universal review notices.
- Provide a contributor registry for future core or trade review checks.
- Represent severity, source, category, message, and metadata in a trade-neutral shape.

Current status:

- Isolated and testable.
- Not wired into `ProcessedQuote`.
- Not wired into QuoteFacts.
- Not wired into customer preview.
- Not wired into Xero export.
- Not used by planting, decking, or retaining yet.

Current contributor coverage:

- Measurement extraction notices for approximate measurements, uncertain measurements, and inferred/missing units.

Review notices are guidance. They should not block quote creation unless a future workflow explicitly treats `error` notices as blocking.

## Core Rules

Core capabilities must:

- Stay trade-neutral.
- Avoid hardcoded trade assumptions.
- Avoid changing `ProcessedQuote` for specialist needs.
- Avoid account code, tax code, or template responsibilities.
- Remain deterministic unless a future architecture document explicitly allows otherwise.

Core capabilities may:

- Provide reusable parsing, confidence, review, or normalization helpers.
- Be consumed by trade modules.
- Contribute to future QuoteFacts only through explicit integration work.
