import type { ProcessedQuote } from "../../processed-quote"
import { resolveBillsToQuoteOptions } from "../../items/resolve-bill"
import type { ResolvableItem } from "../../items/resolve-bill"
import { calculateDecking } from "./calculator"
import { detectDeckingFromText } from "./detector"
import { deckingResultToBills } from "./to-bill"

/**
 * Detects decking intent from the transcript, runs the decking calculator,
 * resolves material items from the knowledge library, and appends the
 * resulting QuoteOptions to quote.quote_options.
 *
 * Safe to call on any transcript: if no decking intent is detected, or if
 * the calculator produces no measurable areas, the quote is not modified.
 * Existing quote_options (e.g. planting options) are always preserved.
 */
export function applyDeckingBillOptions(
  quote: ProcessedQuote,
  transcript: string,
  knowledgeItems: ResolvableItem[],
): void {
  const { is_decking, request } = detectDeckingFromText(transcript)
  if (!is_decking) return

  const result = calculateDecking(request)
  const bills = deckingResultToBills(result)
  if (bills.length === 0) return

  const options = resolveBillsToQuoteOptions(bills, knowledgeItems)
  quote.quote_options = [...(quote.quote_options ?? []), ...options]
}
