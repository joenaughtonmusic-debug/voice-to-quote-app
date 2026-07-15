# Trade Module Contract

This document defines how trade modules plug into Talk to Quote without polluting the universal core. It is intended for future modules such as retaining, fencing, electrical, plumbing, painting, cleaning, arborist work, and other specialist trades.

The contract keeps Talk to Quote's core universal while allowing trade-specific detection, calculations, rendering, export intent, and internal review support to live behind clear module boundaries.

For the practical folder scaffold and step-by-step implementation checklist, use [Trade Module Scaffold](./TRADE_MODULE_SCAFFOLD.md).

## Folder Pattern

Trade modules should live under:

```text
lib/trades/{trade}/
```

A mature module may include:

```text
lib/trades/{trade}/
  detector.ts
  calculator.ts
  quote-facts.ts
  customer-renderer.ts
  xero-renderer.ts
  review.ts
  index.ts
  README.md
  *.test.ts
```

Not every file is required on day one. Add files only when the module has real behaviour to isolate.

## Allowed Responsibilities

Trade modules may own:

- Detection of trade-specific work from an existing `ProcessedQuote`.
- Optional deterministic calculations.
- Contribution of trade-specific `QuoteFact` records.
- Customer renderer helpers for trade-specific wording.
- Xero renderer helpers for trade-specific export intent lines.
- Internal review helpers for assumptions, warnings, and calculated values.
- Isolated tests and regression coverage for the module.

The module should be review-friendly. If it calculates something, the result should be structured so the user can inspect and edit it before quote, preview, or export decisions rely on it.

## Forbidden Responsibilities

Trade modules must not:

- Add trade-specific fields to `ProcessedQuote`, such as `deck_length`, `fence_height`, or `pipe_diameter`.
- Hardcode account codes, tax codes, or source-system item codes.
- Control template structure or template section order.
- Force calculator use when a quote can proceed without it.
- Leak trade-specific logic into `lib/core/`.
- Treat templates as inventory, pricing, account-code, or tax-code authority.
- Expose internal assumptions as customer-facing wording unless a customer renderer explicitly chooses safe wording.

Templates control presentation and wording. Price lists and inventory control item codes, account codes, tax codes, and prices. Export mappings control category/account/tax fallback.

## Integration Path

Trade modules should integrate through `QuoteFacts` first:

```text
ProcessedQuote
↓
QuoteFacts
↓
Customer Preview
↓
Xero Export
↓
Internal Review
```

`ProcessedQuote` remains the universal extracted quote shape. `QuoteFacts` is the internal architecture layer where universal and trade-specific facts can be normalized without changing the public quote schema.

Customer preview, export, and internal review may consume trade facts only after those facts have been contributed through the QuoteFacts layer.

## Registry Pattern

Trade-specific QuoteFacts contributors are listed in:

```text
lib/trades/registry.ts
```

The registry exposes a small contributor contract:

```ts
export type QuoteFactsContributor = {
  tradeId: TradeModuleId
  buildQuoteFacts: (quote: ProcessedQuote) => QuoteFact[]
}
```

The universal core should call:

```ts
buildTradeQuoteFacts(processedQuote)
```

The core orchestrates contributors; it should not contain trade-specific detection or calculation logic. When adding a module, append its contributor to the registry in a stable order so existing QuoteFacts output remains predictable.

## QuoteFacts Contract

Trade modules should emit universal categories where possible:

- `job_scope`
- `labour`
- `materials`
- `plants`
- `waste`
- `optional_works`
- `exclusions`
- `terms`
- `notes`

Trade-specific detail belongs in fact metadata, for example:

```ts
{
  category: "job_scope",
  text: "New deck area approximately 4m x 5m, total 20m2.",
  metadata: {
    trade: "decking",
    fact_type: "deck_area",
    length_m: 4,
    width_m: 5,
    square_metres: 20
  }
}
```

Only add new universal categories when the concept is genuinely cross-trade and cannot be represented by an existing category.

## Calculator Contract

Calculators are optional and deterministic.

Rules:

- AI extracts or classifies; calculators calculate.
- Calculators should not call OpenAI.
- Calculators should not invent prices.
- Calculators should use imported price lists or reviewed user input when pricing is required.
- Missing or inferred inputs should produce warnings.
- Outputs should be editable-friendly and suitable for review before rendering or export.

## Customer Renderer Contract

Customer renderers may turn QuoteFacts into trade-appropriate wording.

They should:

- Consume QuoteFacts, not raw detector output.
- Keep wording customer-friendly and editable.
- Avoid exposing internal metadata, confidence scoring, or accounting information.
- Avoid changing unrelated trades.

## Xero Renderer Contract

Xero renderers may turn QuoteFacts into export intent lines.

They should:

- Consume QuoteFacts, not raw detector output.
- Emit category, description, quantity, and pricing only when supported by existing quote facts or imported metadata.
- Leave account code and tax type selection to export mappings.
- Preserve imported item metadata when available.
- Never hardcode account codes, tax codes, or template-derived accounting values.

## Internal Review Contract

Internal review helpers may expose trade-specific assumptions before a quote is sent or exported.

They should show:

- Detected trade-specific facts.
- Calculated values.
- Missing or inferred inputs.
- Warnings that need user review.

They should not change customer preview wording, export payloads, or quote extraction behaviour by themselves.

## Future Module Checklist

Before a trade module is considered complete, it should have:

- Isolated detector and calculator tests.
- A runnable test command or inclusion in an existing deterministic test runner.
- Inclusion in `npm run test:trades` once the module has an executable baseline.
- QuoteFacts integration.
- Customer preview support when customer wording is ready.
- Xero export support when export intent is ready.
- Internal review support for assumptions and warnings.
- An end-to-end regression baseline.
- A `docs/REGRESSION_SUITE.md` entry.
- Passing `npx tsc --noEmit`.
- Passing `npm run build`.

## Add Module Sequence

Recommended order for a new trade:

1. Create `lib/trades/{trade}/` with detector, types, README, and focused tests.
2. Add deterministic calculator support only if the trade needs it.
3. Contribute QuoteFacts through `lib/trades/registry.ts`.
4. Add customer renderer support from QuoteFacts.
5. Add Xero renderer support from QuoteFacts and export mappings.
6. Add internal review support from QuoteFacts.
7. Add an end-to-end regression baseline.

This sequence keeps Talk to Quote universal while letting each trade become smarter in its own module.
