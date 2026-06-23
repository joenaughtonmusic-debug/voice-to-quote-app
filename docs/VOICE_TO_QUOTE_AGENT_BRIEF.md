# Voice-to-Quote Agent Context

## Product goal

Voice-to-Quote is not just a transcript-to-preview tool. It is an estimating and quoting engine.

The goal is to produce accurate, reviewable, sendable quotes that flow through to Xero/JMS with the correct:

* customer wording
* internal estimating facts
* labour/material/greenwaste pricing
* account codes
* tax codes
* item/source mappings
* review warnings where something is missing

A workflow is not considered working just because the customer preview looks good.

## Critical acceptance rule

A quote is only acceptable when all relevant layers agree:

1. Customer quote preview
2. Internal review
3. Pricing basis
4. Xero/JMS export lines
5. Account/tax/item mappings
6. Missing-data warnings

Do not optimise one layer by breaking another.

## Pricing principles

Do not invent prices from random extracted numbers or generic fallback lines.

However, structured estimating facts may be used for pricing when they come from explicit job facts and configured business rules.

Examples:

* “2 people for a full day” is a structured labour allowance.
* “2 trailer loads of greenwaste” is a structured greenwaste allowance.
* These may be used internally for pricing if configured business rates exist.
* These should not be exposed in the customer-facing quote or Xero description unless explicitly intended.

The system must distinguish between:

* spoken/manual customer price
* resolver/itemised pricing
* structured business-rule pricing
* unsafe inferred pricing
* missing price requiring review

Zero-dollar export lines are acceptable only as a review-required state, not as a finished quote.

## Xero/JMS export principles

Xero/JMS export is a first-class output, not a fallback after preview.

Every export line should preserve where possible:

* description
* quantity
* unit price
* total
* account code
* tax code/type
* item code
* source item ID
* pricing source
* warnings/defaulted state

Do not silently fall back to a generic “Labour” line if structured workflow data exists.

## Pristine Gardens one-off tidy / hedge trimming export policy

For one-off garden tidy, hedge trimming, hedge reduction, pruning, and similar jobs, Xero export should follow Pristine Gardens style.

### Labour line

* Description contains the customer-facing scope of work.
* Description must not expose labour allowance, crew size, hours, days, or internal pricing assumptions.
* Price should come from spoken/manual price or structured business-rule labour pricing.
* Labour account and tax mapping must be applied.

### Greenwaste line

* Greenwaste should be a separate export line when captured.
* Description should be customer-safe, for example: “Greenwaste removal — 2 trailer loads”.
* Price should come from configured greenwaste pricing or a matched greenwaste line item.
* Greenwaste account and tax mapping must be applied.
* If price or mapping is missing, show a review warning.

## Example Pristine style

A real Pristine Gardens hedge quote uses this pattern:

Line 1: Labour
Description contains hedge reduction scope.
Amount contains labour price.

Line 2: Greenwaste
Description: Greenwaste tip fee / off-loading / vehicle servicing.
Amount contains greenwaste price.

The export is not acceptable if it has good wording but no labour price, no greenwaste price, or no account/tax codes when those should be available.

## Current known risk

The app has sometimes improved the customer preview while breaking or weakening export.

Known bad patterns to avoid:

* nice customer preview but Xero says only “Labour”
* scope present but labour price missing
* greenwaste captured but no greenwaste line
* greenwaste line present but no price/account/tax
* internal labour allowance exposed in Xero/customer wording
* fake inferred labour totals used as customer price
* account/tax mappings dropped in export

## Development approach

Prefer global framework fixes where possible, but workflow-specific adapters are expected.

Correct architecture:

Global quote/export framework

* workflow-specific rendering/export policy

Do not rebuild all workflows at once. Fix one workflow with tests, preserve existing working behaviour, then generalise carefully.

## Current priority

Before adding new features, make existing quote workflows produce accurate sendable exports.

For garden tidy / hedge trimming, the next fix must ensure:

* scope-only Labour line
* separate Greenwaste line
* structured labour pricing when configured
* structured greenwaste pricing when configured
* Labour account/tax mapping
* Greenwaste account/tax mapping
* no labour allowance exposed
* no fake generic fallback price
