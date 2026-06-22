import assert from "node:assert/strict"
import test from "node:test"
import { EMPTY_PROCESSED_QUOTE } from "../../processed-quote"
import type { ResolvableItem } from "../../items/resolve-bill"
import { applyRetainingBillOptions } from "./apply-bill-options"
import { applyDeckingBillOptions } from "../decking/apply-bill-options"
import { buildCustomerQuotePreview } from "../../customer-quote-preview"
import type { CustomerPreviewQuote } from "../../customer-quote-preview"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const timberItem: ResolvableItem = {
  source_item_id: "ki-ret-timber-1",
  item_code: "RET-TIMBER-M2",
  item_name: "Retaining wall timber",
  sell_price: 65,
  unit: "m2",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const labourItem: ResolvableItem = {
  source_item_id: "ki-ret-labour-1",
  item_code: "RET-LABOUR-M2",
  item_name: "Retaining wall labour",
  sell_price: 95,
  unit: "m2",
  account_code: "200",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const drainageItem: ResolvableItem = {
  source_item_id: "ki-ret-drain-1",
  item_code: "DRAIN-PIPE-M",
  item_name: "Drainage pipe",
  sell_price: 18,
  unit: "m",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const postItem: ResolvableItem = {
  source_item_id: "ki-ret-post-1",
  item_code: "RET-POST-M",
  item_name: "Retaining posts",
  sell_price: 42,
  unit: "m",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const allRetainingItems: ResolvableItem[] = [timberItem, labourItem, drainageItem, postItem]

const deckingBoardItem: ResolvableItem = {
  source_item_id: "ki-deck-1",
  item_code: "PINE-DECK-M2",
  item_name: "Pine Decking Boards",
  sell_price: 55,
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
// Test 1 — Matched item: priced option added to quote_options
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions: adds priced retaining option for matched knowledge items", () => {
  const quote = freshQuote()

  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall, 10m long and 1m high.",
    allRetainingItems,
  )

  const options = quote.quote_options ?? []
  assert.equal(options.length, 1)
  assert.equal(options[0].source, "trade_calculator")
  assert.equal(options[0].category, "material")

  // 10m x 1m = 10m² face area → timber + labour both use face area
  const timberLine = options[0].lineItems.find((li) => li.itemCode === "RET-TIMBER-M2")
  assert.ok(timberLine, "expected timber line item")
  assert.equal(timberLine.quantity, 10)
  assert.equal(timberLine.unitPrice, 65)
  assert.equal(timberLine.total, 650)

  const labourLine = options[0].lineItems.find((li) => li.itemCode === "RET-LABOUR-M2")
  assert.ok(labourLine, "expected labour line item")
  assert.equal(labourLine.quantity, 10)
  assert.equal(labourLine.unitPrice, 95)
  assert.equal(labourLine.total, 950)

  assert.equal((options[0].warnings ?? []).length, 0)
})

// ---------------------------------------------------------------------------
// Test 2 — Option ID uses retaining-bill- prefix (resolver fix)
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions: option ID uses retaining-bill- prefix", () => {
  const quote = freshQuote()

  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall, 10m long and 1m high.",
    allRetainingItems,
  )

  const option = (quote.quote_options ?? [])[0]
  assert.ok(option, "expected an option")
  assert.match(option.id, /^retaining-bill-/)
})

// ---------------------------------------------------------------------------
// Test 3 — Decking option IDs still use decking-bill- prefix (resolver regression)
// ---------------------------------------------------------------------------

test("applyDeckingBillOptions: option ID still uses decking-bill- prefix after resolver fix", () => {
  const quote = freshQuote()

  applyDeckingBillOptions(quote, "Construct a 4m x 5m pine deck", [deckingBoardItem])

  const option = (quote.quote_options ?? [])[0]
  assert.ok(option, "expected a decking option")
  assert.match(option.id, /^decking-bill-/)
})

// ---------------------------------------------------------------------------
// Test 4 — sourceItemId populated from source_item_id (live route shape)
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions: sourceItemId is populated from source_item_id", () => {
  const quote = freshQuote()

  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall, 10m long and 1m high.",
    [timberItem, labourItem],
  )

  const timberLine = (quote.quote_options ?? [])[0]?.lineItems.find((li) => li.itemCode === "RET-TIMBER-M2")
  assert.equal(timberLine?.sourceItemId, "ki-ret-timber-1")
})

// ---------------------------------------------------------------------------
// Test 5 — Non-retaining transcript: quote unchanged
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions: does not modify quote for a non-retaining transcript", () => {
  const quote = freshQuote()

  applyRetainingBillOptions(quote, "Install six downlights and two power points", allRetainingItems)

  assert.equal((quote.quote_options ?? []).length, 0)
})

// ---------------------------------------------------------------------------
// Test 6 — Existing planting and decking options are preserved
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions: existing quote_options are preserved and retaining is appended", () => {
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
        id: "decking-bill-1-main-deck",
        label: "Main deck",
        title: "Main deck",
        category: "material" as const,
        source: "trade_calculator" as const,
        lineItems: [],
        subtotal: 0,
      },
    ],
  }

  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall, 10m long and 1m high.",
    allRetainingItems,
  )

  const options = quote.quote_options ?? []
  assert.equal(options.length, 3)
  assert.equal(options[0].id, "plant-option-1")       // planting preserved
  assert.equal(options[1].id, "decking-bill-1-main-deck") // decking preserved
  assert.equal(options[2].source, "trade_calculator")
  assert.match(options[2].id, /^retaining-bill-/)
})

// ---------------------------------------------------------------------------
// Test 7 — Multi-section: one option per section
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions: multi-section transcript produces one option per section", () => {
  const quote = freshQuote()

  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining walls. One wall 8m long and 800mm high, second wall 4m long and 600mm high.",
    allRetainingItems,
  )

  const options = quote.quote_options ?? []
  assert.equal(options.length, 2, "expected one option per wall section")

  // Each option has a distinct retaining-bill- ID
  assert.match(options[0].id, /^retaining-bill-/)
  assert.match(options[1].id, /^retaining-bill-/)
  assert.notEqual(options[0].id, options[1].id)

  // Wall 1: 8m x 0.8m = 6.4m² face area
  const wall1Timber = options[0].lineItems.find((li) => li.itemCode === "RET-TIMBER-M2")
  assert.equal(wall1Timber?.quantity, 6.4)
  assert.equal(wall1Timber?.total, 6.4 * 65)

  // Wall 2: 4m x 0.6m = 2.4m² face area
  const wall2Timber = options[1].lineItems.find((li) => li.itemCode === "RET-TIMBER-M2")
  assert.equal(wall2Timber?.quantity, 2.4)
  assert.equal(wall2Timber?.total, 2.4 * 65)
})

// ---------------------------------------------------------------------------
// Test 8 — Unmatched entry: zero-priced line item with warning
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions: unmatched entries produce zero-priced line items with warnings", () => {
  const quote = freshQuote()

  // Only timber item provided — labour will be unmatched
  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall, 10m long and 1m high.",
    [timberItem],
  )

  const option = (quote.quote_options ?? [])[0]
  assert.ok(option)

  const unpricedLabour = option.lineItems.find((li) => li.itemName === "Retaining wall labour")
  assert.ok(unpricedLabour, "expected unmatched labour line item")
  assert.equal(unpricedLabour.unitPrice, 0)
  assert.equal(unpricedLabour.itemCode, undefined)

  const warnings = option.warnings ?? []
  assert.ok(warnings.some((w) => /retaining wall labour/i.test(w)), "expected unmatched labour warning")
})

// ---------------------------------------------------------------------------
// Test 9 — Live-equivalent QuoteDraft path
//
// Proves the full pipeline from transcript → applyRetainingBillOptions →
// buildCustomerQuotePreview → tradeOptions (what the QuoteDraft UI renders).
// This is the acceptance test for the live path per the Build Constitution.
// ---------------------------------------------------------------------------

test("live QuoteDraft path: retaining tradeOptions surface in buildCustomerQuotePreview", () => {
  const quote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Renee",
    site_address: "22 Bank Street",
    quote_title: "Retaining Wall Quote",
    job_type: "Retaining",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Retaining Wall Quote",
      job_type: "Retaining",
      scope: [
        "Replace existing timber retaining wall.",
        "One wall 8m long and 800mm high.",
        "Include drainage behind wall.",
      ],
      notes: [],
    },
  }

  // Run the live wiring — same call the API route makes
  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall. One wall 8m long and 800mm high. Include drainage behind wall.",
    allRetainingItems,
  )

  assert.ok((quote.quote_options ?? []).length > 0, "expected quote_options to be populated before preview")

  // Pass through buildCustomerQuotePreview — the same function called by the QuoteDraft UI
  const preview = buildCustomerQuotePreview(quote as unknown as CustomerPreviewQuote)

  assert.ok(preview.tradeOptions.length > 0, "expected tradeOptions to be non-empty in customer preview")

  const firstGroup = preview.tradeOptions[0]
  assert.ok(firstGroup.options.length > 0, "expected at least one option in the first trade group")

  const firstOption = firstGroup.options[0]
  assert.ok(firstOption.subtotalText.startsWith("$"), "expected a priced subtotal in the customer preview")

  // Verify the option ID is not hardcoded to decking
  const allOptionIds = (quote.quote_options ?? []).map((o) => o.id)
  assert.ok(allOptionIds.every((id) => id.startsWith("retaining-bill-")), "all retaining option IDs should use retaining-bill- prefix")
})

// ---------------------------------------------------------------------------
// Test 10 — Retaining quote does not pollute decking options
// ---------------------------------------------------------------------------

test("applyRetainingBillOptions does not produce decking options", () => {
  const quote = freshQuote()

  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall, 10m long and 1m high.",
    allRetainingItems,
  )

  const options = quote.quote_options ?? []
  assert.ok(options.every((o) => !o.id.startsWith("decking-bill-")), "retaining transcript must not produce decking-bill options")
})
