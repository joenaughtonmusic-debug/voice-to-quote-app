import { associateMaterialPrices } from "../../core/material-price-association"
import { resolveBillsToQuoteOptions, type ResolvableItem } from "../../items/resolve-bill"
import type { ProcessedQuote, QuoteLineItem } from "../../processed-quote"
import type { QuoteOption, QuoteOptionLineItem } from "../../quote-options"
import { hasPlantingCalculatorIntent } from "./intent"
import { PLANTING_MATERIAL_SPECS, plantingMaterialsToBills } from "./to-material-bill"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function getStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .slice(0, limit)
}

function parseResolvablePrice(value: unknown): number | string | null | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) return value
  return undefined
}

function plantingMaterialKnowledgeItems(knowledgeItems: unknown[]): ResolvableItem[] {
  return knowledgeItems
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => item !== null)
    .filter((item) => {
      const itemType = typeof item.item_type === "string" ? item.item_type.toLowerCase() : ""
      return itemType !== "plant"
    })
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      source_item_id: typeof item.source_item_id === "string" ? item.source_item_id : undefined,
      item_code: typeof item.item_code === "string" ? item.item_code : undefined,
      item_name: typeof item.item_name === "string" ? item.item_name : undefined,
      sell_price: parseResolvablePrice(item.sell_price),
      cost_price: parseResolvablePrice(item.cost_price),
      unit: typeof item.unit === "string" ? item.unit : undefined,
      account_code: typeof item.account_code === "string" ? item.account_code : undefined,
      sales_account_code: typeof item.sales_account_code === "string" ? item.sales_account_code : undefined,
      tax_code: typeof item.tax_code === "string" ? item.tax_code : undefined,
      tax_type: typeof item.tax_type === "string" ? item.tax_type : undefined,
      gst_rate: parseResolvablePrice(item.gst_rate),
      source_system: typeof item.source_system === "string" ? item.source_system : undefined,
      supplier: typeof item.supplier === "string" ? item.supplier : undefined,
      stock_status: typeof item.stock_status === "string" ? item.stock_status : undefined,
      aliases: getStringArray(item.aliases, 12),
    }))
}

export function hasPlantingMaterialResolverIntent(
  transcript: string,
  quote: Pick<ProcessedQuote, "plant_calculator_results" | "quote_options" | "job_type" | "materials">,
): boolean {
  if (hasPlantingCalculatorIntent(transcript)) return true
  if ((quote.plant_calculator_results ?? []).length > 0) return true
  if ((quote.quote_options ?? []).some((option) => option.category === "planting")) return true
  if (/\bplanting\b/i.test(quote.job_type)) return true
  if ((quote.materials ?? []).some((material) => PLANTING_MATERIAL_SPECS.some((spec) => spec.pattern.test(material)))) {
    return true
  }
  return PLANTING_MATERIAL_SPECS.some((spec) => spec.pattern.test(transcript))
}

function materialKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function lineItemMaterialKey(item: QuoteLineItem | QuoteOptionLineItem) {
  const name = "itemName" in item ? item.itemName : item.item_name
  return materialKey(name)
}

function spokenPriceForLabel(transcript: string, label: string, aliases: string[]) {
  const [association] = associateMaterialPrices(transcript, [
    {
      id: materialKey(label),
      description: label,
      aliases,
    },
  ])

  if (!association || association.unitAmount == null) return null
  return association
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

function resolvedRate(line: QuoteOptionLineItem): number | null {
  return typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice) && line.unitPrice > 0 ? line.unitPrice : null
}

function existingSpokenOrOverrideRate(item: QuoteLineItem): number | null {
  for (const candidate of [item.override_rate, item.final_rate_used, item.rate]) {
    if (candidate == null || candidate === "") continue
    const parsed = Number(String(candidate).replace(/[^\d.]/g, ""))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function toProcessedMaterialLineItem(
  line: QuoteOptionLineItem,
  spec: (typeof PLANTING_MATERIAL_SPECS)[number] | undefined,
  spokenUnitPrice: number | null,
  warnings: string[],
): QuoteLineItem {
  const kbRate = resolvedRate(line)
  const unitPrice = spokenUnitPrice ?? kbRate
  const quantity = line.quantity
  const total = unitPrice != null ? unitPrice * quantity : null
  const matched = kbRate != null || Boolean(line.sourceItemId && line.itemCode)

  return {
    item_code: line.itemCode ?? "",
    item_name: line.itemName,
    item_type: "material",
    description: line.itemName,
    quantity: String(quantity),
    unit: line.unit ?? spec?.defaultUnit ?? "",
    rate: unitPrice != null ? String(unitPrice) : null,
    knowledge_base_rate: kbRate != null && spokenUnitPrice == null ? String(kbRate) : null,
    override_rate: spokenUnitPrice != null ? String(spokenUnitPrice) : null,
    final_rate_used: unitPrice != null ? String(unitPrice) : null,
    total: total != null ? formatMoney(total) : null,
    source_item_id: line.sourceItemId,
    source_system: line.sourceSystem,
    account_code: line.accountCode,
    sales_account_code: line.salesAccountCode,
    tax_code: line.taxCode,
    tax_type: line.taxType,
    gst_rate: line.gstRate ?? null,
    match_confidence: unitPrice != null ? (spokenUnitPrice != null ? "high" : matched ? "high" : "medium") : "low",
    match_reason:
      spokenUnitPrice != null
        ? "Spoken material price from transcript."
        : matched
          ? "Matched planting material from knowledge item library."
          : warnings[0] ?? "Planting material mentioned in transcript; no confident priced Knowledge Base match found.",
    needs_review: unitPrice == null,
    warning: unitPrice == null ? "Rate missing" : "",
  }
}

function mergeProcessedMaterialLine(existing: QuoteLineItem, next: QuoteLineItem): QuoteLineItem {
  const existingRate = existingSpokenOrOverrideRate(existing)
  const nextRate = existingSpokenOrOverrideRate(next)
  const unitPrice = existingRate ?? nextRate

  return {
    ...existing,
    ...next,
    item_code: existing.item_code || next.item_code,
    quantity: existing.quantity ?? next.quantity,
    unit: existing.unit || next.unit,
    rate: unitPrice != null ? String(unitPrice) : next.rate,
    knowledge_base_rate: existing.knowledge_base_rate ?? next.knowledge_base_rate,
    override_rate: existing.override_rate ?? next.override_rate,
    final_rate_used: unitPrice != null ? String(unitPrice) : next.final_rate_used,
    total: unitPrice != null && (existing.quantity ?? next.quantity)
      ? formatMoney(unitPrice * Number(String(existing.quantity ?? next.quantity).replace(/[^\d.]/g, "")))
      : next.total ?? existing.total,
    source_item_id: existing.source_item_id || next.source_item_id,
    source_system: existing.source_system || next.source_system,
    account_code: existing.account_code || next.account_code,
    sales_account_code: existing.sales_account_code || next.sales_account_code,
    tax_code: existing.tax_code || next.tax_code,
    tax_type: existing.tax_type || next.tax_type,
    gst_rate: existing.gst_rate ?? next.gst_rate,
    needs_review: unitPrice == null,
    warning: unitPrice == null ? "Rate missing" : "",
    match_reason: existing.override_rate ? existing.match_reason : next.match_reason,
  }
}

function appendMaterialQuoteOptions(quote: ProcessedQuote, options: QuoteOption[]) {
  const existing = quote.quote_options ?? []
  const withoutPlantingMaterials = existing.filter(
    (option) => !(option.category === "material" && option.source === "trade_calculator" && option.areaLabel === "Planting materials"),
  )
  quote.quote_options = [...withoutPlantingMaterials, ...options]
}

function mergeMaterialLineItems(
  quote: ProcessedQuote,
  options: QuoteOption[],
  transcript: string,
) {
  for (const option of options) {
    if (option.category !== "material") continue

    for (const line of option.lineItems) {
      const spec = PLANTING_MATERIAL_SPECS.find((entry) => materialKey(entry.label) === materialKey(line.itemName))
      const spoken = spokenPriceForLabel(transcript, spec?.label ?? line.itemName, spec?.aliases ?? [line.itemName])
      const spokenUnitPrice = spoken?.unitAmount ?? null
      const processed = toProcessedMaterialLineItem(line, spec, spokenUnitPrice, option.warnings ?? [])
      const key = lineItemMaterialKey(processed)
      const existingIndex = quote.line_items.findIndex((item) => lineItemMaterialKey(item) === key)

      if (existingIndex >= 0) {
        quote.line_items[existingIndex] = mergeProcessedMaterialLine(quote.line_items[existingIndex]!, processed)
        continue
      }

      quote.line_items.push(processed)
    }
  }
}

/**
 * Detects planting ancillary materials from transcript/quote facts, resolves them
 * through MaterialBill → Resolver, and merges priced lines into quote_options and
 * line_items without disturbing plant option pricing.
 */
export function applyPlantingMaterialOptions(
  quote: ProcessedQuote,
  transcript: string,
  knowledgeItems: unknown[],
): void {
  if (!hasPlantingMaterialResolverIntent(transcript, quote)) return

  const bills = plantingMaterialsToBills({
    transcript,
    materials: quote.materials,
    customer_scope: quote.customer_scope,
    primary_quote_scope: quote.primary_quote.scope,
  })
  if (bills.length === 0) return

  const resolvableItems = plantingMaterialKnowledgeItems(knowledgeItems)
  const options = resolveBillsToQuoteOptions(bills, resolvableItems)
  if (options.length === 0) return

  appendMaterialQuoteOptions(quote, options)
  mergeMaterialLineItems(quote, options, transcript)
}
