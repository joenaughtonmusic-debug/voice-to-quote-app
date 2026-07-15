import { associateMaterialPrices, type MaterialPriceAssociation } from "../core/material-price-association"
import {
  applyQuoteLineItemMetadata,
  type ExportableQuoteLine,
} from "./exportable-line"
import {
  accountCodeFromLineItem,
  cleanItemCode,
  cleanMetadataText,
  cleanOptionTitle,
  labourLineItem,
  lineItemText,
  materialLineItem,
  numberFromMoney,
  plantQuantity,
  plantUnitPrice,
  taxTypeFromGstRate,
  taxTypeFromText,
  xeroItemCode,
} from "./xero/helpers"
import type { XeroPayloadQuote, XeroRendererPreview } from "./xero/types"
import type { QuoteOption } from "../quote-options"

function basePlantOption(options: XeroRendererPreview["plantOptions"]) {
  return options.find((option) => option.isBase) ?? options[0]
}

function basePlantExportOption(options: QuoteOption[] | undefined) {
  const combined = new Map<
    string,
    {
      title: string
      quantity: number
      subtotal: number
      unitAmount?: number
      itemCode?: string
      accountCode?: string
      salesAccountCode?: string
      taxType?: string
      taxCode?: string
      gstRate?: number | null
      omittedItemCode?: string
      itemCodeSource?: string
    }
  >()

  for (const option of options ?? []) {
    if (option.category !== "planting") continue
    const title = cleanOptionTitle(option.title, option.areaLabel)
    const quantity = plantQuantity(option)
    const unitAmount = plantUnitPrice(option)
    if (!title || quantity <= 0 || !Number.isFinite(option.subtotal)) continue

    const firstLineWithCode = option.lineItems.find((item) => cleanItemCode(item.itemCode, item.itemName))
    const firstLineWithAccount = option.lineItems.find(
      (item) => cleanMetadataText(item.accountCode) || cleanMetadataText(item.salesAccountCode),
    )
    const firstLineWithTax = option.lineItems.find(
      (item) => cleanMetadataText(item.taxType) || cleanMetadataText(item.taxCode) || item.gstRate !== undefined,
    )
    const code = xeroItemCode(firstLineWithCode?.itemCode, firstLineWithCode?.sourceSystem, firstLineWithCode?.itemName)
    const accountCode = cleanMetadataText(firstLineWithAccount?.accountCode)
    const salesAccountCode = cleanMetadataText(firstLineWithAccount?.salesAccountCode)
    const taxType =
      taxTypeFromText(firstLineWithTax?.taxType) ??
      taxTypeFromText(firstLineWithTax?.taxCode) ??
      taxTypeFromGstRate(firstLineWithTax?.gstRate ?? null)
    const key = title.toLowerCase().replace(/[^a-z0-9āēīōū]/gi, "")
    const current = combined.get(key)
    if (current) {
      combined.set(key, {
        ...current,
        quantity: current.quantity + quantity,
        subtotal: current.subtotal + option.subtotal,
        unitAmount: current.unitAmount ?? unitAmount,
        itemCode: current.itemCode ?? code.itemCode,
        omittedItemCode: current.omittedItemCode ?? code.omittedItemCode,
        itemCodeSource: current.itemCodeSource ?? firstLineWithCode?.sourceSystem,
        accountCode: current.accountCode ?? accountCode,
        salesAccountCode: current.salesAccountCode ?? salesAccountCode,
        taxType: current.taxType ?? taxType,
        gstRate: current.gstRate ?? firstLineWithTax?.gstRate ?? null,
      })
    } else {
      combined.set(key, {
        title,
        quantity,
        subtotal: option.subtotal,
        unitAmount,
        itemCode: code.itemCode,
        omittedItemCode: code.omittedItemCode,
        itemCodeSource: firstLineWithCode?.sourceSystem,
        accountCode,
        salesAccountCode,
        taxType,
        gstRate: firstLineWithTax?.gstRate ?? null,
      })
    }
  }

  return Array.from(combined.values()).sort((a, b) => a.subtotal - b.subtotal)[0] ?? null
}

function quoteFactText(quote: XeroPayloadQuote) {
  return [
    ...(quote.materials ?? []),
    quote.greenwaste ?? "",
    ...(quote.customer_scope ?? []),
    ...(quote.internal_notes ?? []),
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.line_items ?? []).map(lineItemText),
  ].join(". ")
}

function materialAssociation(
  quote: XeroPayloadQuote,
  id: string,
  description: string,
  aliases: string[],
  defaultQuantity?: number,
  defaultUnit?: string,
) {
  return associateMaterialPrices(quoteFactText(quote), [
    {
      id,
      description,
      aliases,
      defaultQuantity,
      defaultUnit,
    },
  ])[0]
}

function materialExportLineFromAssociation(
  association: MaterialPriceAssociation | undefined,
  description: string,
  lineId: string,
): ExportableQuoteLine | null {
  if (!association || association.confidence === "none") return null

  const isWaste = /hardfill|soil\s+removal|spoil|waste|removal/i.test(description)

  return {
    lineId,
    role: isWaste ? "waste" : "materials",
    category: isWaste ? "waste" : "materials",
    label: description,
    quantity: association.quantity,
    unitAmount: association.unitAmount ?? undefined,
    taxType: "OUTPUT2",
    pricingSource: association.unitAmount == null ? "unpriced" : "resolver",
    quantityWasDefaulted: false,
    unitAmountWasDefaulted: association.unitAmount == null,
  }
}

function materialExportLineWithFactPrice(
  quote: XeroPayloadQuote,
  label: RegExp,
  lineId: string,
  description: string,
  aliases: string[],
  defaultQuantity?: number,
  defaultUnit?: string,
): ExportableQuoteLine | null {
  const line = materialLineItem(quote, label, description)
  const association = materialAssociation(quote, lineId, description, aliases, defaultQuantity, defaultUnit)
  const fallback = materialExportLineFromAssociation(association, description, lineId)
  if (!line) return fallback

  const unitAmount =
    typeof line.unitAmount === "number" && Number.isFinite(line.unitAmount) ? line.unitAmount : fallback?.unitAmount
  const isRemoval = /hardfill|soil\s+removal|spoil|waste|removal/i.test(description)
  const labelText =
    isRemoval && /^\s*1\s*$/.test(String(line.quantity ?? "")) ? description : line.description

  return {
    lineId,
    role: isRemoval ? "waste" : "materials",
    category: isRemoval ? "waste" : "materials",
    label: labelText,
    quantity: line.quantity ?? fallback?.quantity,
    unitAmount,
    itemCode: line.itemCode,
    omittedItemCode: line.omittedItemCode,
    itemCodeSource: line.itemCodeSource,
    accountCode: line.xeroAccountCode,
    taxType: line.xeroTaxType ?? fallback?.taxType ?? "OUTPUT2",
    gstRate: line.gstRate ?? null,
    pricingSource: unitAmount == null ? "unpriced" : "line_item_total",
    quantityWasDefaulted: line.quantityWasDefaulted || fallback?.quantityWasDefaulted,
    unitAmountWasDefaulted: unitAmount == null,
  }
}

export function buildPlantingExportableLines(
  quote: XeroPayloadQuote,
  preview: XeroRendererPreview,
): ExportableQuoteLine[] {
  const lines: ExportableQuoteLine[] = []

  const labourAmount = numberFromMoney(preview.labourLine?.amount)
  if (preview.labourLine && labourAmount !== null) {
    const labourItem = labourLineItem(quote)
    const code = xeroItemCode(
      labourItem?.item_code,
      labourItem?.source_system,
      labourItem?.item_name,
      labourItem?.description,
    )

    lines.push(
      applyQuoteLineItemMetadata(
        {
          lineId: "planting-labour",
          role: "labour",
          category: "labour",
          label: preview.rendered.xeroDescriptions.labour ?? "Planting labour",
          quantity: 1,
          unitAmount: labourAmount,
          itemCode: code.itemCode,
          omittedItemCode: code.omittedItemCode,
          itemCodeSource: labourItem?.source_system,
          gstRate: labourItem?.gst_rate ?? null,
          pricingSource: "line_item_total",
          unitAmountWasDefaulted: false,
        },
        labourItem ?? undefined,
      ),
    )
  }

  const plantBase = basePlantOption(preview.plantOptions)
  if (plantBase) {
    const plantExportBase = basePlantExportOption(quote.quote_options)
    const subtotal = numberFromMoney(plantBase.subtotalText) ?? 0
    const xeroUnitAmount =
      typeof plantExportBase?.unitAmount === "number" && Number.isFinite(plantExportBase.unitAmount)
        ? plantExportBase.unitAmount
        : subtotal

    lines.push({
      lineId: "planting-plants-base",
      role: "plants",
      category: "plants",
      label: `Plants - ${plantBase.title}, ${plantBase.quantityText}`,
      xeroDescription: `Plants - ${plantBase.title}`,
      quantity: 1,
      xeroQuantity: plantExportBase?.quantity ?? 1,
      unitAmount: subtotal,
      xeroUnitAmount,
      itemCode: plantExportBase?.itemCode,
      omittedItemCode: plantExportBase?.omittedItemCode,
      itemCodeSource: plantExportBase?.itemCodeSource,
      accountCode: plantExportBase?.accountCode,
      salesAccountCode: plantExportBase?.salesAccountCode,
      taxType: plantExportBase?.taxType,
      gstRate: plantExportBase?.gstRate ?? null,
      pricingSource: "resolver",
      unitAmountWasDefaulted: false,
    })
  }

  const gardenMix = materialExportLineWithFactPrice(
    quote,
    /\bgarden\s+mix\b/i,
    "planting-garden-mix",
    "Garden mix",
    ["garden mix"],
  )
  if (gardenMix) lines.push(gardenMix)

  const hardfill = materialExportLineWithFactPrice(
    quote,
    /\bhardfill|old\s+soil|soil\s+removal|removal\s+of\s+old\s+soil|spoil\b/i,
    "planting-hardfill-removal",
    "Hardfill / spoil removal",
    ["hardfill", "spoil", "old soil", "removal of old soil", "soil removal", "hardfill removal"],
    1,
    "each",
  )
  if (hardfill) lines.push(hardfill)

  return lines
}
