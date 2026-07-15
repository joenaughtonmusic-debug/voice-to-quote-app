/**
 * Deterministic per-visit price resolver for ongoing maintenance (M2 — the anchor line).
 *
 * Reuses the tidy labour engine (`dayRateLabourPrice`: full day = 7.5h, hourly rate PER PERSON) to
 * compute a per-visit price from the transcript's hours × people × rate. A spoken per-visit total
 * (parsed deterministically in M1) always wins — Joe adjusts the computed rule number by feel, so
 * the figure is graded on correct computation + being editable, not on matching a hand-tuned total.
 *
 * Priority (per the pricing-source priority in the product spec):
 *   1. Spoken per-visit price — "$285 per visit" (deterministic, stable run-to-run).
 *   2. Computed rule number — hours × people × rate via the shared tidy labour engine.
 *   3. Unpriced — no spoken total and no rate + duration to compute from; flagged, never guessed.
 */

import { dayRateLabourPrice, type ResolvedLabourPrice } from "./labour-line-builder"
import type { MaintenancePricingFacts } from "./maintenance-pricing-facts"
import { extractTidyPricingFacts } from "./tidy-pricing-facts"

export type MaintenanceVisitPriceSource = "spoken_per_visit" | "computed_day_rate" | "unpriced"

export type ResolvedMaintenanceVisitPrice = {
  /** Per-visit price in NZD (GST-inclusive), 0 when unpriced. */
  amount: number
  pricingSource: MaintenanceVisitPriceSource
  /** Present only for the computed path — the hours/people/rate workings, for the internal view. */
  workings?: ResolvedLabourPrice["allowanceWorkings"]
}

export function resolveMaintenanceVisitPrice(
  facts: MaintenancePricingFacts,
  transcript?: string | null,
): ResolvedMaintenanceVisitPrice {
  // 1. Spoken per-visit total wins — parsed deterministically from the transcript (M1).
  if (typeof facts.spokenPerVisitPrice === "number" && facts.spokenPerVisitPrice > 0) {
    return { amount: facts.spokenPerVisitPrice, pricingSource: "spoken_per_visit" }
  }

  // 2. Computed rule number from the shared tidy labour engine. Reads the full tidy facts (which
  //    carry labourDays / labourHoursAreTotal that dayRateLabourPrice needs) rather than the trimmed
  //    maintenance facts. Requires BOTH a rate and a duration, so a bare "4.5 hours" with no rate
  //    stays unpriced and is flagged rather than guessed.
  const computed = dayRateLabourPrice(extractTidyPricingFacts(transcript ?? ""))
  if (computed && computed.amount > 0) {
    return { amount: computed.amount, pricingSource: "computed_day_rate", workings: computed.allowanceWorkings }
  }

  // 3. Unpriced — flagged for review, never silently substituted.
  return { amount: 0, pricingSource: "unpriced" }
}
