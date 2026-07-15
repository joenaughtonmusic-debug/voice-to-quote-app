/**
 * The maintenance greenwaste charge shown as its OWN line, or null when it folds into the visit
 * price (M3/M5). Shared by the customer assembler and the Xero renderer so both agree on whether a
 * separate greenwaste line exists and at what amount — the key to draft ↔ Xero parity (M5).
 *
 * Greenwaste is a separate line only when it has its own price signal — a spoken greenwaste total
 * (Nadia $26.50) or a bag/trailer quantity priced by the reused tidy rule ($26.50/bag). When spoken
 * as included, or merely mentioned with no price of its own, it is covered by the visit price.
 */

import { extractMaintenancePricingFacts } from "./maintenance-pricing-facts"
import { extractTidyPricingFacts } from "./tidy-pricing-facts"
import { greenwasteRulePrice } from "./waste-line-builder"

export type ResolvedMaintenanceGreenwaste = {
  amount: number | null
  range: { low: number; high: number } | null
}

export function resolveMaintenanceGreenwaste(transcript?: string | null): ResolvedMaintenanceGreenwaste {
  const facts = extractMaintenancePricingFacts(transcript)
  if (facts.greenwasteIncluded) return { amount: null, range: null }

  const amount = facts.spokenGreenwasteTotal ?? greenwasteRulePrice(extractTidyPricingFacts(transcript ?? ""))
  return { amount: amount != null && amount > 0 ? amount : null, range: facts.greenwasteRange }
}
