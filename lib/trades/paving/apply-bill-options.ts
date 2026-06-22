import type { ProcessedQuote } from "../../processed-quote"
import { resolveBillsToQuoteOptions } from "../../items/resolve-bill"
import type { ResolvableItem } from "../../items/resolve-bill"
import { calculatePaving } from "./calculator"
import { detectPavingFromText } from "./detector"
import { pavingResultToBills } from "./to-bill"

/**
 * Detects paving intent from the transcript, runs the paving calculator,
 * resolves material items from the knowledge library, and appends the
 * resulting QuoteOptions to quote.quote_options.
 *
 * Safe to call on any transcript: if no paving intent is detected, or if
 * the calculator produces no measurable areas, the quote is not modified.
 * Existing quote_options (e.g. planting, decking, or retaining options) are
 * always preserved.
 */
export function applyPavingBillOptions(
  quote: ProcessedQuote,
  transcript: string,
  knowledgeItems: ResolvableItem[],
): void {
  const { is_paving, request } = detectPavingFromText(transcript)
  if (!is_paving) return

  const result = calculatePaving(request)
  const bills = pavingResultToBills(result)
  if (bills.length === 0) return

  const options = resolveBillsToQuoteOptions(bills, knowledgeItems)
  quote.quote_options = [...(quote.quote_options ?? []), ...options]
}
