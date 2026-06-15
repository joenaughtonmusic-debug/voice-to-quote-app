import {
  accountCodeFromLineItem,
  labourLineItem,
  taxTypeFromLineItem,
  xeroItemCode,
} from "./helpers"
import type { XeroExportLineItem, XeroPayloadQuote } from "./types"

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values
    .map(cleanLine)
    .filter((value) => {
      const key = value.toLowerCase().replace(/\bgreen\s+waste\b/g, "greenwaste")
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

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

function splitList(value: string) {
  return value
    .split(/\s*,\s*|\s+\band\b\s+/i)
    .map((item) => item.trim().replace(/^(?:and\s+)+/i, ""))
    .filter(Boolean)
}

function mainFocusItems(quote: XeroPayloadQuote) {
  const source = [
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote?.scope ?? []),
  ].find((item) => /\bmain\s+focus\b/i.test(item)) ?? quote.primary_quote?.scope?.join(", ") ?? ""
  const match = source.match(/\bmain\s+focus(?:\s+of\s+visits)?\s*(?:will\s+be|is|are|:)?\s+(.+)$/i)
  const value = match?.[1] ?? source

  return unique(
    splitList(value)
      .map((item) => item.replace(/\bas\s+required\b/i, "").trim())
      .filter((item) => !/\bgeneral\s+garden\s+maintenance\b/i.test(item))
      .map(titleCase),
  )
}

function serviceIncludes(quote: XeroPayloadQuote) {
  return unique(
    (quote.pricing_facts ?? [])
      .filter((fact) => fact.type === "fixed_price")
      .flatMap((fact) => fact.inclusions ?? [])
      .map(titleCase),
  )
}

function ongoingMaintenanceText(quote: XeroPayloadQuote) {
  const source = [
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.primary_quote?.notes ?? []),
  ].find((item) => /\beach\s+visit\s+may\s+include|visits?\s+may\s+include\b/i.test(item))

  if (!source) return ""

  return titleCase(
    cleanLine(source)
      .replace(/\bvisits\s+may\s+include\b/i, "Each visit may include")
      .replace(/\beach\s+visit\s+may\s+include\b/i, "Each visit may include"),
  )
}

function maintenanceDescription(quote: XeroPayloadQuote) {
  const mainFocus = mainFocusItems(quote)
  const includes = serviceIncludes(quote)
  const ongoing = ongoingMaintenanceText(quote)
  const lines = ["Ongoing Garden Maintenance"]

  if (mainFocus.length > 0) {
    lines.push("", "Main focus:", ...mainFocus.map((item) => `- ${item}`))
  }

  if (includes.length > 0) {
    lines.push("", "Includes:", ...includes.map((item) => `- ${item}`))
  }

  if (ongoing) {
    lines.push("", "Ongoing maintenance:", ongoing)
  }

  return lines.join("\n")
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
      xeroDescription: maintenanceDescription(quote),
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
