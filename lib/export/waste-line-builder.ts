import { extractTidyPricingFacts, type TidyPricingFacts } from "./tidy-pricing-facts"
import {
  greenwasteLineItem,
  numberFromValue,
  pricedAmountFromLineItem,
} from "./xero/helpers"
import type { XeroPayloadQuote } from "./xero/types"

/** Greenwaste business rule (T3): $26.50 per bag; 6 bags make one trailer load. */
export const GREENWASTE_PER_BAG = 26.5
export const BAGS_PER_TRAILER = 6

export type ResolvedWastePrice = {
  amount: number | null
  pricingSource: "line_item_total" | "spoken_greenwaste" | "computed_greenwaste" | "unpriced"
  quantity: number
  unitAmount: number | undefined
  unitAmountWasDefaulted: boolean
}

/**
 * Deterministic greenwaste total from a stated quantity (T3): bags × $26.50, or trailer loads ×
 * (6 × $26.50). Reads the fixed transcript facts, so it is stable run-to-run. Returns null when no
 * bag/trailer quantity was stated — an odd unit like "1.5 days" is deliberately NOT priced here
 * (it is flagged rather than guessed).
 */
export function greenwasteRulePrice(facts: TidyPricingFacts): number | null {
  // Only price a single, unambiguous quantity. Multiple stated quantities ("two trailer loads …
  // three quarters of a trailer load") are left as a qty display rather than part-priced.
  if (facts.greenwasteQuantityMentions > 1) return null
  if (facts.greenwasteBags != null && facts.greenwasteBags > 0) {
    return facts.greenwasteBags * GREENWASTE_PER_BAG
  }
  if (facts.greenwasteTrailers != null && facts.greenwasteTrailers > 0) {
    return facts.greenwasteTrailers * BAGS_PER_TRAILER * GREENWASTE_PER_BAG
  }
  return null
}

/**
 * Deterministic greenwaste total spoken in the greenwaste field — e.g.
 * "Estimated $130 of green waste" → $130 (spoken price wins). Reads ONLY the greenwaste
 * field, so a dump/tip rate spoken elsewhere ("$5 of dump rate") is never mistaken for the
 * greenwaste price. Returns null when the field carries no dollar figure (e.g. "1.5 days"),
 * so that case stays unpriced and flagged rather than guessed.
 */
export function spokenGreenwasteAmount(quote: Pick<XeroPayloadQuote, "greenwaste">): number | null {
  const text = quote.greenwaste?.trim()
  if (!text) return null
  const match = text.match(/\$\s?(\d[\d,]*(?:\.\d+)?)/)
  if (!match) return null
  const amount = Number((match[1] ?? "").replace(/,/g, ""))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function resolveGreenwasteExportPrice(quote: XeroPayloadQuote): ResolvedWastePrice {
  const facts = extractTidyPricingFacts(quote.raw_transcript)

  // 1. Spoken greenwaste total in the raw transcript ("$130 of green waste") — deterministic,
  //    spoken price wins. T1.
  if (typeof facts.spokenGreenwasteTotal === "number" && facts.spokenGreenwasteTotal > 0) {
    return {
      amount: facts.spokenGreenwasteTotal,
      pricingSource: "spoken_greenwaste",
      quantity: 1,
      unitAmount: facts.spokenGreenwasteTotal,
      unitAmountWasDefaulted: false,
    }
  }

  // 2. Spoken greenwaste total in the greenwaste field (secondary spoken source).
  const spokenField = spokenGreenwasteAmount(quote)
  if (spokenField !== null) {
    return {
      amount: spokenField,
      pricingSource: "spoken_greenwaste",
      quantity: 1,
      unitAmount: spokenField,
      unitAmountWasDefaulted: false,
    }
  }

  // 3. Business rule from a stated bag/trailer quantity — deterministic. T3.
  const ruleAmount = greenwasteRulePrice(facts)
  if (ruleAmount !== null && ruleAmount > 0) {
    return {
      amount: ruleAmount,
      pricingSource: "computed_greenwaste",
      quantity: 1,
      unitAmount: ruleAmount,
      unitAmountWasDefaulted: false,
    }
  }

  // 4. An odd/ambiguous unit ("1.5 days of green waste") is flagged, not guessed — stay unpriced
  //    and do NOT fall through to a line-item total (which can misread "1.5 days" as $1.50).
  if (facts.greenwasteOddUnit) {
    return {
      amount: null,
      pricingSource: "unpriced",
      quantity: 1,
      unitAmount: undefined,
      unitAmountWasDefaulted: true,
    }
  }

  const wasteItem = greenwasteLineItem(quote)
  const amount = pricedAmountFromLineItem(wasteItem)

  if (typeof amount === "number" && Number.isFinite(amount)) {
    return {
      amount,
      pricingSource: "line_item_total",
      quantity: 1,
      unitAmount: amount,
      unitAmountWasDefaulted: false,
    }
  }

  return {
    amount: null,
    pricingSource: "unpriced",
    quantity: 1,
    unitAmount: undefined,
    unitAmountWasDefaulted: true,
  }
}

export function pristineGreenwasteDescription(item: XeroPayloadQuote["line_items"][number]) {
  const text = [item.description, item.item_name].filter(Boolean).join(" ").trim()
  if (/\btip fee\b/i.test(text)) return text
  return null
}

export function greenwasteDescriptionFromAssembly(
  greenWasteItems: string[],
  quote: Pick<XeroPayloadQuote, "greenwaste">,
  wasteItem: XeroPayloadQuote["line_items"][number] | null | undefined,
) {
  const pristine = wasteItem ? pristineGreenwasteDescription(wasteItem) : null
  if (pristine) return pristine

  if (greenWasteItems.length > 0) {
    return `Greenwaste removal — ${greenWasteItems.join("; ")}`
  }

  const fallback = quote.greenwaste?.trim()
  if (fallback) {
    return /^greenwaste\b/i.test(fallback) ? fallback : `Greenwaste removal — ${fallback}`
  }

  return "Greenwaste removal"
}

export function wasteQuantityLabelFromLineItem(item: XeroPayloadQuote["line_items"][number] | null | undefined) {
  if (!item) return null
  return numberFromValue(item.quantity)
}
