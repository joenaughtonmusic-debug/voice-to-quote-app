import type { QuoteFact } from "../../core/quote-facts"
import { buildRetainingExportableLines } from "../../export/retaining-export-lines"
import { exportableLineToXeroExportLine } from "../../export/map-to-xero"
import type { XeroExportLineItem } from "../../export/xero/types"
import type { QuoteOption } from "../../quote-options"
import type { RetainingCalculatorResult, RetainingXeroRenderResult } from "./types"

export function renderRetainingXeroLinesStub(result: RetainingCalculatorResult): RetainingXeroRenderResult {
  return {
    lines: [],
    warnings: result.warnings,
  }
}

export function buildRetainingXeroExportLineItems(
  quoteOptions: QuoteOption[] | undefined,
  facts: QuoteFact[],
): XeroExportLineItem[] {
  return buildRetainingExportableLines(quoteOptions, facts).map(exportableLineToXeroExportLine)
}

/** @deprecated Use buildRetainingXeroExportLineItems with quote_options for priced export. */
export function buildRetainingXeroExportLineItemsFromQuoteFacts(facts: QuoteFact[]): XeroExportLineItem[] {
  return buildRetainingXeroExportLineItems(undefined, facts)
}
