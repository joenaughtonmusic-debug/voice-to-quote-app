import type { TidyPricingFacts } from "./tidy-pricing-facts"

/**
 * Priced tidy extras / consumables (T4).
 *
 * A small, extensible price list for one-off tidy consumables. The garden-tidy facts layer (T1)
 * captures which extras were mentioned (`facts.extras`); this module resolves each to a price:
 *   1. a $ spoken next to that extra in the transcript wins (spoken price priority),
 *   2. otherwise the price list,
 *   3. otherwise the extra stays flagged (amount null) — never guessed, never dropped.
 *
 * To add a new priced extra, add a row here. `key` must match the canonical name the T1 parser
 * produces; `trigger` locates the extra in the transcript so a spoken $ can be tied to it.
 */
export type TidyExtraPriceEntry = { key: string; price: number; trigger: RegExp }

export const TIDY_EXTRAS_PRICE_LIST: ReadonlyArray<TidyExtraPriceEntry> = [
  { key: "Weedkiller - extra strength", price: 6, trigger: /extra[-\s]?strength\s+weed\s?killer/i },
]

export type ResolvedTidyExtra = { name: string; amount: number | null }

/** A $ amount stated right beside the extra in the transcript ("extra-strength weedkiller for $6"). */
function spokenExtraPrice(transcript: string, trigger: RegExp): number | null {
  const m = transcript.match(trigger)
  if (!m || m.index == null) return null
  const start = Math.max(0, m.index - 20)
  const window = transcript.slice(start, m.index + m[0].length + 20)
  const dollar = window.match(/\$\s?(\d[\d,]*(?:\.\d+)?)/)
  if (!dollar) return null
  const amount = Number((dollar[1] ?? "").replace(/,/g, ""))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function resolveTidyExtras(facts: TidyPricingFacts, transcript?: string | null): ResolvedTidyExtra[] {
  const text = transcript ?? ""
  return facts.extras.map((extra) => {
    const entry = TIDY_EXTRAS_PRICE_LIST.find((e) => e.key === extra.name)
    const spoken = entry ? spokenExtraPrice(text, entry.trigger) : null
    const amount = spoken ?? entry?.price ?? null
    return { name: extra.name, amount }
  })
}
