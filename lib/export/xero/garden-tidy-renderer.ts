import { buildGardenTidyExportableLines, isGardenTidyWorkflowQuote } from "../garden-tidy-export-lines"
import { exportableLineToXeroExportLine } from "../map-to-xero"
import type { XeroExportLineItem, XeroPayloadQuote } from "./types"

export { isGardenTidyWorkflowQuote }

/**
 * Builds Xero line items for one-off garden tidy quotes, including hedge_trimming
 * and other garden-tidy-compatible subtypes routed through customer assembly.
 *
 * Pristine-style export:
 * - Labour line: Scope of Work (+ useful Service Includes), no labour allowance or greenwaste
 * - Greenwaste line: separate when captured, with its own price/mapping when available
 */
export function buildGardenTidyXeroExportLineItems(quote: XeroPayloadQuote): XeroExportLineItem[] {
  return buildGardenTidyExportableLines(quote).map(exportableLineToXeroExportLine)
}
