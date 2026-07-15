import type { QuoteFact } from "../../core/quote-facts"
import { buildDeckingExportableLines } from "../../export/decking-export-lines"
import { exportableLineToXeroExportLine } from "../../export/map-to-xero"
import type { XeroExportLineItem } from "../../export/xero/types"
import type { QuoteOption } from "../../quote-options"
import type { DeckingCalculatorResult, DeckingXeroRenderResult } from "./types"

export function renderDeckingXeroLinesStub(result: DeckingCalculatorResult): DeckingXeroRenderResult {
  return {
    lines: [],
    warnings: result.warnings,
  }
}

export function buildDeckingXeroExportLineItems(
  quoteOptions: QuoteOption[] | undefined,
  facts: QuoteFact[],
): XeroExportLineItem[] {
  return buildDeckingExportableLines(quoteOptions, facts).map(exportableLineToXeroExportLine)
}

/** @deprecated Use buildDeckingXeroExportLineItems with quote_options for priced export. */
export function buildDeckingXeroExportLineItemsFromQuoteFacts(facts: QuoteFact[]): XeroExportLineItem[] {
  return buildDeckingXeroExportLineItems(undefined, facts)
}
