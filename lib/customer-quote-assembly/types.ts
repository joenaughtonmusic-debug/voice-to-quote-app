import type { PricingFact } from "../core/pricing-extraction"
import type { ProcessedQuote } from "../processed-quote"
import type { SelectedQuoteTemplate } from "../template-renderer"

export type CustomerQuoteAssemblySection = {
  title: string
  items: string[]
}

export type CustomerQuoteAssembly = {
  title: string
  customer_name: string
  site_address: string
  sections: CustomerQuoteAssemblySection[]
}

export type CustomerQuoteAssemblyInput = {
  quote: ProcessedQuote
  rawTranscript?: string | null
  pricingFacts?: PricingFact[]
  selectedTemplate?: SelectedQuoteTemplate | null
}
