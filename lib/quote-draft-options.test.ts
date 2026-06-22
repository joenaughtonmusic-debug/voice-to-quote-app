import assert from "node:assert/strict"
import test from "node:test"

import { groupCustomerQuoteOptions } from "./customer-quote-options"
import type { ResolvableItem } from "./items/resolve-bill"
import {
  EMPTY_PROCESSED_QUOTE,
  buildQuoteDraftPersistedFields,
  processedQuoteToEditableSections,
  quoteOptionsFromSaved,
  savedDraftToEditableState,
  type ProcessedQuote,
  type SavedQuoteDraft,
} from "./processed-quote"
import type { QuoteOption } from "./quote-options"
import { applyDeckingBillOptions } from "./trades/decking/apply-bill-options"
import { applyPavingBillOptions } from "./trades/paving/apply-bill-options"
import { applyRetainingBillOptions } from "./trades/retaining/apply-bill-options"

const pineItem: ResolvableItem = {
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

const pavingLabourItem: ResolvableItem = {
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

const allPavingItems: ResolvableItem[] = [paverItem, baseItem, sandItem, pavingLabourItem]

const retainingTimberItem: ResolvableItem = {
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

const retainingLabourItem: ResolvableItem = {
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

const allRetainingItems: ResolvableItem[] = [retainingTimberItem, retainingLabourItem]

function plantingOption(): QuoteOption {
  return {
    id: "planting-option-1",
    label: "Option 1",
    title: "Ficus Tuffi 1.2m",
    category: "planting",
    source: "plant_calculator",
    areaLabel: "Front hedge",
    lineItems: [
      {
        itemName: "Ficus Tuffi 1.2m",
        quantity: 12,
        unit: "each",
        unitPrice: 45,
        total: 540,
        supplier: "Internal Nursery",
        stockStatus: "In stock",
      },
    ],
    subtotal: 540,
    notes: ["Spacing source: plant_library"],
  }
}

function simulateDraftSaveReopen(quote: ProcessedQuote, draftOverrides: Partial<SavedQuoteDraft> = {}) {
  const sections = processedQuoteToEditableSections(quote)
  const payload = buildQuoteDraftPersistedFields("Quote transcript", quote, sections, "user-1")

  return savedDraftToEditableState({
    id: "draft-1",
    client_name: quote.client_name || null,
    site_address: quote.site_address || null,
    quote_title: quote.quote_title || null,
    job_type: quote.job_type || null,
    raw_transcript: "Quote transcript",
    quote_sections: payload.quote_sections,
    line_items: payload.line_items,
    quote_options: payload.quote_options,
    ...draftOverrides,
  })
}

function assertOptionsMatch(original: QuoteOption[] | undefined, restored: QuoteOption[] | undefined) {
  assert.equal((restored ?? []).length, (original ?? []).length)
  for (let index = 0; index < (original ?? []).length; index += 1) {
    const before = original![index]
    const after = restored![index]
    assert.equal(after.id, before.id)
    assert.equal(after.source, before.source)
    assert.equal(after.category, before.category)
    assert.equal(after.subtotal, before.subtotal)
    assert.deepEqual(after.warnings ?? [], before.warnings ?? [])
    assert.equal(after.lineItems.length, before.lineItems.length)
    assert.equal(after.lineItems[0]?.itemCode, before.lineItems[0]?.itemCode)
    assert.equal(after.lineItems[0]?.total, before.lineItems[0]?.total)
  }
}

test("buildQuoteDraftPersistedFields persists quote_options JSON separately from quote_sections", () => {
  const quote: ProcessedQuote = { ...EMPTY_PROCESSED_QUOTE, quote_options: [plantingOption()] }
  const payload = buildQuoteDraftPersistedFields("transcript", quote, processedQuoteToEditableSections(quote), "user-1")

  assert.ok(Array.isArray(payload.quote_options))
  assert.equal(payload.quote_options.length, 1)
  assert.equal(payload.quote_options[0].id, "planting-option-1")
})

test("draft saved with quote_options reopens with quote_options intact", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Lisa",
    job_type: "paving",
    quote_options: [plantingOption()],
  }

  const reopened = simulateDraftSaveReopen(quote)
  assertOptionsMatch(quote.quote_options, reopened.processedQuote.quote_options)
})

test("paving quote_options survive save and reopen", () => {
  const quote: ProcessedQuote = { ...EMPTY_PROCESSED_QUOTE, job_type: "paving" }
  applyPavingBillOptions(
    quote,
    "Lay 450x450 concrete pavers over a 3.5m x 6m patio. Top up basecourse and compact.",
    allPavingItems,
  )

  const reopened = simulateDraftSaveReopen(quote)
  assert.ok((reopened.processedQuote.quote_options ?? []).length > 0)
  assert.ok((reopened.processedQuote.quote_options ?? []).every((option) => option.id.startsWith("paving-bill-")))
  assertOptionsMatch(quote.quote_options, reopened.processedQuote.quote_options)
})

test("retaining quote_options survive save and reopen", () => {
  const quote: ProcessedQuote = { ...EMPTY_PROCESSED_QUOTE, job_type: "retaining" }
  applyRetainingBillOptions(
    quote,
    "Replace the old timber retaining wall, 10m long and 1m high.",
    allRetainingItems,
  )

  const reopened = simulateDraftSaveReopen(quote)
  assert.ok((reopened.processedQuote.quote_options ?? []).length > 0)
  assert.ok((reopened.processedQuote.quote_options ?? []).every((option) => option.id.startsWith("retaining-bill-")))
  assertOptionsMatch(quote.quote_options, reopened.processedQuote.quote_options)
})

test("decking quote_options survive save and reopen", () => {
  const quote: ProcessedQuote = { ...EMPTY_PROCESSED_QUOTE, job_type: "decking" }
  applyDeckingBillOptions(quote, "Construct a 4m x 5m pine deck", [pineItem])

  const reopened = simulateDraftSaveReopen(quote)
  assert.ok((reopened.processedQuote.quote_options ?? []).length > 0)
  assert.ok((reopened.processedQuote.quote_options ?? []).every((option) => option.id.startsWith("decking-bill-")))
  assertOptionsMatch(quote.quote_options, reopened.processedQuote.quote_options)
})

test("planting quote_options survive save and reopen", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    job_type: "planting",
    quote_options: [plantingOption()],
  }

  const reopened = simulateDraftSaveReopen(quote)
  assert.equal(reopened.processedQuote.quote_options?.[0]?.category, "planting")
  assert.equal(reopened.processedQuote.quote_options?.[0]?.source, "plant_calculator")
  assertOptionsMatch(quote.quote_options, reopened.processedQuote.quote_options)
})

test("warnings on unpriced options survive save and reopen", () => {
  const quote: ProcessedQuote = { ...EMPTY_PROCESSED_QUOTE, job_type: "paving" }
  applyPavingBillOptions(quote, "Lay 450x450 concrete pavers over a 3.5m x 6m patio.", [paverItem])

  const option = (quote.quote_options ?? [])[0]
  assert.ok(option)
  assert.ok((option.warnings ?? []).length >= 3)

  const reopened = simulateDraftSaveReopen(quote)
  const restored = reopened.processedQuote.quote_options?.[0]
  assert.ok(restored)
  assert.deepEqual(restored.warnings, option.warnings)

  const groups = groupCustomerQuoteOptions(reopened.processedQuote.quote_options)
  assert.ok((groups[0]?.options[0]?.warnings.length ?? 0) >= 3)
})

test("existing drafts without quote_options still load safely", () => {
  const reopened = savedDraftToEditableState({
    id: "legacy-draft",
    client_name: "Sarah",
    site_address: "44 Amy Street",
    quote_title: "Monthly Maintenance",
    job_type: "maintenance",
    raw_transcript: "Monthly maintenance for Sarah.",
    quote_sections: processedQuoteToEditableSections({
      ...EMPTY_PROCESSED_QUOTE,
      client_name: "Sarah",
      site_address: "44 Amy Street",
      job_type: "maintenance",
    }),
    line_items: [],
  })

  assert.deepEqual(reopened.processedQuote.quote_options, [])
  assert.equal(groupCustomerQuoteOptions(reopened.processedQuote.quote_options).length, 0)
})

test("quoteOptionsFromSaved rejects malformed entries without throwing", () => {
  assert.deepEqual(quoteOptionsFromSaved(null), [])
  assert.deepEqual(quoteOptionsFromSaved([{ id: "broken" }]), [])
  assert.equal(quoteOptionsFromSaved([plantingOption()]).length, 1)
})

test("CustomerQuoteOptionsCard input survives save and reopen", () => {
  const quote: ProcessedQuote = { ...EMPTY_PROCESSED_QUOTE, job_type: "decking" }
  applyDeckingBillOptions(quote, "Construct a 4m x 5m pine deck", [pineItem])

  const beforeGroups = groupCustomerQuoteOptions(quote.quote_options)
  const reopened = simulateDraftSaveReopen(quote)
  const afterGroups = groupCustomerQuoteOptions(reopened.processedQuote.quote_options)

  assert.equal(beforeGroups.length, afterGroups.length)
  assert.equal(beforeGroups[0]?.options[0]?.subtotalText, afterGroups[0]?.options[0]?.subtotalText)
  assert.equal(beforeGroups[0]?.options[0]?.isUnpriced, afterGroups[0]?.options[0]?.isUnpriced)
})
