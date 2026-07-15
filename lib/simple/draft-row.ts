import { resolveSimplePricing } from "./pricing"
import { renderCustomerBody, simpleQuoteTitle } from "./templates"
import type { SimpleQuote } from "./types"

/**
 * Simple Mode drafts persist to the same Supabase `quote_drafts` table the legacy
 * flow uses, so they appear in the existing Drafts tab. The full SimpleQuote state
 * rides in `quote_options` under SIMPLE_DRAFT_MARKER; the other columns are filled
 * with readable values for the list view. On open, the marker routes the draft back
 * into Simple Mode instead of the legacy review flow.
 */
export const SIMPLE_DRAFT_MARKER = "simple_quote_v1"

export function toSimpleDraftFields(quote: SimpleQuote, userId: string) {
  const pricing = resolveSimplePricing(quote)
  return {
    user_id: userId,
    client_name: quote.clientName.trim() || null,
    site_address: quote.siteAddress.trim() || null,
    quote_title: simpleQuoteTitle(quote),
    job_type: quote.jobType === "maintenance" ? "Maintenance (Simple)" : "One-off tidy (Simple)",
    raw_transcript: quote.rawTranscript,
    quote_sections: [{ title: "Customer quote", items: renderCustomerBody(quote).split("\n\n") }],
    line_items: pricing.lines.map((line) => ({
      description: line.description,
      quantity: 1,
      rate: line.amount,
      total: line.amount,
    })),
    quote_options: { [SIMPLE_DRAFT_MARKER]: quote },
    status: "Needs Review",
  }
}

/** Returns the stored SimpleQuote when the draft row is a Simple Mode draft, else null. */
export function simpleQuoteFromDraft(row: { quote_options?: unknown } | null | undefined): SimpleQuote | null {
  const options = row?.quote_options
  if (!options || typeof options !== "object" || Array.isArray(options)) return null
  const candidate = (options as Record<string, unknown>)[SIMPLE_DRAFT_MARKER]
  if (!candidate || typeof candidate !== "object") return null
  const quote = candidate as SimpleQuote
  if (quote.jobType !== "maintenance" && quote.jobType !== "tidy") return null
  if (!Array.isArray(quote.tasks) || !Array.isArray(quote.extras) || !Array.isArray(quote.internalNotes)) return null
  if (!quote.greenwaste || typeof quote.greenwaste !== "object") return null
  return quote
}
