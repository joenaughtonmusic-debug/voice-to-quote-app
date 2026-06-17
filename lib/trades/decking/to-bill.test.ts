import assert from "node:assert/strict"
import test from "node:test"
import { resolveBillsToQuoteOptions } from "../../items/resolve-bill"
import type { ResolvableItem } from "../../items/resolve-bill"
import { calculateDecking } from "./calculator"
import { deckingResultToBills } from "./to-bill"
import type { DeckingCalculatorResult } from "./types"

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const kwilaItem: ResolvableItem = {
  id: "item-kwila",
  item_code: "KWILA-DECK-M2",
  item_name: "Kwila Decking Boards",
  sell_price: 85,
  unit: "m2",
  account_code: "200",
  sales_account_code: "200",
  tax_code: "GST",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const merbauItem: ResolvableItem = {
  id: "item-merbau",
  item_code: "MERB-DECK-M2",
  item_name: "Merbau Decking Boards",
  sell_price: 92,
  unit: "m2",
  account_code: "200",
  sales_account_code: "200",
  tax_code: "GST",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

// ---------------------------------------------------------------------------
// Test 1 — DeckingCalculatorResult → MaterialBill shape
// ---------------------------------------------------------------------------

test("deckingResultToBills: produces one bill per area with correct entry fields", () => {
  const result = calculateDecking({
    areas: [{ label: "Main deck", length_m: 4, width_m: 5, board_type: "Kwila", build_scope: "full_build" }],
  })

  const bills = deckingResultToBills(result)

  assert.equal(bills.length, 1)
  assert.equal(bills[0].trade, "decking")
  assert.equal(bills[0].area_label, "Main deck")
  assert.equal(bills[0].entries.length, 1)

  const entry = bills[0].entries[0]
  assert.equal(entry.role, "deck_board")
  assert.equal(entry.quantity, 20)
  assert.equal(entry.unit, "m2")
  assert.equal(entry.label, "Kwila")
  assert.equal(entry.source_calculation, "4m x 5m = 20m2")
})

// ---------------------------------------------------------------------------
// Test 2 — Matched board type → priced QuoteOptionLineItem
// ---------------------------------------------------------------------------

test("resolves Kwila bill: matched item produces correctly priced line item", () => {
  const result = calculateDecking({
    areas: [{ label: "Main deck", length_m: 4, width_m: 5, board_type: "Kwila", build_scope: "full_build" }],
  })

  const bills = deckingResultToBills(result)
  const options = resolveBillsToQuoteOptions(bills, [kwilaItem, merbauItem])

  assert.equal(options.length, 1)

  const option = options[0]
  assert.equal(option.category, "material")
  assert.equal(option.source, "trade_calculator")
  assert.equal(option.areaLabel, "Main deck")
  assert.equal(option.lineItems.length, 1)
  assert.equal((option.warnings ?? []).length, 0)

  const li = option.lineItems[0]
  assert.equal(li.itemCode, "KWILA-DECK-M2")
  assert.equal(li.itemName, "Kwila Decking Boards")
  assert.equal(li.quantity, 20)
  assert.equal(li.unit, "m2")
  assert.equal(li.unitPrice, 85)
  assert.equal(li.total, 1700)
  assert.equal(li.accountCode, "200")
  assert.equal(li.taxType, "OUTPUT")
  assert.equal(li.gstRate, 0.15)
  assert.equal(li.sourceSystem, "JMS")
  assert.equal(li.sourceItemId, "item-kwila")
  assert.equal(option.subtotal, 1700)
})

// ---------------------------------------------------------------------------
// Test 3 — Unmatched board type → zero-price reviewable line item
// ---------------------------------------------------------------------------

test("resolves unmatched board type: zero-priced line item with warning", () => {
  const result = calculateDecking({
    areas: [{ label: "Pergola", length_m: 3, width_m: 3, board_type: "composite", build_scope: "decking_boards_only" }],
  })

  const bills = deckingResultToBills(result)
  const options = resolveBillsToQuoteOptions(bills, [kwilaItem])

  assert.equal(options.length, 1)

  const li = options[0].lineItems[0]
  assert.equal(li.itemCode, undefined)
  assert.equal(li.sourceItemId, undefined)
  assert.equal(li.unitPrice, 0)
  assert.equal(li.total, 0)
  assert.equal(options[0].subtotal, 0)

  const warnings = options[0].warnings ?? []
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /composite/i)
  assert.match(warnings[0], /not found in item library/i)
})

// ---------------------------------------------------------------------------
// Test 4 — Multi-area result → separate QuoteOptions, independent subtotals
// ---------------------------------------------------------------------------

test("multi-area decking job: each area becomes a separate QuoteOption", () => {
  const result = calculateDecking({
    areas: [
      { label: "Front deck", length_m: 4, width_m: 5, board_type: "Kwila", build_scope: "full_build" },
      { label: "Back deck", length_m: 3, width_m: 4, board_type: "Merbau", build_scope: "decking_boards_only" },
    ],
  })

  const bills = deckingResultToBills(result)
  const options = resolveBillsToQuoteOptions(bills, [kwilaItem, merbauItem])

  assert.equal(bills.length, 2)
  assert.equal(options.length, 2)

  assert.equal(options[0].areaLabel, "Front deck")
  assert.equal(options[0].lineItems[0].itemCode, "KWILA-DECK-M2")
  assert.equal(options[0].lineItems[0].total, 20 * 85)
  assert.equal(options[0].subtotal, 1700)

  assert.equal(options[1].areaLabel, "Back deck")
  assert.equal(options[1].lineItems[0].itemCode, "MERB-DECK-M2")
  assert.equal(options[1].lineItems[0].total, 12 * 92)
  assert.equal(options[1].subtotal, 1104)

  assert.notEqual(options[0].id, options[1].id)
})

// ---------------------------------------------------------------------------
// Test 5 — Area with missing square_metres is excluded
// ---------------------------------------------------------------------------

test("area with null square_metres is excluded from bills", () => {
  const result: DeckingCalculatorResult = {
    areas: [
      {
        id: "a1",
        label: "Incomplete area",
        length_m: null,
        width_m: null,
        square_metres: null,
        square_metres_source: "missing",
        board_type: "pine",
        build_scope: "unknown",
        subframe_needed: "unknown",
        existing_posts: "unknown",
        existing_subframe: "unknown",
        existing_framing_notes: [],
        formula: null,
        warnings: [],
      },
    ],
    total_square_metres: null,
    waste_removal_notes: [],
    warnings: [],
  }

  const bills = deckingResultToBills(result)
  assert.equal(bills.length, 0)
})

// ---------------------------------------------------------------------------
// Test 6 — Item with string sell_price is parsed correctly
// ---------------------------------------------------------------------------

test("resolves bill when sell_price is a string", () => {
  const stringPriceItem: ResolvableItem = {
    ...kwilaItem,
    sell_price: "75.50",
  }

  const result = calculateDecking({
    areas: [{ label: "Side deck", length_m: 2, width_m: 5, board_type: "Kwila", build_scope: "full_build" }],
  })

  const bills = deckingResultToBills(result)
  const options = resolveBillsToQuoteOptions(bills, [stringPriceItem])

  assert.equal(options[0].lineItems[0].unitPrice, 75.5)
  assert.equal(options[0].lineItems[0].total, 10 * 75.5)
  assert.equal(options[0].subtotal, 755)
})
