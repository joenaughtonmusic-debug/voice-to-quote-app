# Quote Engine (working name: GenQuote)

> Global context about Joe and how to work with him lives in `~/.claude/CLAUDE.md`.

## Positioning

Started as a voice-to-quote app; better understood as **an estimating engine that happens to accept voice.** Naming ("GenQuote") not final.

## Purpose

Convert a spoken or pasted site-visit description into: structured job facts, measurements, calculated quantities, labour estimates, material requirements, pricing, review warnings, customer-facing quote content, internal estimating content, team instructions, and Xero / job-management-system export lines.

## Core principle

**AI interprets language; deterministic code performs calculations.** The language model must NOT be the sole source of truth for: areas, volumes, plant quantities, spacing, material quantities, labour formulas, pricing calculations.

## Pipeline

1. Transcript or pasted notes → 2. Trade-term correction → 3. Structured extraction → 4. Processed quote → 5. Facts layer → 6. Trade calculators → 7. Material bill → 8. Price resolver → 9. Quote options → 10. Customer quote assembly → 11. Quote draft → 12. Xero/JMS export.

**Customer Quote Assembly remains the source of truth for customer-facing output.** Don't change established data structures such as `ProcessedQuote` unless genuinely necessary.

## Pricing priority (when several prices could apply)

1. Spoken price → 2. Manual user edit → 3. Business rule → 4. Supplier price list → 5. Xero/JMS item → 6. Calculator default → 7. Unpriced and flagged for review.

**Never silently substitute a dubious price.** Spoken pricing overrides imported/default pricing.

## Trade modules

Done or started: planting, decking, retaining, paving, fencing, garden maintenance, one-off garden tidy-ups.

**Planting logic:** hedge length, plant spacing, plant quantity, pot/plant-size options, optional planting alternatives, labour and materials, review warnings. Typical spacing defaults — small plants 450mm, medium 600mm, medium/large hedging 850mm, buxus 250mm. **Manual template selection overrides automatic classification.**

## Testing philosophy

Use real pipeline-backed acceptance tests, not isolated demos that bypass production logic. Important tests verify: extracted facts, calculator output, customer quote output, internal output, export lines, warnings, pricing source, no accidental trade classification, no silent loss of user-supplied information.
