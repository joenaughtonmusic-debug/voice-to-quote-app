import { buildCustomerQuotePreview } from "./customer-quote-preview"
import { resolveExportMapping, type ExportCategoryMapping } from "./export-mappings"
import {
  accountCodeFallback,
  defaultAccountCode,
  defaultTaxType,
  genericLineItem,
  makeXeroLineItem,
} from "./export/xero/helpers"
import { buildGenericXeroExportLineItems } from "./export/xero/generic-renderer"
import type { MakeXeroQuoteLineItem, XeroExportLineItem, XeroPayloadQuote, XeroQuoteLineItem } from "./export/xero/types"
import { quoteFactsFromProcessedQuote } from "./core/quote-facts"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote, type QuoteLineItem } from "./processed-quote"
import { buildPlantingXeroExportLineItems } from "./trades/planting/xero-renderer"
import { buildDeckingXeroExportLineItemsFromQuoteFacts } from "./trades/decking/xero-renderer"
import { buildRetainingXeroExportLineItemsFromQuoteFacts } from "./trades/retaining/xero-renderer"
import type { QuoteOption } from "./quote-options"

export type { MakeXeroQuoteLineItem, XeroPayloadQuote, XeroQuoteLineItem }

export type XeroQuotePayload = {
  provider: "xero"
  action: "create_draft_quote"
  contact: {
    name: string
    emailAddress?: string
    address?: string
  }
  contactCollection: Array<{
    Name: string
    EmailAddress?: string
    Address?: string
  }>
  quote: {
    title: string
    reference: string
    date: string
    expiryDate: string
    status: "DRAFT"
    lineItems: XeroQuoteLineItem[]
    lineItemsArray: XeroQuoteLineItem[]
    xeroLineItemsArray: MakeXeroQuoteLineItem[]
    exportWarnings: string[]
    notes: string[]
  }
  source: {
    app: "Quotecord"
    draftId?: string | null
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function xeroContactName(quote: Pick<XeroPayloadQuote, "client_name">) {
  const name = quote.client_name?.trim()
  if (!name || /^not captured$/i.test(name)) return ""
  return name
}

function xeroContactAddress(quote: Pick<XeroPayloadQuote, "site_address">) {
  const address = quote.site_address?.trim()
  if (!address || /^not captured$/i.test(address)) return ""
  return address
}

function isPlantingQuote(quote: XeroPayloadQuote) {
  const text = [quote.job_type, quote.quote_title, quote.primary_quote?.quote_title].filter(Boolean).join(" ")
  return /\b(planting|hedge\s+planting|plant\s+install|plant\s+supply|plants?)\b/i.test(text)
}

function scopeNotes(quote: XeroPayloadQuote) {
  const preview = buildCustomerQuotePreview(quote)
  const generatedScope = preview.scopeItems
  const fallbackScope = [
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.primary_quote?.notes ?? []),
  ].filter(Boolean)

  return generatedScope.length > 0 ? generatedScope : fallbackScope
}

function normalisedLineItem(item: XeroPayloadQuote["line_items"][number]): QuoteLineItem {
  return {
    source_item_id: item.source_item_id,
    source_system: item.source_system,
    item_code: item.item_code ?? "",
    item_name: item.item_name ?? "",
    item_type: item.item_type ?? "",
    description: item.description ?? "",
    quantity: item.quantity ?? null,
    unit: item.unit ?? "",
    rate: item.rate ?? null,
    knowledge_base_rate: item.knowledge_base_rate ?? null,
    override_rate: item.override_rate ?? null,
    final_rate_used: item.final_rate_used ?? null,
    total: item.total ?? null,
    account_code: item.account_code,
    sales_account_code: item.sales_account_code,
    tax_code: item.tax_code,
    tax_type: item.tax_type,
    gst_rate: item.gst_rate,
    match_confidence: item.match_confidence ?? "",
    match_reason: item.match_reason ?? "",
    needs_review: item.needs_review ?? false,
    warning: item.warning ?? "",
  }
}

function quoteFactsForXero(quote: XeroPayloadQuote) {
  const processedQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: quote.client_name ?? "",
    site_address: quote.site_address ?? "",
    quote_title: quote.quote_title ?? "",
    job_type: quote.job_type ?? "",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: quote.primary_quote?.quote_title ?? quote.quote_title ?? "",
      job_type: quote.job_type ?? "",
      scope: quote.primary_quote?.scope ?? [],
      notes: quote.primary_quote?.notes ?? [],
    },
    customer_scope: quote.customer_scope ?? [],
    materials: quote.materials ?? [],
    greenwaste: quote.greenwaste ?? "",
    internal_notes: quote.internal_notes ?? [],
    line_items: quote.line_items.map(normalisedLineItem),
    plant_calculator_results: quote.plant_calculator_results ?? [],
    quote_options: quote.quote_options ?? [],
  }

  return quoteFactsFromProcessedQuote(processedQuote)
}

export function buildXeroQuotePayload(
  quote: XeroPayloadQuote,
  options: { draftId?: string | null; now?: Date; exportMappings?: ExportCategoryMapping[] } = {},
): XeroQuotePayload {
  const preview = buildCustomerQuotePreview(quote)
  const quoteFacts = quoteFactsForXero(quote)
  const deckingExportLineItems = buildDeckingXeroExportLineItemsFromQuoteFacts(quoteFacts)
  const retainingExportLineItems = buildRetainingXeroExportLineItemsFromQuoteFacts(quoteFacts)
  const now = options.now ?? new Date()
  const renderedExportLineItems =
    deckingExportLineItems.length > 0
      ? deckingExportLineItems
      : retainingExportLineItems.length > 0
        ? retainingExportLineItems
        : isPlantingQuote(quote)
        ? buildPlantingXeroExportLineItems(quote, preview)
        : buildGenericXeroExportLineItems(quote, preview)
  const exportWarnings: string[] = []
  const exportLineItems: XeroExportLineItem[] = []
  for (const item of renderedExportLineItems) {
    const mapping = resolveExportMapping(item, options.exportMappings)
    exportWarnings.push(...mapping.warnings)
    if (!mapping.exportEnabled) continue

    const mappedItem = { ...item }
    mappedItem.xeroAccountCode = item.xeroAccountCode ?? mapping.accountCode
    mappedItem.xeroTaxType = item.xeroTaxType ?? mapping.taxType

    if (mapping.itemCodePolicy === "never_export") {
      mappedItem.itemCode = undefined
      mappedItem.omittedItemCode = undefined
    } else if (mapping.itemCodePolicy === "allow_imported" && !mappedItem.itemCode && mappedItem.omittedItemCode) {
      mappedItem.itemCode = mappedItem.omittedItemCode
      mappedItem.omittedItemCode = undefined
    }

    exportLineItems.push(mappedItem)
  }
  const contactName = xeroContactName(quote)
  const contactAddress = xeroContactAddress(quote)

  const upgradeNotes = preview.plantOptions
    .filter((option) => !option.isBase)
    .map((option) => `Upgrade option available: ${option.title}, ${option.quantityText}: ${option.subtotalText}`)
  const lineItems = exportLineItems.map(genericLineItem)
  const lineItemsArray = lineItems
  const xeroLineItemsArray = exportLineItems.map(makeXeroLineItem)
  for (const item of exportLineItems) {
    if (!item.itemCode) exportWarnings.push(`No imported item code found for "${item.description}".`)
    if (item.omittedItemCode) {
      exportWarnings.push(
        `Omitted ItemCode "${item.omittedItemCode}" for "${item.description}" because source "${item.itemCodeSource || "unknown"}" is not confirmed Xero inventory.`,
      )
    }
    if (!item.xeroAccountCode && !accountCodeFallback(item.category) && !defaultAccountCode()) exportWarnings.push(`No account code found for "${item.description}".`)
    if (!item.xeroTaxType && !defaultTaxType()) exportWarnings.push(`No tax type found for "${item.description}".`)
    if (item.quantityWasDefaulted) exportWarnings.push(`Quantity missing for "${item.description}". Defaulted Xero quantity to 1.`)
    if (item.unitAmountWasDefaulted) exportWarnings.push(`Price missing for "${item.description}". Defaulted Xero unit amount to 0.`)
  }

  return {
    provider: "xero",
    action: "create_draft_quote",
    contact: {
      name: contactName || "Not captured",
      ...(quote.customer_email ? { emailAddress: quote.customer_email } : {}),
      ...(contactAddress ? { address: contactAddress } : {}),
    },
    contactCollection: contactName
      ? [
          {
            Name: contactName,
            ...(quote.customer_email ? { EmailAddress: quote.customer_email } : {}),
            ...(contactAddress ? { Address: contactAddress } : {}),
          },
        ]
      : [],
    quote: {
      title: quote.quote_title || quote.primary_quote?.quote_title || quote.job_type || "Quote",
      reference: `Quotecord ${isoDate(now)}`,
      date: isoDate(now),
      expiryDate: isoDate(addDays(now, 30)),
      status: "DRAFT",
      lineItems,
      lineItemsArray,
      xeroLineItemsArray,
      exportWarnings,
      notes: [...scopeNotes(quote), ...upgradeNotes],
    },
    source: {
      app: "Quotecord",
      draftId: options.draftId ?? null,
    },
  }
}

export function xeroPayloadHasInternalDetails(payload: XeroQuotePayload) {
  const text = JSON.stringify(payload).toLowerCase()
  return /\b(formula|spacing source|confidence|supplier|stock|raw calculator|plant count formula|crew size|access allowance)\b/.test(text)
}

export type { QuoteOption }
