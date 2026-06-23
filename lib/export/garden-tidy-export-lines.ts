import { assembleCustomerQuote, type CustomerQuoteAssembly } from "../customer-quote-assembly"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import {
  applyQuoteLineItemMetadata,
  type ExportableQuoteLine,
} from "./exportable-line"
import { resolveLabourExportPrice } from "./labour-line-builder"
import {
  greenwasteDescriptionFromAssembly,
  resolveGreenwasteExportPrice,
} from "./waste-line-builder"
import {
  greenwasteLineItem,
  labourLineItem,
  xeroItemCode,
} from "./xero/helpers"
import type { XeroPayloadQuote } from "./xero/types"

function xeroQuoteAsProcessedQuote(quote: XeroPayloadQuote): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: quote.client_name ?? "",
    site_address: quote.site_address ?? "",
    quote_title: quote.quote_title ?? "",
    job_type: quote.job_type ?? "",
    labour_allowance: quote.labour_allowance ?? "",
    greenwaste: quote.greenwaste ?? "",
    exclusions: (quote as XeroPayloadQuote & { exclusions?: string[] }).exclusions ?? [],
    selected_template_name:
      quote.selected_template_name ?? quote.selected_template?.template_name ?? quote.selected_template?.name ?? "",
    customer_scope: quote.customer_scope ?? [],
    internal_notes: quote.internal_notes ?? [],
    materials: quote.materials ?? [],
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: quote.primary_quote?.quote_title ?? quote.quote_title ?? "",
      job_type: quote.job_type ?? "",
      scope: quote.primary_quote?.scope ?? [],
      notes: quote.primary_quote?.notes ?? [],
    },
    line_items: (quote.line_items ?? []).map((item) => ({
      source_item_id: item.source_item_id,
      source_system: item.source_system,
      item_code: item.item_code ?? "",
      item_name: item.item_name ?? "",
      item_type: item.item_type ?? "",
      description: item.description ?? "",
      quantity: item.quantity ?? null,
      unit: item.unit ?? "",
      rate: item.rate ?? null,
      knowledge_base_rate: item.knowledge_base_rate ?? null,
      override_rate: item.override_rate ?? null,
      final_rate_used: item.final_rate_used ?? null,
      total: item.total ?? null,
      account_code: item.account_code,
      sales_account_code: item.sales_account_code,
      tax_code: item.tax_code,
      tax_type: item.tax_type,
      gst_rate: item.gst_rate,
      match_confidence: item.match_confidence ?? "",
      match_reason: item.match_reason ?? "",
      needs_review: item.needs_review ?? false,
      warning: item.warning ?? "",
    })),
    quote_options: quote.quote_options ?? [],
    plant_calculator_results: quote.plant_calculator_results ?? [],
  }
}

function assemblySectionItems(assembly: CustomerQuoteAssembly, title: string) {
  return assembly.sections.find((section) => section.title === title)?.items ?? []
}

function isGreenwasteRemovalInclude(item: string) {
  return /^greenwaste removal$/i.test(item.trim())
}

function labourXeroDescription(assembly: CustomerQuoteAssembly, hasSeparateGreenwasteLine: boolean) {
  const scope = assemblySectionItems(assembly, "Scope of Work")
  const serviceIncludes = assemblySectionItems(assembly, "Service Includes").filter((item) => {
    if (hasSeparateGreenwasteLine && isGreenwasteRemovalInclude(item)) return false
    return true
  })

  const lines = [...scope]
  for (const item of serviceIncludes) {
    if (!lines.some((line) => line.toLowerCase() === item.toLowerCase())) {
      lines.push(item)
    }
  }

  return lines.join("\n")
}

function shouldExportGreenwasteLine(
  assembly: CustomerQuoteAssembly,
  quote: XeroPayloadQuote,
  wasteItem: XeroPayloadQuote["line_items"][number] | null | undefined,
) {
  return (
    assemblySectionItems(assembly, "Green Waste").length > 0 ||
    Boolean(quote.greenwaste?.trim()) ||
    Boolean(wasteItem)
  )
}

function gardenTidyAssembly(quote: XeroPayloadQuote) {
  return assembleCustomerQuote({
    quote: xeroQuoteAsProcessedQuote(quote),
    pricingFacts: quote.pricing_facts,
    selectedTemplate: quote.selected_template,
  })
}

export function isGardenTidyWorkflowQuote(quote: XeroPayloadQuote): boolean {
  const assembly = gardenTidyAssembly(quote)
  return assembly?.title === "One-Off Garden Tidy"
}

export function buildGardenTidyExportableLines(quote: XeroPayloadQuote): ExportableQuoteLine[] {
  const assembly = gardenTidyAssembly(quote)
  if (!assembly || assembly.title !== "One-Off Garden Tidy") return []

  const scopeItems = assemblySectionItems(assembly, "Scope of Work")
  const hasStructuredContent =
    scopeItems.length > 0 ||
    assembly.sections.some(
      (section) =>
        section.title !== "Price" &&
        section.title !== "Exclusions" &&
        section.title !== "Site Notes" &&
        section.items.length > 0,
    )
  if (!hasStructuredContent) return []

  const wasteItem = greenwasteLineItem(quote)
  const exportGreenwaste = shouldExportGreenwasteLine(assembly, quote, wasteItem)
  const labourItem = labourLineItem(quote)
  const labourPrice = resolveLabourExportPrice(quote)
  const labourCode = xeroItemCode(
    labourItem?.item_code,
    labourItem?.source_system,
    labourItem?.item_name,
    labourItem?.description,
  )

  const lines: ExportableQuoteLine[] = [
    applyQuoteLineItemMetadata(
      {
        lineId: "garden-tidy-labour",
        role: "labour",
        category: "labour",
        label: assembly.title,
        xeroDescription: labourXeroDescription(assembly, exportGreenwaste),
        quantity: labourPrice.quantity,
        unitAmount: labourPrice.unitAmount,
        itemCode: labourCode.itemCode,
        omittedItemCode: labourCode.omittedItemCode,
        itemCodeSource: labourItem?.source_system,
        gstRate: labourItem?.gst_rate ?? null,
        pricingSource: labourPrice.pricingSource,
        unitAmountWasDefaulted: labourPrice.unitAmountWasDefaulted,
        labourWorkings: labourPrice.allowanceWorkings,
      },
      labourItem ?? undefined,
    ),
  ]

  if (!exportGreenwaste) return lines

  const wastePrice = resolveGreenwasteExportPrice(quote)
  const wasteCode = xeroItemCode(
    wasteItem?.item_code,
    wasteItem?.source_system,
    wasteItem?.item_name,
    wasteItem?.description,
  )

  lines.push(
    applyQuoteLineItemMetadata(
      {
        lineId: "garden-tidy-greenwaste",
        role: "waste",
        category: "waste",
        label: "Greenwaste",
        xeroDescription: greenwasteDescriptionFromAssembly(
          assemblySectionItems(assembly, "Green Waste"),
          quote,
          wasteItem,
        ),
        quantity: wastePrice.quantity,
        unitAmount: wastePrice.unitAmountWasDefaulted ? 0 : (wastePrice.unitAmount ?? 0),
        itemCode: wasteCode.itemCode,
        omittedItemCode: wasteCode.omittedItemCode,
        itemCodeSource: wasteItem?.source_system,
        gstRate: wasteItem?.gst_rate ?? null,
        pricingSource: wastePrice.pricingSource,
        unitAmountWasDefaulted: wastePrice.unitAmountWasDefaulted,
      },
      wasteItem ?? undefined,
    ),
  )

  return lines
}
