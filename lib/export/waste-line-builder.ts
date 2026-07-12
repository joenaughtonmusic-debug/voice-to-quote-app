import {
  greenwasteLineItem,
  numberFromValue,
  pricedAmountFromLineItem,
} from "./xero/helpers"
import type { XeroPayloadQuote } from "./xero/types"

export type ResolvedWastePrice = {
  amount: number | null
  pricingSource: "line_item_total" | "spoken_greenwaste" | "unpriced"
  quantity: number
  unitAmount: number | undefined
  unitAmountWasDefaulted: boolean
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

  const spoken = spokenGreenwasteAmount(quote)
  if (spoken !== null) {
    return {
      amount: spoken,
      pricingSource: "spoken_greenwaste",
      quantity: 1,
      unitAmount: spoken,
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
