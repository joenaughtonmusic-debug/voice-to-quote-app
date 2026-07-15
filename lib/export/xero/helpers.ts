import type { CustomerPreviewQuote } from "../../customer-quote-preview"
import type { PricingFact } from "../../core/pricing-extraction"
import type { QuoteOption } from "../../quote-options"
import type { MakeXeroQuoteLineItem, XeroExportLineItem, XeroPayloadQuote, XeroQuoteLineItem } from "./types"

export const CUSTOMER_PRICE_NOT_CAPTURED_WARNING =
  "Customer price not captured. Enter price before sending/exporting."

export function spokenCustomerFixedPrice(quote: Pick<XeroPayloadQuote, "pricing_facts">) {
  return (quote.pricing_facts ?? []).find(
    (fact: PricingFact) => fact.type === "fixed_price" && typeof fact.amount === "number" && Number.isFinite(fact.amount),
  )
}

export function hasSpokenCustomerFixedPrice(quote: Pick<XeroPayloadQuote, "pricing_facts">) {
  return Boolean(spokenCustomerFixedPrice(quote))
}

export function numberFromMoney(value: string | undefined) {
  if (!value) return null
  const number = Number(value.replace(/[$,\s]/g, ""))
  return Number.isFinite(number) ? number : null
}

export function numberFromValue(value: string | null | undefined) {
  if (!value) return null
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

export function explicitPriceFromText(value: string | null | undefined) {
  if (!value) return null

  const patterns = [
    /\bat\s+a\s+cost\s+of\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i,
    /\bcost(?:ing)?\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i,
    /\bfor\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s+plus\s+gst|\s+incl(?:uding)?\s+gst|\s+total|\b)/i,
    /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s+plus\s+gst|\s+incl(?:uding)?\s+gst|\s+total|\b)/i,
  ]

  for (const pattern of patterns) {
    const match = value.match(pattern)
    const number = match?.[1] ? Number(match[1].replace(/,/g, "")) : null
    if (number !== null && Number.isFinite(number)) return number
  }

  return null
}

export function lineItemText(item: CustomerPreviewQuote["line_items"][number]) {
  return [item.item_code, item.item_name, item.item_type, item.description, item.match_reason].join(" ")
}

function normaliseCodeComparison(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

export function cleanItemCode(value: string | null | undefined, itemName?: string | null, description?: string | null) {
  const code = value?.trim()
  if (!code) return undefined

  const normalizedCode = normaliseCodeComparison(code)
  if (normalizedCode && normalizedCode === normaliseCodeComparison(itemName)) return undefined
  if (normalizedCode && normalizedCode === normaliseCodeComparison(description)) return undefined

  return code
}

function isConfirmedXeroItemSource(source: string | null | undefined) {
  return /\bxero\b/i.test(source ?? "")
}

export function xeroItemCode(value: string | null | undefined, source: string | null | undefined, itemName?: string | null, description?: string | null) {
  const code = cleanItemCode(value, itemName, description)
  if (!code) return { itemCode: undefined, omittedItemCode: undefined }
  if (isConfirmedXeroItemSource(source)) return { itemCode: code, omittedItemCode: undefined }
  return { itemCode: undefined, omittedItemCode: code }
}

export function cleanMetadataText(value: string | null | undefined) {
  const text = value?.trim()
  return text || undefined
}

export function accountCodeFromLineItem(item: CustomerPreviewQuote["line_items"][number] | null | undefined) {
  return cleanMetadataText(item?.account_code) ?? cleanMetadataText(item?.sales_account_code)
}

export function accountCodeFallback(category: XeroExportLineItem["category"]) {
  switch (category) {
    case "labour":
      return "10010"
    case "plants":
      return "10115"
    case "materials":
    case "chemical":
    case "waste":
      return "10011"
    default:
      return ""
  }
}

export function taxTypeFromText(value: string | null | undefined) {
  const text = value?.trim()
  if (!text) return undefined
  const normalized = text.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  if (/\b(output2|output|gst on income|15% gst|15 gst|gst 15)\b/i.test(normalized)) return "OUTPUT2"
  if (/\b(no gst|none|exempt|tax exempt|gst free)\b/i.test(normalized)) return "NONE"
  if (/\b(zero rated|zero rated output|0% gst|0 gst)\b/i.test(normalized)) return "ZERORATEDOUTPUT"
  return text
}

export function taxTypeFromGstRate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  if (value === 15 || value === 0.15) return "OUTPUT2"
  return undefined
}

export function taxTypeFromLineItem(item: CustomerPreviewQuote["line_items"][number] | null | undefined) {
  return taxTypeFromText(item?.tax_type) ?? taxTypeFromText(item?.tax_code) ?? taxTypeFromGstRate(item?.gst_rate ?? null)
}

export function labourLineItem(quote: CustomerPreviewQuote) {
  const labourItems = quote.line_items.filter((item) => /\blabou?r\b/i.test(lineItemText(item)))
  const priced = labourItems
    .map((item) => ({ item, total: numberFromValue(item.total) }))
    .filter((entry): entry is { item: CustomerPreviewQuote["line_items"][number]; total: number } => entry.total !== null)
    .sort((a, b) => b.total - a.total)

  return priced[0]?.item ?? null
}

function greenwasteLineItemScore(item: CustomerPreviewQuote["line_items"][number]) {
  const text = lineItemText(item)
  if (/\blabou?r\b/i.test(text)) return -1
  if (/\bgreen\s*waste|greenwaste\b/i.test(text)) return 3
  if (/\btip fee|off loading|vehicle servicing\b/i.test(text)) return 2
  if (/\bwaste|removal|disposal\b/i.test(text)) return 1
  return 0
}

export function greenwasteLineItem(quote: CustomerPreviewQuote) {
  const wasteItems = quote.line_items
    .filter((item) => greenwasteLineItemScore(item) > 0)
    .sort((a, b) => greenwasteLineItemScore(b) - greenwasteLineItemScore(a))

  return wasteItems[0] ?? null
}

export function pricedAmountFromLineItem(item: CustomerPreviewQuote["line_items"][number] | null | undefined) {
  if (!item) return null
  const total = numberFromValue(item.total)
  if (total !== null) return total

  const rate = numberFromValue(item.final_rate_used ?? item.rate ?? item.knowledge_base_rate ?? item.override_rate)
  const quantity = numberFromValue(item.quantity)
  if (rate !== null && quantity !== null) return rate * quantity
  if (rate !== null) return rate

  return explicitPriceFromText([item.description, item.item_name, item.match_reason].filter(Boolean).join(" "))
}

export function materialQuantityFromText(item: CustomerPreviewQuote["line_items"][number], label: RegExp) {
  const text = [item.quantity, item.description, item.item_name, item.match_reason].filter(Boolean).join(" ")
  if (!text) return null

  const labelText = label.source.replace(/\\b|\\s\+|\(|\)|\?|:/g, " ").replace(/\|/g, " ").replace(/\s+/g, " ").trim()
  const gardenMixPattern = /(?:^|\b)(\d+(?:\.\d+)?)\s*(?:bags?|bag)\s+(?:of\s+)?garden\s+mix\b|\bgarden\s+mix\b.*?\b(\d+(?:\.\d+)?)\s*(?:bags?|bag)\b/i
  const genericPattern = new RegExp(`(?:^|\\b)(\\d+(?:\\.\\d+)?)\\s*(?:bags?|bag|each|units?|m3|m2|metres?|meters?)\\s+(?:of\\s+)?(?:${labelText})\\b`, "i")
  const match = /garden\s+mix/i.test(labelText) ? text.match(gardenMixPattern) : text.match(genericPattern)
  const value = match?.[1] ?? match?.[2]
  if (!value) return null

  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity : null
}

export function materialLineItem(quote: CustomerPreviewQuote, label: RegExp, description: string) {
  const item = quote.line_items.find((lineItem) => label.test(lineItemText(lineItem)))
  if (!item) return null

  const explicitQuantity = numberFromValue(item.quantity) ?? materialQuantityFromText(item, label)
  const defaultQuantity = /hardfill|soil\s+removal/i.test(description) ? 1 : undefined
  const quantity = explicitQuantity ?? defaultQuantity
  const rate =
    numberFromValue(item.final_rate_used ?? item.rate ?? item.knowledge_base_rate ?? item.override_rate) ??
    explicitPriceFromText([item.description, item.item_name, item.match_reason].filter(Boolean).join(" "))
  const code = xeroItemCode(item.item_code, item.source_system, item.item_name, item.description)

  return {
    category: /hardfill|soil\s+removal|waste|removal/i.test(description) ? "waste" : "materials",
    description: item.quantity ? `${description} - ${item.quantity}` : description,
    quantity,
    unitAmount: rate ?? undefined,
    itemCode: code.itemCode,
    omittedItemCode: code.omittedItemCode,
    itemCodeSource: item.source_system,
    xeroAccountCode: accountCodeFromLineItem(item),
    xeroTaxType: taxTypeFromLineItem(item),
    gstRate: item.gst_rate ?? null,
    quantityWasDefaulted: explicitQuantity === null && quantity !== undefined,
    unitAmountWasDefaulted: rate === null,
  } satisfies XeroExportLineItem
}

export function defaultAccountCode() {
  return process.env.XERO_DEFAULT_ACCOUNT_CODE || process.env.NEXT_PUBLIC_XERO_DEFAULT_ACCOUNT_CODE || ""
}

export function defaultTaxType() {
  return process.env.XERO_DEFAULT_TAX_TYPE || process.env.NEXT_PUBLIC_XERO_DEFAULT_TAX_TYPE || "OUTPUT2"
}

export function makeXeroLineItem(item: XeroExportLineItem): MakeXeroQuoteLineItem {
  const taxType = item.xeroTaxType ?? defaultTaxType()
  const accountCode = item.xeroAccountCode || accountCodeFallback(item.category) || defaultAccountCode()
  return {
    Description: item.xeroDescription ?? item.description,
    Quantity: typeof item.xeroQuantity === "number" ? item.xeroQuantity : typeof item.quantity === "number" ? item.quantity : 1,
    UnitAmount: typeof item.xeroUnitAmount === "number" ? item.xeroUnitAmount : typeof item.unitAmount === "number" ? item.unitAmount : 0,
    ...(item.itemCode ? { ItemCode: item.itemCode } : {}),
    ...(accountCode ? { AccountCode: accountCode } : {}),
    TaxType: taxType || "OUTPUT2",
  }
}

export function genericLineItem(item: XeroExportLineItem): XeroQuoteLineItem {
  return {
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    accountCode: item.accountCode,
  }
}

export function cleanOptionTitle(title: string, areaLabel?: string) {
  const withoutArea = areaLabel
    ? title.replace(new RegExp(`^${areaLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+-\\s+`, "i"), "")
    : title

  return withoutArea.replace(/\s+/g, " ").trim()
}

export function plantQuantity(option: QuoteOption) {
  return option.lineItems.reduce((total, item) => total + (Number.isFinite(item.quantity) ? item.quantity : 0), 0)
}

export function plantUnitPrice(option: QuoteOption) {
  const firstPricedLine = option.lineItems.find((item) => Number.isFinite(item.unitPrice))
  return firstPricedLine?.unitPrice
}
