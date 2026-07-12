import type { CustomerPreviewQuote, CustomerQuotePreview } from "../../customer-quote-preview"

export type XeroQuoteLineItem = {
  description: string
  quantity?: number
  unitAmount?: number
  accountCode?: string
}

export type MakeXeroQuoteLineItem = {
  Description: string
  Quantity: number
  UnitAmount: number
  ItemCode?: string
  AccountCode?: string
  TaxType: string
}

export type XeroExportLineItem = XeroQuoteLineItem & {
  category?: "labour" | "plants" | "materials" | "chemical" | "waste" | "unknown"
  xeroDescription?: string
  itemCode?: string
  itemCodeSource?: string
  omittedItemCode?: string
  xeroAccountCode?: string
  xeroTaxType?: string
  xeroQuantity?: number
  xeroUnitAmount?: number
  gstRate?: number | null
  quantityWasDefaulted?: boolean
  unitAmountWasDefaulted?: boolean
}

export type XeroPayloadQuote = CustomerPreviewQuote & {
  client_name?: string
  customer_email?: string | null
  site_address?: string
  quote_title?: string
  job_type?: string
  /** Raw site-visit transcript — the fixed source for deterministic tidy pricing facts (T1). */
  raw_transcript?: string | null
  labour_allowance?: string
  selected_template_name?: string
  customer_scope?: string[]
  primary_quote?: {
    quote_title?: string
    scope?: string[]
    notes?: string[]
  }
}

export type XeroRendererPreview = CustomerQuotePreview
