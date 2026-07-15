import { renderCustomerBody } from "./templates"
import { frequencyLabel, resolveSimplePricing } from "./pricing"
import type { SimpleQuote } from "./types"

/**
 * The Xero webhook contract, mirrored locally so lib/simple stays fully
 * decoupled from the multi-trade payload builder. Field names must match
 * XeroQuotePayload in lib/xero-quote-payload.ts — the webhook is the contract.
 */
export type SimpleXeroLineItem = {
  description: string
  quantity: number
  unitAmount: number
}

export type SimpleMakeXeroLineItem = {
  Description: string
  Quantity: number
  UnitAmount: number
  TaxType: string
}

export type SimpleXeroPayload = {
  provider: "xero"
  action: "create_draft_quote"
  contact: { name: string; address?: string }
  contactCollection: Array<{ Name: string; Address?: string }>
  quote: {
    title: string
    reference: string
    date: string
    expiryDate: string
    status: "DRAFT"
    lineItems: SimpleXeroLineItem[]
    lineItemsArray: SimpleXeroLineItem[]
    xeroLineItemsArray: SimpleMakeXeroLineItem[]
    exportWarnings: string[]
    notes: string[]
  }
  source: { app: "Talk to Quote"; draftId?: string | null }
}

const NZ_GST_TAX_TYPE = "OUTPUT2"

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Builds the Xero export payload directly from a confirmed Simple quote — the same
 * output shape the existing webhook expects, without routing through the multi-trade
 * payload builder. Line amounts are GST-inclusive and sum to the quoted total.
 * Throws when the quote is unpriced: an unpriced quote must never reach Xero.
 */
export function buildSimpleXeroPayload(
  quote: SimpleQuote,
  options: { draftId?: string | null; now?: Date } = {},
): SimpleXeroPayload {
  const pricing = resolveSimplePricing(quote)
  if (pricing.total == null) {
    throw new Error("Quote is unpriced — add a price or hours before exporting to Xero.")
  }

  const now = options.now ?? new Date()
  const contactName = quote.clientName.trim()
  const contactAddress = quote.siteAddress.trim()

  const exportWarnings: string[] = []
  if (pricing.rateWasDefaulted) {
    exportWarnings.push(
      `Labour priced at the default $${pricing.rateUsed}/hr (no spoken price or rate) — confirm before sending.`,
    )
  }
  for (const pending of pricing.pendingLines) {
    exportWarnings.push(`Unpriced line not exported: ${pending.description}`)
  }

  const lineItems: SimpleXeroLineItem[] = pricing.lines.map((line) => ({
    description: line.description,
    quantity: 1,
    unitAmount: line.amount,
  }))
  const xeroLineItemsArray: SimpleMakeXeroLineItem[] = pricing.lines.map((line) => ({
    Description: line.description,
    Quantity: 1,
    UnitAmount: line.amount,
    TaxType: NZ_GST_TAX_TYPE,
  }))

  const title =
    quote.jobType === "maintenance"
      ? `${frequencyLabel(quote)} Garden Maintenance`
      : "One-Off Garden Tidy"

  return {
    provider: "xero",
    action: "create_draft_quote",
    contact: {
      name: contactName || "Not captured",
      ...(contactAddress ? { address: contactAddress } : {}),
    },
    contactCollection: contactName
      ? [{ Name: contactName, ...(contactAddress ? { Address: contactAddress } : {}) }]
      : [],
    quote: {
      title,
      reference: `Talk to Quote ${isoDate(now)}`,
      date: isoDate(now),
      expiryDate: isoDate(addDays(now, 30)),
      status: "DRAFT",
      lineItems,
      lineItemsArray: lineItems,
      xeroLineItemsArray,
      exportWarnings,
      notes: renderCustomerBody(quote).split("\n\n"),
    },
    source: {
      app: "Talk to Quote",
      draftId: options.draftId ?? null,
    },
  }
}
