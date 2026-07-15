import type { ExportableQuoteLine } from "./exportable-line"
import { buildTradeBillExportableLines, isTradeBillOption } from "./trade-calculator-export-lines"
import type { QuoteOption } from "../quote-options"

const PAVING_BILL_CONFIG = {
  tradeId: "paving",
  billPrefix: "paving-bill-",
  labourLineLabel: (areaLabel: string) => `Paving labour / installation - ${areaLabel}`,
  materialsLineLabel: (areaLabel: string) => `Paving materials - ${areaLabel}`,
  materialsXeroDescription: (areaLabel: string, materialNames: string) =>
    `Paving materials - ${areaLabel}: ${materialNames}`,
  reviewLineLabel: (areaLabel: string) => `Paving - ${areaLabel} — pricing review required`,
} as const

export function isPavingQuoteOption(option: QuoteOption): boolean {
  return isTradeBillOption(option, PAVING_BILL_CONFIG.billPrefix)
}

export function buildPavingExportableLines(quoteOptions: QuoteOption[] | undefined): ExportableQuoteLine[] {
  return buildTradeBillExportableLines(quoteOptions, PAVING_BILL_CONFIG)
}
