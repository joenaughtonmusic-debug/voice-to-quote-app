import { resolveMaintenanceExtras } from "../maintenance-extras"
import { resolveMaintenanceGreenwaste } from "../maintenance-greenwaste"
import { extractMaintenancePricingFacts } from "../maintenance-pricing-facts"
import { resolveMaintenanceVisitPrice } from "../maintenance-visit-price"
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

function isGardenTidyQuote(quote: XeroPayloadQuote) {
  const selectedTemplate = quote.selected_template
  const text = [
    quote.job_type,
    quote.quote_title,
    quote.primary_quote?.quote_title,
    selectedTemplate?.category,
    selectedTemplate?.job_type,
    selectedTemplate?.template_name,
    selectedTemplate?.name,
  ]
    .filter(Boolean)
    .join(" ")

  return /\bgarden[_\s-]?tidy|one[_\s-]?off[_\s-]?tidy|property[_\s-]?tidy\b/i.test(text)
}

function isMaintenanceQuote(quote: XeroPayloadQuote) {
  if (isGardenTidyQuote(quote)) return false

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

function cadenceHeaderLine(quote: XeroPayloadQuote): string {
  const text = [
    quote.job_type,
    quote.quote_title,
    quote.primary_quote?.quote_title,
  ]
    .filter(Boolean)
    .join(" ")

  if (/\b(?:four[-\s]monthly|4[-\s]monthly|every\s+4\s+months?)\b/i.test(text)) return "4-Monthly Garden Maintenance"
  if (/\b(?:three[-\s]monthly|3[-\s]monthly|every\s+3\s+months?|quarterly)\b/i.test(text)) return "3-Monthly Garden Maintenance"
  if (/\b(?:two[-\s]monthly|2[-\s]monthly|every\s+2\s+months?)\b/i.test(text)) return "2-Monthly Garden Maintenance"
  if (/\b(?:six[-\s]weekly|6[-\s]weekly|every\s+6\s+weeks?)\b/i.test(text)) return "6-Weekly Garden Maintenance"
  return "Ongoing Garden Maintenance"
}

function maintenanceDescription(quote: XeroPayloadQuote) {
  const mainFocus = mainFocusItems(quote)
  const includes = serviceIncludes(quote)
  const ongoing = ongoingMaintenanceText(quote)
  const header = cadenceHeaderLine(quote)
  const lines = [header]

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

  // Per-visit price: the deterministic resolver (spoken per-visit total → computed hours × rate)
  // when a transcript is present, else the AI pricing-facts fixed price so quotes without a
  // transcript on the export path (e.g. the Stella acceptance) keep their single $405 line.
  const transcript = quote.raw_transcript ?? null
  const resolvedVisit = resolveMaintenanceVisitPrice(extractMaintenancePricingFacts(transcript), transcript)
  const spoken = spokenFixedPrice(quote)
  const visitAmount =
    resolvedVisit.pricingSource !== "unpriced" && resolvedVisit.amount > 0
      ? resolvedVisit.amount
      : typeof spoken?.amount === "number"
        ? spoken.amount
        : null
  if (visitAmount == null) return []

  const labourItem = labourLineItem(quote)
  const code = xeroItemCode(labourItem?.item_code, labourItem?.source_system, labourItem?.item_name, labourItem?.description)
  const accountCode = accountCodeFromLineItem(labourItem)
  const taxType = taxTypeFromLineItem(labourItem)
  const gstRate = labourItem?.gst_rate ?? null

  const lines: XeroExportLineItem[] = [
    {
      category: "labour",
      description: cadenceHeaderLine(quote),
      xeroDescription: maintenanceDescription(quote),
      quantity: 1,
      unitAmount: visitAmount,
      itemCode: code.itemCode,
      omittedItemCode: code.omittedItemCode,
      itemCodeSource: labourItem?.source_system,
      xeroAccountCode: accountCode,
      xeroTaxType: taxType,
      gstRate,
    },
  ]

  // Greenwaste as its own line (M5) when charged separately, so the Xero total matches the customer
  // draft. Folded/"included" greenwaste (Brett/Stella) adds no line.
  const greenwaste = resolveMaintenanceGreenwaste(transcript)
  if (greenwaste.amount != null) {
    lines.push({
      category: "waste",
      description: "Removal of greenwaste",
      xeroDescription: "Removal of greenwaste",
      quantity: 1,
      unitAmount: greenwaste.amount,
      xeroAccountCode: accountCode,
      xeroTaxType: taxType,
      gstRate,
    })
  }

  // Each itemised extra as its own line (Nadia sprays/tool, Brett petrol) for parity. A flagged
  // extra (no price captured) exports at $0 rather than being silently dropped; folded/"included"
  // extras add no line.
  for (const extra of resolveMaintenanceExtras(transcript)) {
    if (extra.included) continue
    const priced = extra.amount != null && extra.amount > 0
    lines.push({
      category: "materials",
      description: extra.name,
      xeroDescription: extra.name,
      quantity: 1,
      unitAmount: priced ? (extra.amount as number) : 0,
      unitAmountWasDefaulted: !priced,
      xeroAccountCode: accountCode,
      xeroTaxType: taxType,
      gstRate,
    })
  }

  return lines
}
