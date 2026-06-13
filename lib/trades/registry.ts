import type { QuoteFact } from "../core/quote-facts"
import type { ProcessedQuote } from "../processed-quote"
import { deckingQuoteFactsFromProcessedQuote } from "./decking/quote-facts"
import { retainingQuoteFactsFromProcessedQuote } from "./retaining/quote-facts"

export type TradeModuleId = "decking" | "retaining"

export type QuoteFactsContributor = {
  tradeId: TradeModuleId
  buildQuoteFacts: (quote: ProcessedQuote) => QuoteFact[]
}

export const quoteFactContributors: QuoteFactsContributor[] = [
  {
    tradeId: "decking",
    buildQuoteFacts: deckingQuoteFactsFromProcessedQuote,
  },
  {
    tradeId: "retaining",
    buildQuoteFacts: retainingQuoteFactsFromProcessedQuote,
  },
]

export function buildTradeQuoteFacts(quote: ProcessedQuote) {
  return quoteFactContributors.flatMap((contributor) => contributor.buildQuoteFacts(quote))
}
