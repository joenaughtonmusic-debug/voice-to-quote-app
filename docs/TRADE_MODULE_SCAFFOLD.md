# Trade Module Scaffold

This guide is the practical starting point for adding a new Quotecord trade module such as fencing, paving, electrical, plumbing, painting, cleaning, arborist work, or another specialist trade.

Use this alongside `docs/TRADE_MODULE_CONTRACT.md`. The contract defines the rules; this guide defines the repeatable folder shape and implementation order.

## Standard Folder Structure

Create new modules under:

```text
lib/trades/{trade}/
```

Recommended full structure:

```text
lib/trades/{trade}/
  types.ts
  detector.ts
  calculator.ts
  quote-facts.ts
  customer-renderer.ts
  xero-renderer.ts
  review.ts
  index.ts
  README.md
  index.test.ts
  e2e.test.ts
  review.test.ts
  tsconfig.test.json
```

Not every file needs full behaviour at the start. It is acceptable for renderer/export files to contain stubs until that phase is implemented, as long as the module remains isolated and tests are explicit about what is supported.

## File Responsibilities

### `types.ts`

Defines module-specific request, result, warning, and review/export helper types.

Keep these types inside the module unless they become genuinely universal.

### `detector.ts`

Detects whether existing quote text clearly describes the trade.

Rules:

- Deterministic only.
- No OpenAI calls.
- Return no/empty result for unrelated trades.
- Preserve source text where useful for review.

### `calculator.ts`

Performs optional deterministic calculations.

Rules:

- Calculators calculate; AI extracts or classifies.
- Calculators must not be required for all quotes.
- Missing or inferred values should produce warnings.
- Outputs should be editable-friendly.

### `quote-facts.ts`

Converts existing `ProcessedQuote` data into trade-specific `QuoteFact` records.

Rules:

- Do not change the `ProcessedQuote` schema.
- Use universal categories where possible, such as `job_scope`, `labour`, `materials`, `waste`, `site_conditions`, and `warnings`.
- Put trade-specific details in `metadata`, for example `trade`, dimensions, calculated totals, flags, and source fields.

### `customer-renderer.ts`

Renders customer-friendly wording from QuoteFacts.

Rules:

- Consume QuoteFacts only.
- Do not use raw detector or calculator output directly.
- Keep wording editable and not overly technical.
- Do not expose internal confidence, formulas, account codes, tax codes, or debug data.

### `xero-renderer.ts`

Turns QuoteFacts into export-intent lines.

Rules:

- Consume QuoteFacts only.
- Do not hardcode account codes or tax codes.
- Use export categories such as `labour`, `materials`, `waste`, `equipment`, or `generic`.
- Let export mappings and imported item metadata resolve account/tax details.

### `review.ts`

Builds an internal review model from QuoteFacts.

Rules:

- Internal only.
- Show assumptions, flags, warnings, and calculated values.
- Do not change customer preview or export output by itself.

### `index.ts`

Exports the module public surface.

Typical shape:

```ts
export * from "./types"
export * from "./detector"
export * from "./calculator"
export * from "./quote-facts"
export * from "./customer-renderer"
export * from "./xero-renderer"
export * from "./review"
```

### `README.md`

Explains the module boundary, MVP scope, unsupported calculations, and future integration steps.

### Tests

Use deterministic Node tests compiled through a module-local `tsconfig.test.json`.

Typical test files:

- `index.test.ts` for detector/calculator and QuoteFacts basics.
- `e2e.test.ts` for `ProcessedQuote -> QuoteFacts -> Customer Preview -> Xero Export`.
- `review.test.ts` for internal review models.

## Standard Implementation Order

Build a new module in this order:

1. Create isolated module folder and types.
2. Add detector and optional calculator.
3. Add isolated detector/calculator tests.
4. Add `quote-facts.ts`.
5. Register the QuoteFacts contributor in `lib/trades/registry.ts`.
6. Add QuoteFacts tests.
7. Add customer preview renderer from QuoteFacts.
8. Add customer preview tests.
9. Add Xero export renderer from QuoteFacts.
10. Add Xero/export tests.
11. Add end-to-end regression test.
12. Add internal review helper and UI.
13. Add review tests.
14. Add module test command.
15. Add module command to `npm run test:trades`.
16. Update `docs/REGRESSION_SUITE.md`.

Do not skip the isolated phase. A module should prove its own detector/calculator behaviour before it is wired into QuoteFacts, preview, export, or review.

## Architecture Rules

New modules must follow these rules:

- Do not add trade-specific fields to `ProcessedQuote`.
- Do not hardcode account codes or tax codes.
- Do not let templates control accounting metadata.
- Do not force calculator use.
- Keep trade logic inside `lib/trades/{trade}/`.
- Use QuoteFacts as the integration layer.
- Keep customer wording separate from export logic.
- Keep export mappings authoritative for account and tax fallbacks.
- Keep imported inventory/JMS/Xero metadata authoritative for item codes and prices.
- Keep non-matching trades unchanged.

## Codex Checklist For A New Module

When starting a new module, Codex should:

- Read `docs/TRADE_MODULE_CONTRACT.md`.
- Read this scaffold guide.
- Inspect `lib/trades/decking/` and `lib/trades/retaining/` for current patterns.
- Create `lib/trades/{trade}/`.
- Add `types.ts`, `detector.ts`, `calculator.ts`, `index.ts`, `README.md`, `index.test.ts`, and `tsconfig.test.json`.
- Add only isolated tests first.
- Run the module test command.
- Add `quote-facts.ts` only after isolated tests pass.
- Register the module in `lib/trades/registry.ts`.
- Add customer preview support only from QuoteFacts.
- Add Xero export support only from QuoteFacts.
- Add internal review support only from QuoteFacts.
- Add an e2e baseline.
- Add the module to `npm run test:trades`.
- Update `docs/REGRESSION_SUITE.md`.
- Run `npm run test:trades`.
- Run `npx tsc --noEmit`.
- Run `npm run build`.

## Minimal First Commit Shape

For a brand-new trade that is not wired into live behaviour yet, the smallest useful first module is:

```text
lib/trades/{trade}/
  types.ts
  detector.ts
  calculator.ts
  index.ts
  README.md
  index.test.ts
  tsconfig.test.json
```

This first commit should prove:

- the trade is detected when clearly present;
- unrelated trades do not trigger detection;
- simple calculations are deterministic;
- outputs are review-friendly;
- no live quote behaviour changes.

Only after that should the module move into QuoteFacts, customer preview, Xero export, and internal review.
