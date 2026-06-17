import assert from "node:assert/strict"
import test from "node:test"
import { EMPTY_PROCESSED_QUOTE } from "../../processed-quote"
import type { ResolvableItem } from "../../items/resolve-bill"
import { applyDeckingBillOptions } from "./apply-bill-options"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// New-style item: source_item_id matches the shape from getKnowledgeItemContext()
// in app/api/process-quote/route.ts.
const pineItemSourceId: ResolvableItem = {
  source_item_id: "ki-pine-1",
  item_code: "PINE-DECK-M2",
  item_name: "Pine Decking Boards",
  sell_price: 55,
  unit: "m2",
  account_code: "200",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

// Old-style item: id field used by test fixtures (backward compatibility).
const kwilaItemId: ResolvableItem = {
  id: "kwila-item-1",
  item_code: "KWILA-DECK-M2",
  item_name: "Kwila Decking Boards",
  sell_price: 85,
  unit: "m2",
  account_code: "200",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

function freshQuote() {
  return { ...EMPTY_PROCESSED_QUOTE, quote_options: [] as typeof EMPTY_PROCESSED_QUOTE.quote_options }
}

// ---------------------------------------------------------------------------
// Test 1 — Matched item: priced line item added to quote_options
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: adds priced decking option for a matched knowledge item", () => {
  const quote = freshQuote()

  applyDeckingBillOptions(quote, "Construct a 4m x 5m pine deck", [pineItemSourceId])

  const options = quote.quote_options ?? []
  assert.equal(options.length, 1)
  assert.equal(options[0].source, "trade_calculator")
  assert.equal(options[0].category, "material")
  assert.equal(options[0].lineItems.length, 1)

  const li = options[0].lineItems[0]
  assert.equal(li.itemCode, "PINE-DECK-M2")
  assert.equal(li.quantity, 20)
  assert.equal(li.unitPrice, 55)
  assert.equal(li.total, 1100)
  assert.equal(options[0].subtotal, 1100)
  assert.equal((options[0].warnings ?? []).length, 0)
})

// ---------------------------------------------------------------------------
// Test 2 — sourceItemId populated from source_item_id (live route shape)
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: sourceItemId is populated from source_item_id", () => {
  const quote = freshQuote()

  applyDeckingBillOptions(quote, "Construct a 4m x 5m pine deck", [pineItemSourceId])

  const li = (quote.quote_options ?? [])[0]?.lineItems[0]
  assert.equal(li?.sourceItemId, "ki-pine-1")
})

// ---------------------------------------------------------------------------
// Test 3 — sourceItemId falls back to id (existing test fixture shape)
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: sourceItemId falls back to id field for backward compatibility", () => {
  const quote = freshQuote()

  applyDeckingBillOptions(quote, "Build a 4m x 5m kwila deck", [kwilaItemId])

  const li = (quote.quote_options ?? [])[0]?.lineItems[0]
  assert.equal(li?.sourceItemId, "kwila-item-1")
})

// ---------------------------------------------------------------------------
// Test 4 — Non-decking transcript: quote unchanged
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: does not modify quote for a non-decking transcript", () => {
  const quote = freshQuote()

  applyDeckingBillOptions(quote, "Install six downlights and two power points", [pineItemSourceId])

  assert.equal((quote.quote_options ?? []).length, 0)
})

// ---------------------------------------------------------------------------
// Test 5 — Unmatched board type: zero-priced option with warning
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: unmatched board type produces zero-priced option with warning", () => {
  const quote = freshQuote()

  // "composite" does not match "Pine Decking Boards"
  applyDeckingBillOptions(quote, "Build a 3m x 3m composite deck", [pineItemSourceId])

  const options = quote.quote_options ?? []
  assert.equal(options.length, 1)

  const li = options[0].lineItems[0]
  assert.equal(li.unitPrice, 0)
  assert.equal(li.total, 0)
  assert.equal(li.itemCode, undefined)
  assert.equal(li.sourceItemId, undefined)
  assert.equal(options[0].subtotal, 0)

  const warnings = options[0].warnings ?? []
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /not found in item library/i)
})

// ---------------------------------------------------------------------------
// Test 6 — Existing planting options are preserved
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: existing planting quote_options are preserved and decking is appended", () => {
  const quote = {
    ...EMPTY_PROCESSED_QUOTE,
    quote_options: [
      {
        id: "plant-option-1",
        label: "Option A",
        title: "Ficus Tuffi 25L",
        category: "planting" as const,
        source: "plant_calculator" as const,
        lineItems: [],
        subtotal: 0,
      },
    ],
  }

  applyDeckingBillOptions(quote, "Construct a 4m x 5m pine deck", [pineItemSourceId])

  const options = quote.quote_options ?? []
  assert.equal(options.length, 2)
  assert.equal(options[0].id, "plant-option-1")   // planting preserved at index 0
  assert.equal(options[0].category, "planting")
  assert.equal(options[1].category, "material")
  assert.equal(options[1].source, "trade_calculator")
})

// ---------------------------------------------------------------------------
// Test 7 — Multi-area deck: one option per area, independent subtotals
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: multi-area transcript appends one option per area", () => {
  const quote = freshQuote()

  // Period separator ensures the detector treats these as two separate areas.
  applyDeckingBillOptions(
    quote,
    "Build a 4m x 5m pine deck. Build a 3m x 4m pine deck at the back.",
    [pineItemSourceId],
  )

  const options = quote.quote_options ?? []
  assert.equal(options.length, 2)

  assert.equal(options[0].lineItems[0].total, 20 * 55)   // 4×5 = 20m²
  assert.equal(options[0].subtotal, 1100)

  assert.equal(options[1].lineItems[0].total, 12 * 55)   // 3×4 = 12m²
  assert.equal(options[1].subtotal, 660)

  assert.notEqual(options[0].id, options[1].id)
})
