# Talk to Quote

> Global context about Joe and how to work with him lives in `~/.claude/CLAUDE.md`.

## Positioning

Started as a voice-to-quote app; better understood as **an estimating engine that happens to accept voice.** **Talk to Quote** is the product name.

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

## Two modes

A mode switch at quote start (`components/voice-quote-app.tsx`):

- **Gardening** — the finished, rule-based auto-quoter (tidy + maintenance). Leave as-is.
- **Landscaping** — the "build it fast, my judgement stays in" builder (L0–L5 done):
  talk → split into confirmable work-area chunks → match lines to imported price lists
  (list price / suggest+flag, never invent) → deterministic spacing/count → assemble to
  customer/team/internal with GST-inclusive total and Xero parity. All under
  `lib/landscaping/` + `components/landscaping-builder-screen.tsx`. See
  `docs/LANDSCAPING_BUILDER_SPEC.md`.

## Trade modules

Done or started: planting, decking, retaining, paving, fencing, garden maintenance, one-off garden tidy-ups.

**Planting logic:** hedge length, plant spacing, plant quantity, pot/plant-size options, optional planting alternatives, labour and materials, review warnings. Typical spacing defaults — small plants 450mm, medium 600mm, medium/large hedging 850mm, buxus 250mm. **Manual template selection overrides automatic classification.**

## Three outputs (different purposes — don't mix them)

- **Customer** — clear outcome, scope, inclusions, exclusions/options and price. No internal labour-hour calculations. (See the `quote-writing` skill.)
- **Internal** — measurements, assumptions, calculations, costs, pricing logic, confidence and review notices.
- **Team** — practical site instructions: access, hazards, sequence and scope needed to deliver the job.

## Testing philosophy

Use real pipeline-backed acceptance tests, not isolated demos that bypass production logic. Important tests verify: extracted facts, calculator output, customer quote output, internal output, export lines, warnings, pricing source, no accidental trade classification, no silent loss of user-supplied information.

## Glossary

- **Golden Quote** — a representative acceptance-test quote that must hold across the real pipeline and all output layers.
- **Facts Layer / QuoteFacts** — structured, auditable facts extracted *before* calculation and rendering.
- **MaterialBill** — source-agnostic calculated materials and quantities, before price resolution.
- **Resolver** — applies the pricing-source priority and maps calculated items to prices/codes.
- **Customer Quote Assembly** — the authoritative construction layer for customer-facing quote content (source of truth).
- **Review notice** — a non-blocking warning about missing, uncertain or inconsistent quote information; guides review without blocking quote creation.
- **JMS** — job-management system, or its item/export mapping layer.
- **KB** — knowledge base of business rules, templates, items and pricing knowledge.

## Trade terms

- **Garden tidy** — usually a one-off, outcome-led cleanup; best next lead step is a short site meeting.
- **Garden maintenance** — recurring service sold per visit at an agreed cadence.
- **Green waste** — organic job waste, charged separately or accounted for in the quote price.
