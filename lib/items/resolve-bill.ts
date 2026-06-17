import type { QuoteOption, QuoteOptionLineItem } from "../quote-options"
import type { MaterialBill, MaterialBillEntry } from "../trades/decking/to-bill"

// ---------------------------------------------------------------------------
// Minimal shape of a knowledge item as it arrives in knowledgeItemContext.
// Uses only the fields the resolver needs — avoids coupling to the full DB type.
// ---------------------------------------------------------------------------

export type ResolvableItem = {
  id?: string | null
  item_code?: string | null
  item_name?: string | null
  sell_price?: number | string | null
  unit?: string | null
  account_code?: string | null
  sales_account_code?: string | null
  tax_code?: string | null
  tax_type?: string | null
  gst_rate?: number | string | null
  source_system?: string | null
  supplier?: string | null
  stock_status?: string | null
}

// ---------------------------------------------------------------------------
// Name-substring match — no item_role column, no dimensional scoring.
// entry.label is checked against item_name case-insensitively (both directions).
// ---------------------------------------------------------------------------

function findMatchForEntry(entry: MaterialBillEntry, items: ResolvableItem[]): ResolvableItem | null {
  const needle = entry.label.toLowerCase().trim()
  if (!needle) return null

  return (
    items.find((item) => {
      const name = (item.item_name ?? "").toLowerCase().trim()
      return name.includes(needle) || needle.includes(name)
    }) ?? null
  )
}

function parseSellPrice(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseGstRate(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function entryToLineItem(entry: MaterialBillEntry, match: ResolvableItem | null): QuoteOptionLineItem {
  const unitPrice = match ? parseSellPrice(match.sell_price) : null
  const total = unitPrice !== null ? unitPrice * entry.quantity : null

  return {
    itemName: match?.item_name ?? entry.label,
    itemCode: match?.item_code ?? undefined,
    sourceSystem: match?.source_system ?? undefined,
    accountCode: match?.account_code ?? undefined,
    salesAccountCode: match?.sales_account_code ?? undefined,
    taxCode: match?.tax_code ?? undefined,
    taxType: match?.tax_type ?? undefined,
    gstRate: parseGstRate(match?.gst_rate),
    quantity: entry.quantity,
    unit: entry.unit,
    unitPrice: unitPrice ?? 0,
    total: total ?? 0,
    supplier: match?.supplier ?? undefined,
    stockStatus: match?.stock_status ?? undefined,
    sourceItemId: match?.id ?? undefined,
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveBillToQuoteOption(
  bill: MaterialBill,
  items: ResolvableItem[],
  optionIndex: number,
): QuoteOption {
  const lineItems = bill.entries.map((entry) =>
    entryToLineItem(entry, findMatchForEntry(entry, items)),
  )

  const subtotal = lineItems.reduce((sum, li) => sum + (li.total ?? 0), 0)

  const unmatchedWarnings = bill.entries
    .filter((entry) => findMatchForEntry(entry, items) === null)
    .map((entry) => `${entry.label} (${entry.unit}) — not found in item library`)

  return {
    id: `decking-bill-${optionIndex + 1}-${slugify(bill.area_label)}`,
    label: bill.area_label,
    title: bill.area_label,
    category: "material",
    source: "trade_calculator",
    areaLabel: bill.area_label,
    lineItems,
    subtotal,
    warnings: unmatchedWarnings,
  }
}

export function resolveBillsToQuoteOptions(bills: MaterialBill[], items: ResolvableItem[]): QuoteOption[] {
  return bills.map((bill, index) => resolveBillToQuoteOption(bill, items, index))
}
