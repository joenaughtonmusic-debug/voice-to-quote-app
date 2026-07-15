import { resolveExportMapping, type ExportCategoryMapping } from "../export-mappings"
import {
  accountCodeFromExportableLine,
  taxTypeFromExportableLine,
  type ExportableQuoteLine,
} from "./exportable-line"
import {
  accountCodeFallback,
  defaultAccountCode,
  defaultTaxType,
  makeXeroLineItem,
} from "./xero/helpers"
import type { MakeXeroQuoteLineItem, XeroExportLineItem } from "./xero/types"

export type MappedXeroExportLine = {
  line: ExportableQuoteLine
  xeroExportLine: XeroExportLineItem
  mappingWarnings: string[]
  exportEnabled: boolean
}

export function exportableLineToXeroExportLine(line: ExportableQuoteLine): XeroExportLineItem {
  return {
    category: line.category,
    description: line.label,
    xeroDescription: line.xeroDescription,
    quantity: line.quantity,
    xeroQuantity: line.xeroQuantity,
    unitAmount: line.unitAmount,
    xeroUnitAmount: line.xeroUnitAmount,
    itemCode: line.itemCode,
    omittedItemCode: line.omittedItemCode,
    itemCodeSource: line.itemCodeSource,
    xeroAccountCode: accountCodeFromExportableLine(line),
    xeroTaxType: taxTypeFromExportableLine(line),
    gstRate: line.gstRate ?? null,
    quantityWasDefaulted: line.quantityWasDefaulted,
    unitAmountWasDefaulted: line.unitAmountWasDefaulted,
  }
}

export function applyExportMappingToXeroLine(
  item: XeroExportLineItem,
  exportMappings: ExportCategoryMapping[] | undefined,
): MappedXeroExportLine {
  const mapping = resolveExportMapping(item, exportMappings)
  const mappedItem: XeroExportLineItem = { ...item }

  mappedItem.xeroAccountCode = item.xeroAccountCode ?? mapping.accountCode
  mappedItem.xeroTaxType = item.xeroTaxType ?? mapping.taxType

  if (mapping.itemCodePolicy === "never_export") {
    mappedItem.itemCode = undefined
    mappedItem.omittedItemCode = undefined
  } else if (mapping.itemCodePolicy === "allow_imported" && !mappedItem.itemCode && mappedItem.omittedItemCode) {
    mappedItem.itemCode = mappedItem.omittedItemCode
    mappedItem.omittedItemCode = undefined
  }

  return {
    line: {
      lineId: "",
      role: "unknown",
      category: item.category ?? "unknown",
      label: item.description,
      pricingSource: item.unitAmountWasDefaulted ? "unpriced" : "line_item_total",
    },
    xeroExportLine: mappedItem,
    mappingWarnings: mapping.warnings,
    exportEnabled: mapping.exportEnabled,
  }
}

export function mapExportableLineToXero(
  line: ExportableQuoteLine,
  exportMappings?: ExportCategoryMapping[],
): MappedXeroExportLine {
  const xeroLine = exportableLineToXeroExportLine(line)
  const mapped = applyExportMappingToXeroLine(xeroLine, exportMappings)
  return { ...mapped, line }
}

export function mapExportableLinesToXero(
  lines: ExportableQuoteLine[],
  exportMappings?: ExportCategoryMapping[],
): { exportLines: XeroExportLineItem[]; warnings: string[] } {
  const exportLines: XeroExportLineItem[] = []
  const warnings: string[] = []

  for (const line of lines) {
    const mapped = mapExportableLineToXero(line, exportMappings)
    warnings.push(...mapped.mappingWarnings)
    if (!mapped.exportEnabled) continue
    exportLines.push(mapped.xeroExportLine)
  }

  return { exportLines, warnings }
}

export function collectXeroLineItemWarnings(item: XeroExportLineItem): string[] {
  const warnings: string[] = []

  if (!item.itemCode) warnings.push(`No imported item code found for "${item.description}".`)
  if (item.omittedItemCode) {
    warnings.push(
      `Omitted ItemCode "${item.omittedItemCode}" for "${item.description}" because source "${item.itemCodeSource || "unknown"}" is not confirmed Xero inventory.`,
    )
  }
  if (!item.xeroAccountCode && !accountCodeFallback(item.category) && !defaultAccountCode()) {
    warnings.push(`No account code found for "${item.description}".`)
  }
  if (!item.xeroTaxType && !defaultTaxType()) {
    warnings.push(`No tax type found for "${item.description}".`)
  }
  if (item.quantityWasDefaulted) {
    warnings.push(`Quantity missing for "${item.description}". Defaulted Xero quantity to 1.`)
  }
  if (item.unitAmountWasDefaulted) {
    warnings.push(`Price missing for "${item.description}". Defaulted Xero unit amount to 0.`)
  }

  return warnings
}

export function exportableLinesToXeroExportLines(lines: ExportableQuoteLine[]): XeroExportLineItem[] {
  return lines.map(exportableLineToXeroExportLine)
}

export function exportableLineToMakeXeroLineItem(line: ExportableQuoteLine): MakeXeroQuoteLineItem {
  return makeXeroLineItem(exportableLineToXeroExportLine(line))
}

export { makeXeroLineItem }
