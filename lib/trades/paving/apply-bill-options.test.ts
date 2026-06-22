import assert from "node:assert/strict"
import test from "node:test"
import { EMPTY_PROCESSED_QUOTE } from "../../processed-quote"
import type { ResolvableItem } from "../../items/resolve-bill"
import { applyPavingBillOptions } from "./apply-bill-options"
import { applyDeckingBillOptions } from "../decking/apply-bill-options"
import { applyRetainingBillOptions } from "../retaining/apply-bill-options"
import { buildCustomerQuotePreview } from "../../customer-quote-preview"
import type { CustomerPreviewQuote } from "../../customer-quote-preview"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const paverItem: ResolvableItem = {
  source_item_id: "ki-paver-1",
  item_code: "PAV-450X450",
  item_name: "450x450 concrete pavers",
  sell_price: 4.5,
  unit: "each",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const baseItem: ResolvableItem = {
  source_item_id: "ki-base-1",
  item_code: "PAV-BASE-M3",
  item_name: "Base course aggregate",
  sell_price: 65,
  unit: "m3",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const sandItem: ResolvableItem = {
  source_item_id: "ki-sand-1",
  item_code: "PAV-SAND-M3",
  item_name: "Bedding sand",
  sell_price: 55,
  unit: "m3",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const labourItem: ResolvableItem = {
  source_item_id: "ki-pav-labour-1",
  item_code: "PAV-LABOUR-HR",
  item_name: "Paving labour",
  sell_price: 85,
  unit: "hours",
  account_code: "200",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const deckingBoardItem: ResolvableItem = {
  source_item_id: "ki-deck-1",
  item_code: "PINE-DECK-M2",
  item_name: "Pine Decking Boards",
  sell_price: 55,
  unit: "m2",
  source_system: "JMS",
}

const retainingTimberItem: ResolvableItem = {
  source_item_id: "ki-ret-timber-1",
  item_code: "RET-TIMBER-M2",
  item_name: "Retaining wall timber",
  sell_price: 65,
  unit: "m2",
  source_system: "JMS",
}

const allPavingItems: ResolvableItem[] = [paverItem, baseItem, sandItem, labourItem]

function freshQuote() {
  return { ...EMPTY_PROCESSED_QUOTE, quote_options: [] as typeof EMPTY_PROCESSED_QUOTE.quote_options }
}

// ---------------------------------------------------------------------------
// Test 1 — Matched items: priced option added to quote_options
// ---------------------------------------------------------------------------

test("applyPavingBillOptions: adds priced paving option for matched knowledge items", () => {
  const quote = freshQuote()

  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio. Top up basecourse and compact.",
    allPavingItems,
  )

  const options = quote.quote_options ?? []
  assert.ok(options.length >= 1, "expected at least one paving option")
  assert.equal(options[0].source, "trade_calculator")
  assert.equal(options[0].category, "material")

  // 3.5m × 6m = 21m²; 450×450mm pavers; 115 pavers with 10% waste
  const paverLine = options[0].lineItems.find((li) => li.itemCode === "PAV-450X450")
  assert.ok(paverLine, "expected paver line item")
  assert.equal(paverLine.quantity, 115)
  assert.equal(paverLine.unitPrice, 4.5)
  assert.equal(paverLine.total, 115 * 4.5)

  assert.equal((options[0].warnings ?? []).length, 0)
})

// ---------------------------------------------------------------------------
// Test 2 — Option ID uses paving-bill- prefix
// ---------------------------------------------------------------------------

test("applyPavingBillOptions: option ID uses paving-bill- prefix", () => {
  const quote = freshQuote()

  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio.",
    allPavingItems,
  )

  const option = (quote.quote_options ?? [])[0]
  assert.ok(option, "expected an option")
  assert.match(option.id, /^paving-bill-/)
})

// ---------------------------------------------------------------------------
// Test 3 — Decking option IDs still use decking-bill- (resolver regression)
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: option ID still uses decking-bill- prefix", () => {
  const quote = freshQuote()

  applyDeckingBillOptions(quote, "Construct a 4m x 5m pine deck", [deckingBoardItem])

  const option = (quote.quote_options ?? [])[0]
  assert.ok(option, "expected a decking option")
  assert.match(option.id, /^decking-bill-/)
})

// ---------------------------------------------------------------------------
// Test 4 — Retaining option IDs still use retaining-bill- (resolver regression)
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions: option ID still uses retaining-bill- prefix", () => {
  const quote = freshQuote()

  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall, 10m long and 1m high.",
    [retainingTimberItem],
  )

  const option = (quote.quote_options ?? [])[0]
  assert.ok(option, "expected a retaining option")
  assert.match(option.id, /^retaining-bill-/)
})

// ---------------------------------------------------------------------------
// Test 5 — sourceItemId populated from source_item_id
// ---------------------------------------------------------------------------

test("applyPavingBillOptions: sourceItemId is populated from source_item_id", () => {
  const quote = freshQuote()

  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio.",
    [paverItem, baseItem, sandItem, labourItem],
  )

  const paverLine = (quote.quote_options ?? [])[0]?.lineItems.find((li) => li.itemCode === "PAV-450X450")
  assert.equal(paverLine?.sourceItemId, "ki-paver-1")
})

// ---------------------------------------------------------------------------
// Test 6 — Non-paving transcript: quote unchanged
// ---------------------------------------------------------------------------

test("applyPavingBillOptions: does not modify quote for a non-paving transcript", () => {
  const quote = freshQuote()

  applyPavingBillOptions(quote, "Install six downlights and two power points", allPavingItems)

  assert.equal((quote.quote_options ?? []).length, 0)
})

// ---------------------------------------------------------------------------
// Test 7 — Existing options are preserved; paving is appended
// ---------------------------------------------------------------------------

test("applyPavingBillOptions: existing quote_options are preserved and paving is appended", () => {
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
      {
        id: "retaining-bill-1-back-wall",
        label: "Back wall",
        title: "Back wall",
        category: "material" as const,
        source: "trade_calculator" as const,
        lineItems: [],
        subtotal: 0,
      },
    ],
  }

  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio.",
    allPavingItems,
  )

  const options = quote.quote_options ?? []
  assert.ok(options.length >= 3)
  assert.equal(options[0].id, "plant-option-1")           // planting preserved
  assert.equal(options[1].id, "retaining-bill-1-back-wall") // retaining preserved
  assert.match(options[2].id, /^paving-bill-/)             // paving appended
})

// ---------------------------------------------------------------------------
// Test 8 — Multi-area: one option per area
// ---------------------------------------------------------------------------

test("applyPavingBillOptions: multi-area transcript appends one option per area", () => {
  const quote = freshQuote()

  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio. Lay pavers over a 2m x 4m path.",
    allPavingItems,
  )

  const options = quote.quote_options ?? []
  assert.ok(options.length >= 2, "expected one option per detected paving area")

  options.forEach((opt) => {
    assert.match(opt.id, /^paving-bill-/)
    assert.equal(opt.source, "trade_calculator")
  })

  // Each area has independent IDs
  const ids = options.map((o) => o.id)
  const uniqueIds = new Set(ids)
  assert.equal(uniqueIds.size, ids.length, "option IDs must be unique across areas")
})

// ---------------------------------------------------------------------------
// Test 9 — Unmatched items: zero-priced line items with warnings
// ---------------------------------------------------------------------------

test("applyPavingBillOptions: unmatched entries produce zero-priced line items with warnings", () => {
  const quote = freshQuote()

  // Only supply paver item — base, sand, labour will be unmatched
  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio.",
    [paverItem],
  )

  const option = (quote.quote_options ?? [])[0]
  assert.ok(option)

  const unpricedItems = option.lineItems.filter((li) => li.unitPrice === 0)
  assert.ok(unpricedItems.length >= 3, "base, sand, labour should be unpriced")

  const warnings = option.warnings ?? []
  assert.ok(warnings.length >= 3, "expected warnings for unmatched items")
  assert.ok(warnings.some((w) => /base course aggregate/i.test(w)))
  assert.ok(warnings.some((w) => /bedding sand/i.test(w)))
  assert.ok(warnings.some((w) => /paving labour/i.test(w)))
})

// ---------------------------------------------------------------------------
// Test 10 — Live-equivalent QuoteDraft path
//
// Proves the full pipeline from transcript → applyPavingBillOptions →
// buildCustomerQuotePreview → tradeOptions (what the QuoteDraft UI renders).
// This is the acceptance test for the live path per the Build Constitution.
// ---------------------------------------------------------------------------

test("live QuoteDraft path: paving tradeOptions surface in buildCustomerQuotePreview", () => {
  const quote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Lisa",
    site_address: "5 Garden Lane",
    quote_title: "Paving Quote",
    job_type: "Paving",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Paving Quote",
      job_type: "Paving",
      scope: [
        "Lay 450x450 concrete pavers over a 3.5m x 6m patio.",
        "Top up basecourse and compact.",
      ],
      notes: [],
    },
  }

  // Run the live wiring — same call the API route makes
  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio. Top up basecourse and compact.",
    allPavingItems,
  )

  assert.ok((quote.quote_options ?? []).length > 0, "expected quote_options to be populated before preview")

  // Pass through buildCustomerQuotePreview — same function called by the QuoteDraft UI
  const preview = buildCustomerQuotePreview(quote as unknown as CustomerPreviewQuote)

  assert.ok(preview.tradeOptions.length > 0, "expected tradeOptions to be non-empty in customer preview")

  const firstGroup = preview.tradeOptions[0]
  assert.ok(firstGroup.options.length > 0, "expected at least one option in the first trade group")

  const firstOption = firstGroup.options[0]
  assert.ok(firstOption.subtotalText.startsWith("$"), "expected a priced subtotal in the customer preview")

  // Verify option IDs use the paving-bill- prefix, not decking or retaining
  const allOptionIds = (quote.quote_options ?? []).map((o) => o.id)
  assert.ok(
    allOptionIds.every((id) => id.startsWith("paving-bill-")),
    "all paving option IDs should use paving-bill- prefix",
  )
})

// ---------------------------------------------------------------------------
// Test 11 — Paving does not produce decking or retaining options
// ---------------------------------------------------------------------------

test("applyPavingBillOptions: does not produce decking or retaining options", () => {
  const quote = freshQuote()

  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio.",
    allPavingItems,
  )

  const options = quote.quote_options ?? []
  assert.ok(
    options.every((o) => !o.id.startsWith("decking-bill-") && !o.id.startsWith("retaining-bill-")),
    "paving transcript must not produce decking or retaining options",
  )
})
