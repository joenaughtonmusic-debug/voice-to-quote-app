import { buildPavingExportableLines } from "../../export/paving-export-lines"
import { exportableLineToXeroExportLine } from "../../export/map-to-xero"
import type { XeroExportLineItem } from "../../export/xero/types"
import type { QuoteOption } from "../../quote-options"

export { isPavingQuoteOption } from "../../export/paving-export-lines"

export function buildPavingXeroExportLineItemsFromQuoteOptions(
  quoteOptions: QuoteOption[] | undefined,
): XeroExportLineItem[] {
  return buildPavingExportableLines(quoteOptions).map(exportableLineToXeroExportLine)
}
