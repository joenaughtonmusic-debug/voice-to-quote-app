import type { ProcessedQuote } from "../../processed-quote"
import { resolveBillsToQuoteOptions } from "../../items/resolve-bill"
import type { ResolvableItem } from "../../items/resolve-bill"
import { calculateRetaining } from "./calculator"
import { detectRetainingFromText } from "./detector"
import { retainingResultToBills } from "./to-bill"

/**
 * Detects retaining intent from the transcript, runs the retaining calculator,
 * resolves material items from the knowledge library, and appends the
 * resulting QuoteOptions to quote.quote_options.
 *
 * Safe to call on any transcript: if no retaining intent is detected, or if
 * the calculator produces no measurable sections, the quote is not modified.
 * Existing quote_options (e.g. planting or decking options) are always preserved.
 */
export function applyRetainingBillOptions(
  quote: ProcessedQuote,
  transcript: string,
  knowledgeItems: ResolvableItem[],
): void {
  const { is_retaining, request } = detectRetainingFromText(transcript)
  if (!is_retaining) return

  const result = calculateRetaining(request)
  const bills = retainingResultToBills(result)
  if (bills.length === 0) return

  const options = resolveBillsToQuoteOptions(bills, knowledgeItems)
  quote.quote_options = [...(quote.quote_options ?? []), ...options]
}
