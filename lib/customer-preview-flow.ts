import type { PricingFact } from "./core/pricing-extraction"
import { extractPricing } from "./core/pricing-extraction"
import type { CustomerPreviewQuote } from "./customer-quote-preview"
import type { ProcessedQuote } from "./processed-quote"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import type { SelectedQuoteTemplate } from "./template-renderer"

export type CustomerPreviewFlowInput = {
  processedQuote: ProcessedQuote
  rawTranscript?: string | null
  originalTranscript?: string | null
  selectedTemplate?: QuoteTemplateLibraryItem | null
  pricingFacts?: PricingFact[]
}

export function buildCustomerPreviewQuoteInput({
  processedQuote,
  rawTranscript,
  originalTranscript,
  selectedTemplate,
  pricingFacts,
}: CustomerPreviewFlowInput): CustomerPreviewQuote {
  const transcriptScope = customerScopeFromTranscript([rawTranscript, originalTranscript].filter(Boolean).join("\n"))
  const resolvedPricingFacts =
    pricingFacts ??
    extractPricing([rawTranscript, originalTranscript, quoteTextForPricing(processedQuote)].filter(Boolean).join("\n")).pricing

  return {
    ...processedQuote,
    customer_scope: uniqueLines([...(processedQuote.customer_scope ?? []), ...transcriptScope]),
    selected_template: selectedTemplateForPreview(selectedTemplate),
    pricing_facts: resolvedPricingFacts,
    // Carry the raw transcript so the deterministic tidy pricing facts (T1) fire identically on
    // the export payload as on the customer draft — keeping draft and Xero export in parity.
    raw_transcript: rawTranscript ?? originalTranscript ?? null,
  }
}

function customerScopeFromTranscript(text: string) {
  if (!text.trim()) return []

  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim().replace(/[.]+$/g, ""))
    .filter((sentence) =>
      /\b(each\s+visit\s+may\s+include|main\s+focus(?:\s+of\s+visits)?|general\s+garden\s+maintenance|ongoing\s+garden\s+maintenance|scheduled\s+visits?)\b/i.test(
        sentence,
      ),
    )
}

function uniqueLines(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const cleaned = value.trim()
    const key = cleaned.toLowerCase()
    if (!cleaned || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function selectedTemplateForPreview(template?: QuoteTemplateLibraryItem | null): SelectedQuoteTemplate | null {
  if (!template) return null

  return {
    name: template.name,
    template_name: template.template_name,
    category: template.category,
    job_type: template.job_type,
    trade: template.trade,
    template_content: template.template_content,
    default_scope: defaultScopeText(template.default_scope),
  }
}

function defaultScopeText(value: unknown) {
  const parts = stringParts(value)
  return parts.length > 0 ? parts.join("\n") : null
}

function stringParts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(stringParts)
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  if (!value || typeof value !== "object") return []
  return Object.values(value as Record<string, unknown>).flatMap(stringParts)
}

function quoteTextForPricing(quote: ProcessedQuote) {
  return [
    quote.quote_title,
    quote.job_type,
    quote.primary_quote?.quote_title,
    quote.primary_quote?.job_type,
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.customer_scope ?? []),
    ...(quote.materials ?? []),
    quote.greenwaste,
    ...(quote.exclusions ?? []),
    ...(quote.missing_information ?? []),
    ...(quote.confidence_warnings ?? []),
  ].join("\n")
}
