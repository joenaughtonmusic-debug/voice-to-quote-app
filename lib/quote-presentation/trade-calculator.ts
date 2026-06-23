import { buildDeckingExportableLines } from "../export/decking-export-lines"
import { buildPavingExportableLines } from "../export/paving-export-lines"
import { buildRetainingExportableLines } from "../export/retaining-export-lines"
import type { ExportableQuoteLine } from "../export/exportable-line"
import { quoteFactsFromProcessedQuote } from "../core/quote-facts"
import type { ProcessedQuote } from "../processed-quote"
import type { QuoteOption } from "../quote-options"
import type {
  QuotePresentationLine,
  QuotePresentationLineRole,
  QuotePresentationModel,
  QuotePresentationSection,
} from "./types"

export type TradeCalculatorPresentationInput = {
  quote: ProcessedQuote
  rawTranscript?: string | null
}

const TRADE_SECTIONS: QuotePresentationSection[] = [
  { sectionId: "trade_options", title: "Trade Options", kind: "trade_options" },
  { sectionId: "labour", title: "Labour", kind: "labour" },
  { sectionId: "materials", title: "Materials", kind: "materials" },
  { sectionId: "review", title: "Review", kind: "review" },
]

const TRADE_BILL_PREFIXES = ["decking-bill-", "retaining-bill-", "paving-bill-"] as const

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function isTradeBillOption(option: QuoteOption): boolean {
  return option.source === "trade_calculator" && TRADE_BILL_PREFIXES.some((prefix) => option.id.startsWith(prefix))
}

function tradeWorkflowId(quote: ProcessedQuote): string {
  const text = [quote.job_type, quote.quote_title, quote.primary_quote.job_type].join(" ")
  if (/\bretaining\b/i.test(text)) return "retaining"
  if (/\bpaving|pavers?\b/i.test(text)) return "paving"
  if (/\bdeck(?:ing)?\b/i.test(text)) return "decking"
  return "trade_calculator"
}

function exportRoleToPresentationRole(role: ExportableQuoteLine["role"]): QuotePresentationLineRole {
  switch (role) {
    case "labour":
      return "labour"
    case "waste":
      return "waste"
    case "materials":
      return "material"
    default:
      return "trade_option"
  }
}

function sectionIdForExportRole(role: ExportableQuoteLine["role"]): string {
  switch (role) {
    case "labour":
      return "labour"
    case "materials":
      return "materials"
    case "waste":
      return "materials"
    default:
      return "trade_options"
  }
}

function exportableLineToPresentationLine(line: ExportableQuoteLine): QuotePresentationLine {
  const hasPrice = typeof line.unitAmount === "number" && Number.isFinite(line.unitAmount) && line.unitAmount > 0
  const subtotal =
    hasPrice && typeof line.quantity === "number" && Number.isFinite(line.quantity)
      ? line.unitAmount! * line.quantity
      : hasPrice && line.quantity === 1
        ? line.unitAmount
        : undefined

  return {
    lineId: line.lineId,
    sectionId: sectionIdForExportRole(line.role),
    role: exportRoleToPresentationRole(line.role),
    customerTitle: line.label,
    customerDescription: line.xeroDescription,
    customerVisible: true,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitAmount,
    subtotal,
    reviewRequired: !hasPrice || line.unitAmountWasDefaulted === true,
    warnings: line.unitAmountWasDefaulted ? ["Pricing review required"] : undefined,
    source: "exportable_line",
    sourceRef: line.lineId,
    itemCode: line.itemCode,
    accountCode: line.accountCode,
    salesAccountCode: line.salesAccountCode,
    taxCode: line.taxCode,
    taxType: line.taxType,
    exportable: hasPrice,
  }
}

function quoteOptionLines(quote: ProcessedQuote): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []

  for (const option of quote.quote_options ?? []) {
    if (!isTradeBillOption(option)) continue

    if (option.subtotal === 0 && (option.warnings ?? []).length > 0) {
      lines.push({
        lineId: `${option.id}-review`,
        sectionId: "trade_options",
        role: "trade_option",
        customerTitle: option.label,
        customerDescription: option.description,
        customerVisible: true,
        reviewRequired: true,
        warnings: option.warnings,
        source: "quote_option",
        sourceRef: option.id,
        exportable: false,
      })
      continue
    }

    for (const [lineIndex, lineItem] of option.lineItems.entries()) {
      const hasPrice =
        typeof lineItem.unitPrice === "number" &&
        Number.isFinite(lineItem.unitPrice) &&
        typeof lineItem.total === "number" &&
        Number.isFinite(lineItem.total)

      const isLabour = /\blabou?r\b/i.test(lineItem.itemName)

      lines.push({
        lineId: `${option.id}-line-${lineIndex}`,
        sectionId: isLabour ? "labour" : "materials",
        role: isLabour ? "labour" : "material",
        customerTitle: `${option.areaLabel || option.label} — ${lineItem.itemName}`,
        customerDescription: hasPrice
          ? `${lineItem.quantity} ${lineItem.unit} x ${money(lineItem.unitPrice)} = ${money(lineItem.total)}`
          : undefined,
        customerVisible: true,
        quantity: lineItem.quantity,
        unit: lineItem.unit,
        unitPrice: lineItem.unitPrice,
        subtotal: lineItem.total,
        reviewRequired: !hasPrice,
        warnings: option.warnings,
        source: "quote_option",
        sourceRef: option.id,
        itemCode: lineItem.itemCode,
        sourceItemId: lineItem.sourceItemId,
        accountCode: lineItem.accountCode,
        salesAccountCode: lineItem.salesAccountCode,
        taxCode: lineItem.taxCode,
        taxType: lineItem.taxType,
        exportable: hasPrice,
      })
    }
  }

  return lines
}

function factsFallbackLines(quote: ProcessedQuote): QuotePresentationLine[] {
  const facts = quoteFactsFromProcessedQuote(quote)
  const workflow = tradeWorkflowId(quote)

  let exportLines: ExportableQuoteLine[] = []
  if (workflow === "decking") {
    exportLines = buildDeckingExportableLines(quote.quote_options, facts)
  } else if (workflow === "retaining") {
    exportLines = buildRetainingExportableLines(quote.quote_options, facts)
  } else if (workflow === "paving") {
    exportLines = buildPavingExportableLines(quote.quote_options)
  } else {
    exportLines = [
      ...buildDeckingExportableLines(quote.quote_options, facts),
      ...buildRetainingExportableLines(quote.quote_options, facts),
      ...buildPavingExportableLines(quote.quote_options),
    ]
  }

  return exportLines.map(exportableLineToPresentationLine)
}

function activeSections(lines: QuotePresentationLine[]): QuotePresentationSection[] {
  const sectionIds = new Set(lines.map((line) => line.sectionId))
  return TRADE_SECTIONS.filter((section) => sectionIds.has(section.sectionId))
}

export function hasTradeBillOptions(quote: ProcessedQuote): boolean {
  return (quote.quote_options ?? []).some(isTradeBillOption)
}

export function isTradeCalculatorWorkflow(quote: ProcessedQuote): boolean {
  if (hasTradeBillOptions(quote)) return true

  const text = [
    quote.job_type,
    quote.quote_title,
    quote.primary_quote.job_type,
    quote.primary_quote.quote_title,
    ...(quote.primary_quote.scope ?? []),
    ...(quote.customer_scope ?? []),
  ].join(" ")

  return /\b(deck(?:ing)?|retaining(?:\s+wall)?|paving|pavers?)\b/i.test(text)
}

export function buildTradeCalculatorPresentationModel(
  input: TradeCalculatorPresentationInput,
): QuotePresentationModel | null {
  if (!isTradeCalculatorWorkflow(input.quote)) return null

  const reviewNotices = [...(input.quote.confidence_warnings ?? []), ...(input.quote.missing_information ?? [])]
  const optionLines = quoteOptionLines(input.quote)
  const lines = optionLines.length > 0 ? optionLines : factsFallbackLines(input.quote)

  if (lines.length === 0) return null

  return {
    workflow: tradeWorkflowId(input.quote),
    title: input.quote.quote_title || input.quote.primary_quote.quote_title || "Trade Quote",
    clientName: input.quote.client_name,
    siteAddress: input.quote.site_address,
    sections: activeSections(lines),
    lines,
    reviewNotices,
  }
}
