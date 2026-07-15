import type { QuoteOption, QuoteOptionLineItem } from "../quote-options"
import type { QuotePlan } from "./types"

/**
 * Builds priceable optional works from a QuotePlan's optional buckets that carry
 * labour (QuotePlan Slice 3a). Pure and deterministic — no OpenAI, no mutation.
 *
 * Reuses the existing QuoteOption type (category "labour"), but the caller stores
 * the result on the NEW ProcessedQuote.optional_priced_works field, never on
 * quote_options — so customer preview, the customer options card, and Xero export
 * (which read quote_options) do not pick it up in this slice.
 *
 * Pricing reuses the rate the pipeline already resolved for main-labour recovery.
 * When no rate is available the subtotal is 0 and a warning is attached — a rate is
 * never fabricated.
 */
export function buildOptionalPricedWorks(plan: QuotePlan, rate: string | null): QuoteOption[] {
  const parsedRate = rate == null ? null : Number(String(rate).replace(/[$,]/g, ""))
  const usableRate = parsedRate != null && Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null

  const options: QuoteOption[] = []

  for (const bucket of plan.optional) {
    for (const [index, labour] of bucket.labour.entries()) {
      if (labour.hours == null || labour.hours <= 0) continue

      const total = usableRate != null ? labour.hours * usableRate : 0
      const lineItem: QuoteOptionLineItem = {
        itemName: "Labour",
        quantity: labour.hours,
        unit: "hours",
        unitPrice: usableRate ?? 0,
        total,
      }

      options.push({
        id: `optional-${bucket.id}-labour-${index + 1}`,
        label: bucket.title,
        title: `Optional labour — ${bucket.title}`,
        category: "labour",
        source: "ai_extraction",
        lineItems: [lineItem],
        subtotal: total,
        warnings: usableRate == null ? ["Rate missing — price optional labour before sending."] : [],
      })
    }
  }

  return options
}
