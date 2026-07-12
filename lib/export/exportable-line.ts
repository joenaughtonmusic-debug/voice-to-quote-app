import type { QuoteLineItem } from "../processed-quote"
import type { QuoteOptionLineItem } from "../quote-options"
import {
  accountCodeFromLineItem,
  cleanMetadataText,
  taxTypeFromGstRate,
  taxTypeFromLineItem,
  taxTypeFromText,
  xeroItemCode,
} from "./xero/helpers"
import type { LabourAllowanceWorkings } from "./labour-line-builder"
import type { XeroExportLineItem } from "./xero/types"

export type ExportPricingSource =
  | "spoken_fixed"
  | "line_item_total"
  | "structured_allowance"
  | "inline_hours_rate"
  | "computed_day_rate"
  | "spoken_greenwaste"
  | "resolver"
  | "unpriced"

export type ExportableLineRole = "labour" | "waste" | "materials" | "plants" | "scope_bundle" | "unknown"

export type ExportableQuoteLine = {
  lineId: string
  role: ExportableLineRole
  category: NonNullable<XeroExportLineItem["category"]>
  /** Short label used for legacy `lineItems[].description`. */
  label: string
  xeroDescription?: string
  quantity?: number
  xeroQuantity?: number
  unit?: string
  unitAmount?: number
  xeroUnitAmount?: number
  itemCode?: string
  omittedItemCode?: string
  itemCodeSource?: string
  accountCode?: string
  salesAccountCode?: string
  taxType?: string
  taxCode?: string
  gstRate?: number | null
  pricingSource: ExportPricingSource
  quantityWasDefaulted?: boolean
  unitAmountWasDefaulted?: boolean
  labourWorkings?: LabourAllowanceWorkings
}

export type { LabourAllowanceWorkings }

export function accountCodeFromExportableLine(line: ExportableQuoteLine) {
  return cleanMetadataText(line.accountCode) ?? cleanMetadataText(line.salesAccountCode)
}

export function taxTypeFromExportableLine(line: ExportableQuoteLine) {
  return taxTypeFromText(line.taxType) ?? taxTypeFromText(line.taxCode) ?? taxTypeFromGstRate(line.gstRate ?? null)
}

export function exportableLineFromQuoteLineItem(
  item: QuoteLineItem,
  options: {
    lineId: string
    role: ExportableLineRole
    category: ExportableQuoteLine["category"]
    label: string
    xeroDescription?: string
    unitAmount?: number | null
    pricingSource: ExportPricingSource
    quantity?: number
    quantityWasDefaulted?: boolean
    unitAmountWasDefaulted?: boolean
  },
): ExportableQuoteLine {
  const code = xeroItemCode(item.item_code, item.source_system, item.item_name, item.description)

  return {
    lineId: options.lineId,
    role: options.role,
    category: options.category,
    label: options.label,
    xeroDescription: options.xeroDescription,
    quantity: options.quantity ?? 1,
    unit: item.unit || undefined,
    unitAmount: options.unitAmount ?? undefined,
    itemCode: code.itemCode,
    omittedItemCode: code.omittedItemCode,
    itemCodeSource: item.source_system,
    accountCode: item.account_code,
    salesAccountCode: item.sales_account_code,
    taxType: item.tax_type,
    taxCode: item.tax_code,
    gstRate: item.gst_rate ?? null,
    pricingSource: options.pricingSource,
    quantityWasDefaulted: options.quantityWasDefaulted,
    unitAmountWasDefaulted: options.unitAmountWasDefaulted,
  }
}

export function exportableLineFromQuoteOptionLineItem(
  item: QuoteOptionLineItem,
  options: {
    lineId: string
    role: ExportableLineRole
    category: ExportableQuoteLine["category"]
    label: string
    xeroDescription?: string
    pricingSource: ExportPricingSource
    quantity?: number
    unitAmount?: number
    quantityWasDefaulted?: boolean
    unitAmountWasDefaulted?: boolean
  },
): ExportableQuoteLine {
  const code = xeroItemCode(item.itemCode, item.sourceSystem, item.itemName)

  return {
    lineId: options.lineId,
    role: options.role,
    category: options.category,
    label: options.label,
    xeroDescription: options.xeroDescription,
    quantity: options.quantity ?? item.quantity,
    xeroQuantity: options.quantity,
    unit: item.unit,
    unitAmount: options.unitAmount ?? item.unitPrice,
    xeroUnitAmount: options.unitAmount ?? item.unitPrice,
    itemCode: code.itemCode,
    omittedItemCode: code.omittedItemCode,
    itemCodeSource: item.sourceSystem,
    accountCode: item.accountCode,
    salesAccountCode: item.salesAccountCode,
    taxType: item.taxType,
    taxCode: item.taxCode,
    gstRate: item.gstRate ?? null,
    pricingSource: options.pricingSource,
    quantityWasDefaulted: options.quantityWasDefaulted,
    unitAmountWasDefaulted: options.unitAmountWasDefaulted,
  }
}

export type ExportLineItemMetadata = {
  item_code?: string | null
  source_system?: string | null
  item_name?: string | null
  description?: string | null
  account_code?: string | null
  sales_account_code?: string | null
  tax_type?: string | null
  tax_code?: string | null
  gst_rate?: number | null
}

/** Copy account/tax/item metadata from a matched line item. */
export function applyQuoteLineItemMetadata(
  line: ExportableQuoteLine,
  item: QuoteLineItem | ExportLineItemMetadata | null | undefined,
): ExportableQuoteLine {
  if (!item) return line

  const code = xeroItemCode(
    item.item_code ?? undefined,
    item.source_system ?? undefined,
    item.item_name ?? undefined,
    item.description ?? undefined,
  )

  return {
    ...line,
    itemCode: line.itemCode ?? code.itemCode,
    omittedItemCode: line.omittedItemCode ?? code.omittedItemCode,
    itemCodeSource: line.itemCodeSource ?? item.source_system ?? undefined,
    accountCode: line.accountCode ?? item.account_code ?? undefined,
    salesAccountCode: line.salesAccountCode ?? item.sales_account_code ?? undefined,
    taxType: line.taxType ?? item.tax_type ?? undefined,
    taxCode: line.taxCode ?? item.tax_code ?? undefined,
    gstRate: line.gstRate ?? item.gst_rate ?? null,
  }
}

export function exportableLineFromLegacyXeroItem(item: XeroExportLineItem, lineId: string): ExportableQuoteLine {
  return {
    lineId,
    role: categoryToRole(item.category),
    category: item.category ?? "unknown",
    label: item.description,
    xeroDescription: item.xeroDescription,
    quantity: item.quantity,
    xeroQuantity: item.xeroQuantity,
    unitAmount: item.unitAmount,
    xeroUnitAmount: item.xeroUnitAmount,
    itemCode: item.itemCode,
    omittedItemCode: item.omittedItemCode,
    itemCodeSource: item.itemCodeSource,
    accountCode: item.xeroAccountCode,
    taxType: item.xeroTaxType,
    gstRate: item.gstRate ?? null,
    pricingSource: item.unitAmountWasDefaulted ? "unpriced" : "line_item_total",
    quantityWasDefaulted: item.quantityWasDefaulted,
    unitAmountWasDefaulted: item.unitAmountWasDefaulted,
  }
}

function categoryToRole(category: XeroExportLineItem["category"]): ExportableLineRole {
  if (category === "labour") return "labour"
  if (category === "waste") return "waste"
  if (category === "plants") return "plants"
  if (category === "materials" || category === "chemical") return "materials"
  return "unknown"
}

export { accountCodeFromLineItem, taxTypeFromLineItem }
