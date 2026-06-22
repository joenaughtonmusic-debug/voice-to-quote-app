import type { XeroExportLineItem } from "../../export/xero/types"
import { cleanMetadataText, taxTypeFromGstRate, taxTypeFromText } from "../../export/xero/helpers"
import type { QuoteOption, QuoteOptionLineItem } from "../../quote-options"

// ---------------------------------------------------------------------------
// Paving Xero renderer — reads resolved QuoteOptions produced by
// applyPavingBillOptions, not raw MaterialBill entries.
//
// Quote options produced by the paving bill path have ids starting with
// "paving-bill-". Each option covers one paving area and contains line items
// for pavers, basecourse, bedding sand, and labour.
//
// Export shape per area:
//   - "Paving labour / installation - <area>" (hours × hourly rate)
//   - "Paving materials - <area>"             (quantity 1 × material total)
//
// If an option is unpriced (subtotal = 0 and resolver warnings exist) a
// review-required placeholder is emitted so the export is never empty.
// ---------------------------------------------------------------------------

function isPavingOption(option: QuoteOption): boolean {
  return option.id.startsWith("paving-bill-") && option.source === "trade_calculator"
}

function isLabourLineItem(item: QuoteOptionLineItem): boolean {
  return /\blabou?r\b/i.test(item.itemName)
}

function taxTypeFromQuoteLineItem(item: QuoteOptionLineItem | undefined): string | undefined {
  if (!item) return undefined
  return (
    taxTypeFromText(item.taxType) ??
    taxTypeFromText(item.taxCode) ??
    taxTypeFromGstRate(item.gstRate ?? null)
  )
}

function accountCodeFromQuoteLineItem(item: QuoteOptionLineItem | undefined): string | undefined {
  if (!item) return undefined
  return cleanMetadataText(item.accountCode) ?? cleanMetadataText(item.salesAccountCode)
}

function isOptionUnpriced(option: QuoteOption): boolean {
  return option.subtotal === 0 && (option.warnings ?? []).length > 0
}

function labourItemsFrom(option: QuoteOption): QuoteOptionLineItem[] {
  return option.lineItems.filter(isLabourLineItem)
}

function materialItemsFrom(option: QuoteOption): QuoteOptionLineItem[] {
  return option.lineItems.filter((item) => !isLabourLineItem(item))
}

function totalFrom(items: QuoteOptionLineItem[]): number {
  return items.reduce((sum, item) => sum + item.total, 0)
}

/**
 * Builds Xero line items for paving from the resolved QuoteOptions produced
 * by applyPavingBillOptions → resolveBillsToQuoteOptions.
 *
 * Returns an empty array when no paving quote options exist — the caller
 * falls through to the generic renderer.
 *
 * Emits a review-required placeholder when options exist but are unpriced so
 * a paving export is never silently empty.
 */
export function buildPavingXeroExportLineItemsFromQuoteOptions(
  quoteOptions: QuoteOption[] | undefined,
): XeroExportLineItem[] {
  const pavingOptions = (quoteOptions ?? []).filter(isPavingOption)
  if (pavingOptions.length === 0) return []

  const lines: XeroExportLineItem[] = []

  for (const option of pavingOptions) {
    const areaLabel = option.areaLabel || option.label

    if (isOptionUnpriced(option)) {
      lines.push({
        category: "labour",
        description: `Paving - ${areaLabel} — pricing review required`,
        xeroDescription: [
          `Paving - ${areaLabel}`,
          "Pricing not configured. Review and enter prices before sending.",
          ...(option.warnings ?? []).map((w) => `- ${w}`),
        ].join("\n"),
        quantity: 1,
        unitAmount: undefined,
        unitAmountWasDefaulted: true,
      })
      continue
    }

    const labourItems = labourItemsFrom(option)
    const materialItems = materialItemsFrom(option)
    const labourTotal = totalFrom(labourItems)
    const materialTotal = totalFrom(materialItems)

    if (labourItems.length > 0) {
      const firstLabour = labourItems[0]
      const totalHours = labourItems.reduce((sum, item) => sum + item.quantity, 0)
      const hourlyRate = totalHours > 0 ? labourTotal / totalHours : undefined

      lines.push({
        category: "labour",
        description: `Paving labour / installation - ${areaLabel}`,
        quantity: Number.isFinite(totalHours) ? totalHours : 1,
        unitAmount: hourlyRate,
        unitAmountWasDefaulted: !hourlyRate,
        xeroAccountCode: accountCodeFromQuoteLineItem(firstLabour),
        xeroTaxType: taxTypeFromQuoteLineItem(firstLabour),
        gstRate: firstLabour.gstRate ?? null,
      })
    }

    if (materialItems.length > 0) {
      const firstMaterial = materialItems[0]
      const materialNames = materialItems.map((item) => item.itemName).join(", ")

      lines.push({
        category: "materials",
        description: `Paving materials - ${areaLabel}`,
        xeroDescription: `Paving materials - ${areaLabel}: ${materialNames}`,
        quantity: 1,
        unitAmount: materialTotal > 0 ? materialTotal : undefined,
        unitAmountWasDefaulted: materialTotal === 0,
        xeroAccountCode: accountCodeFromQuoteLineItem(firstMaterial),
        xeroTaxType: taxTypeFromQuoteLineItem(firstMaterial),
        gstRate: firstMaterial.gstRate ?? null,
      })
    }
  }

  return lines
}
