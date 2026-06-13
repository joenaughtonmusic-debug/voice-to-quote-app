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
  taxTypeFromLineItem,
  taxTypeFromText,
  xeroItemCode,
} from "../../export/xero/helpers"
import type { XeroExportLineItem, XeroPayloadQuote, XeroRendererPreview } from "../../export/xero/types"
import type { QuoteOption } from "../../quote-options"
import { associateMaterialPrices, type MaterialPriceAssociation } from "../../core/material-price-association"

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
      xeroAccountCode?: string
      xeroTaxType?: string
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
    const firstLineWithAccount = option.lineItems.find((item) => cleanMetadataText(item.accountCode) || cleanMetadataText(item.salesAccountCode))
    const firstLineWithTax = option.lineItems.find((item) => cleanMetadataText(item.taxType) || cleanMetadataText(item.taxCode) || item.gstRate !== undefined)
    const code = xeroItemCode(firstLineWithCode?.itemCode, firstLineWithCode?.sourceSystem, firstLineWithCode?.itemName)
    const xeroAccountCode = cleanMetadataText(firstLineWithAccount?.accountCode) ?? cleanMetadataText(firstLineWithAccount?.salesAccountCode)
    const xeroTaxType =
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
        xeroAccountCode: current.xeroAccountCode ?? xeroAccountCode,
        xeroTaxType: current.xeroTaxType ?? xeroTaxType,
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
        xeroAccountCode,
        xeroTaxType,
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

function fallbackMaterialLineFromAssociation(association: MaterialPriceAssociation | undefined, description: string): XeroExportLineItem | null {
  if (!association || association.confidence === "none") return null
  return {
    category: /hardfill|soil\s+removal|spoil|waste|removal/i.test(description) ? "waste" : "materials",
    description,
    quantity: association.quantity,
    unitAmount: association.unitAmount,
    xeroTaxType: "OUTPUT2",
    quantityWasDefaulted: false,
    unitAmountWasDefaulted: association.unitAmount == null,
  }
}

function materialLineWithFactPrice(
  quote: XeroPayloadQuote,
  label: RegExp,
  id: string,
  description: string,
  aliases: string[],
  defaultQuantity?: number,
  defaultUnit?: string,
) {
  const line = materialLineItem(quote, label, description)
  const association = materialAssociation(quote, id, description, aliases, defaultQuantity, defaultUnit)
  const fallback = fallbackMaterialLineFromAssociation(association, description)
  if (!line) return fallback

  const unitAmount =
    typeof line.unitAmount === "number" && Number.isFinite(line.unitAmount)
      ? line.unitAmount
      : fallback?.unitAmount
  const isRemoval = /hardfill|soil\s+removal|spoil|waste|removal/i.test(description)
  const descriptionWithoutDefaultQuantity =
    isRemoval && /^\s*1\s*$/.test(String(line.quantity ?? ""))
      ? description
      : line.description

  return {
    ...line,
    description: descriptionWithoutDefaultQuantity,
    quantity: line.quantity ?? fallback?.quantity,
    unitAmount,
    xeroTaxType: line.xeroTaxType ?? fallback?.xeroTaxType ?? "OUTPUT2",
    quantityWasDefaulted: line.quantityWasDefaulted || fallback?.quantityWasDefaulted,
    unitAmountWasDefaulted: unitAmount == null,
  } satisfies XeroExportLineItem
}

export function buildPlantingXeroExportLineItems(
  quote: XeroPayloadQuote,
  preview: XeroRendererPreview,
) {
  const exportLineItems: XeroExportLineItem[] = []

  const labourAmount = numberFromMoney(preview.labourLine?.amount)
  if (preview.labourLine && labourAmount !== null) {
    const labourItem = labourLineItem(quote)
    const code = xeroItemCode(labourItem?.item_code, labourItem?.source_system, labourItem?.item_name, labourItem?.description)
    exportLineItems.push({
      category: "labour",
      description: preview.rendered.xeroDescriptions.labour ?? "Planting labour",
      quantity: 1,
      unitAmount: labourAmount,
      itemCode: code.itemCode,
      omittedItemCode: code.omittedItemCode,
      itemCodeSource: labourItem?.source_system,
      xeroAccountCode: accountCodeFromLineItem(labourItem),
      xeroTaxType: taxTypeFromLineItem(labourItem),
      gstRate: labourItem?.gst_rate ?? null,
    })
  }

  const plantBase = basePlantOption(preview.plantOptions)
  if (plantBase) {
    const plantExportBase = basePlantExportOption(quote.quote_options)
    exportLineItems.push({
      category: "plants",
      description: `Plants - ${plantBase.title}, ${plantBase.quantityText}`,
      xeroDescription: `Plants - ${plantBase.title}`,
      quantity: 1,
      unitAmount: numberFromMoney(plantBase.subtotalText) ?? 0,
      xeroQuantity: plantExportBase?.quantity ?? 1,
      xeroUnitAmount:
        typeof plantExportBase?.unitAmount === "number" && Number.isFinite(plantExportBase.unitAmount)
          ? plantExportBase.unitAmount
          : numberFromMoney(plantBase.subtotalText) ?? 0,
      itemCode: plantExportBase?.itemCode,
      omittedItemCode: plantExportBase?.omittedItemCode,
      itemCodeSource: plantExportBase?.itemCodeSource,
      xeroAccountCode: plantExportBase?.xeroAccountCode,
      xeroTaxType: plantExportBase?.xeroTaxType,
    })
  }

  const gardenMix = materialLineWithFactPrice(
    quote,
    /\bgarden\s+mix\b/i,
    "garden-mix",
    "Garden mix",
    ["garden mix"],
  )
  if (gardenMix) exportLineItems.push(gardenMix)

  const hardfill = materialLineWithFactPrice(
    quote,
    /\bhardfill|old\s+soil|soil\s+removal|removal\s+of\s+old\s+soil|spoil\b/i,
    "hardfill-removal",
    "Hardfill / spoil removal",
    ["hardfill", "spoil", "old soil", "removal of old soil", "soil removal", "hardfill removal"],
    1,
    "each",
  )
  if (hardfill) exportLineItems.push(hardfill)

  return exportLineItems
}
