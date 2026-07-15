import type { ExportableQuoteLine } from "./exportable-line"
import { cleanMetadataText, taxTypeFromGstRate, taxTypeFromText } from "./xero/helpers"
import type { QuoteOption, QuoteOptionLineItem } from "../quote-options"

export type TradeBillExportConfig = {
  tradeId: string
  billPrefix: string
  labourLineLabel: (areaLabel: string) => string
  materialsLineLabel: (areaLabel: string) => string
  materialsXeroDescription: (areaLabel: string, materialNames: string) => string
  reviewLineLabel: (areaLabel: string) => string
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

export function isTradeBillOption(option: QuoteOption, billPrefix: string): boolean {
  return option.id.startsWith(billPrefix) && option.source === "trade_calculator"
}

export function buildTradeBillExportableLines(
  quoteOptions: QuoteOption[] | undefined,
  config: TradeBillExportConfig,
): ExportableQuoteLine[] {
  const tradeOptions = (quoteOptions ?? []).filter((option) => isTradeBillOption(option, config.billPrefix))
  if (tradeOptions.length === 0) return []

  const lines: ExportableQuoteLine[] = []

  for (const option of tradeOptions) {
    const areaLabel = option.areaLabel || option.label
    const areaSlug = areaLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")

    if (isOptionUnpriced(option)) {
      lines.push({
        lineId: `${config.tradeId}-${areaSlug}-review`,
        role: "labour",
        category: "labour",
        label: config.reviewLineLabel(areaLabel),
        xeroDescription: [
          config.reviewLineLabel(areaLabel).replace(/ — pricing review required$/, ""),
          "Pricing not configured. Review and enter prices before sending.",
          ...(option.warnings ?? []).map((warning) => `- ${warning}`),
        ].join("\n"),
        quantity: 1,
        pricingSource: "unpriced",
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
      const totalQuantity = labourItems.reduce((sum, item) => sum + item.quantity, 0)
      const unitRate = totalQuantity > 0 ? labourTotal / totalQuantity : undefined

      lines.push({
        lineId: `${config.tradeId}-${areaSlug}-labour`,
        role: "labour",
        category: "labour",
        label: config.labourLineLabel(areaLabel),
        quantity: Number.isFinite(totalQuantity) ? totalQuantity : 1,
        unit: firstLabour.unit,
        unitAmount: unitRate,
        itemCode: firstLabour.itemCode,
        accountCode: firstLabour.accountCode,
        salesAccountCode: firstLabour.salesAccountCode,
        taxType: taxTypeFromQuoteLineItem(firstLabour),
        taxCode: firstLabour.taxCode,
        gstRate: firstLabour.gstRate ?? null,
        pricingSource: unitRate ? "resolver" : "unpriced",
        unitAmountWasDefaulted: !unitRate,
      })
    }

    if (materialItems.length > 0) {
      const firstMaterial = materialItems[0]
      const materialNames = materialItems.map((item) => item.itemName).join(", ")

      lines.push({
        lineId: `${config.tradeId}-${areaSlug}-materials`,
        role: "materials",
        category: "materials",
        label: config.materialsLineLabel(areaLabel),
        xeroDescription: config.materialsXeroDescription(areaLabel, materialNames),
        quantity: 1,
        unitAmount: materialTotal > 0 ? materialTotal : undefined,
        itemCode: firstMaterial.itemCode,
        accountCode: firstMaterial.accountCode,
        salesAccountCode: firstMaterial.salesAccountCode,
        taxType: taxTypeFromQuoteLineItem(firstMaterial),
        taxCode: firstMaterial.taxCode,
        gstRate: firstMaterial.gstRate ?? null,
        pricingSource: materialTotal > 0 ? "resolver" : "unpriced",
        unitAmountWasDefaulted: materialTotal === 0,
      })
    }
  }

  return lines
}
