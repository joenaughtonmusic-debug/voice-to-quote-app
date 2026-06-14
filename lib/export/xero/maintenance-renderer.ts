import {
  accountCodeFromLineItem,
  labourLineItem,
  taxTypeFromLineItem,
  xeroItemCode,
} from "./helpers"
import type { XeroExportLineItem, XeroPayloadQuote } from "./types"

function isMaintenanceQuote(quote: XeroPayloadQuote) {
  const selectedTemplate = quote.selected_template
  const primaryQuote = quote.primary_quote as (XeroPayloadQuote["primary_quote"] & { job_type?: string }) | undefined
  const text = [
    quote.job_type,
    quote.quote_title,
    primaryQuote?.job_type,
    quote.primary_quote?.quote_title,
    selectedTemplate?.category,
    selectedTemplate?.job_type,
    selectedTemplate?.trade,
    selectedTemplate?.template_name,
    selectedTemplate?.name,
  ]
    .filter(Boolean)
    .join(" ")

  return /\bmaintenance\b/i.test(text)
}

function spokenFixedPrice(quote: XeroPayloadQuote) {
  return (quote.pricing_facts ?? []).find(
    (fact) => fact.type === "fixed_price" && typeof fact.amount === "number" && Number.isFinite(fact.amount),
  )
}

export function buildMaintenanceXeroExportLineItems(quote: XeroPayloadQuote): XeroExportLineItem[] {
  if (!isMaintenanceQuote(quote)) return []

  const price = spokenFixedPrice(quote)
  if (!price || typeof price.amount !== "number") return []

  const labourItem = labourLineItem(quote)
  const code = xeroItemCode(labourItem?.item_code, labourItem?.source_system, labourItem?.item_name, labourItem?.description)

  return [
    {
      category: "labour",
      description: "Ongoing Garden Maintenance",
      quantity: 1,
      unitAmount: price.amount,
      itemCode: code.itemCode,
      omittedItemCode: code.omittedItemCode,
      itemCodeSource: labourItem?.source_system,
      xeroAccountCode: accountCodeFromLineItem(labourItem),
      xeroTaxType: taxTypeFromLineItem(labourItem),
      gstRate: labourItem?.gst_rate ?? null,
    },
  ]
}
