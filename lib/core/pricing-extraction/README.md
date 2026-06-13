# Pricing Extraction MVP

This module extracts pricing facts from estimator-style transcript text using deterministic parsing only.

It is isolated for now. It does not modify `ProcessedQuote`, customer preview, Xero export, template recommendation, or trade modules.

## What It Detects

- Fixed prices such as `$405` or `price is $1440`
- Cadence such as `per visit`, `monthly`, `per month`, and `per week`
- Inclusions introduced by `including ...`
- Optional extras such as `Optional extra ... additional $55`
- Estimate ranges such as `$1200 to $1500` or `between $1200 and $1500`
- Approximate allowances such as `in the region of $2000`

## Output

The extractor returns trade-neutral `PricingFact` records:

- `type`
- `amount`
- `amount_min`
- `amount_max`
- `currency`
- `cadence`
- `label`
- `inclusions`
- `source_text`
- `confidence`
- optional `metadata`

## Future Integration

Pricing facts are intended to later feed QuoteFacts, customer preview, and Xero/export workflows.

Until that wiring exists, extracted prices are reviewable assumptions only. They are not automatic final pricing and should not be treated as quote totals by downstream systems.

## Run Tests

```bash
npm run test:pricing
```
