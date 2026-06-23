import { buildPlantingExportableLines } from "../../export/planting-export-lines"
import { exportableLineToXeroExportLine } from "../../export/map-to-xero"
import type { XeroExportLineItem, XeroPayloadQuote, XeroRendererPreview } from "../../export/xero/types"

export function buildPlantingXeroExportLineItems(
  quote: XeroPayloadQuote,
  preview: XeroRendererPreview,
): XeroExportLineItem[] {
  return buildPlantingExportableLines(quote, preview).map(exportableLineToXeroExportLine)
}
