# Voice-to-Quote Cursor Project Context

Voice-to-Quote is not a voice app.

It is an estimating engine that happens to accept voice as input.

## Current Architecture

Transcript / Paste Notes

↓

Correction

↓

Extraction

↓

ProcessedQuote

↓

Facts Layer

- QuoteFacts

- PricingFacts

- MeasurementFacts

- ReviewNotices

↓

Trade Calculators

↓

MaterialBill

↓

Resolver

↓

QuoteOptions

↓

Customer Quote Assembly

↓

QuoteDraft

↓

Xero / JMS Export

## Primary Architecture Authority

Read first:

- docs/VOICE_TO_QUOTE_BUILD_[CONSTITUTION.md](http://CONSTITUTION.md)

- docs/CURSOR_PROJECT_[CONTEXT.md](http://CONTEXT.md)

## Build Constitution Rules

1. Do not modify ProcessedQuote schema unless absolutely necessary.

2. Customer Quote Assembly is the source of truth for customer-facing quote structure.

3. Templates support wording and structure but do not replace facts.

4. Manual template selection wins.

5. Spoken customer price wins over calculated labour totals.

6. Acceptance tests must use the same path as the live QuoteDraft UI.

7. If tests pass but live QuoteDraft output is wrong, the workflow is not done.

8. Do not add trade-specific logic to universal core unless explicitly approved.

9. MaterialBill must remain source-agnostic.

10. Resolver handles JMS, supplier price lists, category defaults, and unpriced items.

## Completed MVPs

- Maintenance MVP

- Maintenance Xero Export MVP

- Garden Tidy MVP

- Planting MVP

- Decking MVP

- Retaining MVP

- Fencing MVP

- Paving MVP

- Supplier Price List Import MVP

- Decking live pricing from supplier price lists

## Current Strategic Phase

We are no longer trying to prove whether trade workflows can exist.

That is proven.

Current goal:

Complete launch-readiness for the landscaping estimating engine.

Highest-value milestones before launch:

1. Retaining priced via MaterialBill → Resolver

2. Paving priced via MaterialBill → Resolver

3. Fencing / Planting pricing where useful

4. Business Rules plan, not full build

5. Pilot user testing with real quotes

## MaterialBill Rule

MaterialBill is source-agnostic.

It may output:

- retaining_post

- retaining_timber

- concrete

- labour

- paving_paver

- paving_basecourse

- decking_board

- decking_joist

It must not know about:

- JMS

- Xero

- supplier SKU

- supplier price

- account code

- tax code

- markup rules

## Resolver Priority

Future intended priority:

1. JMS / Xero item match

2. Supplier Price List match

3. Category default

4. Unpriced / needs review

Supplier price lists are for estimating/pricing.

JMS/Xero items are for business-specific pricing, item codes, account codes, and tax codes.

Grouped vs itemised export belongs in the export/profile layer, not MaterialBill.

## Current Acceptance Workflow

For every new workflow or pricing milestone:

1. Create or update acceptance doc

2. Create executable acceptance test

3. Implement smallest usable behaviour

4. Test live-equivalent QuoteDraft path

5. Manual smoke test

6. Commit when usable, not perfect

## When Implementing New Work

Always state:

- activation rules

- source of truth

- outputs affected

- regressions protected

## Current Instruction

Stay at roadmap / launch-readiness level unless explicitly asked to implement.

Do not invent new architecture unless needed.

Prioritise:

- priced retaining

- priced paving

- quote review trust

- Xero draft quote path

- pilot user testing