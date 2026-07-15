// ---------------------------------------------------------------------------
// Cost -> sell markup rule (L0b).
//
// Deterministic: same cost in -> same sell out, every run. All arithmetic is
// done in integer cents so 19.90 x 1.25 rounds to 24.88 (naive float lands at
// 24.874999... and would truncate to 24.87). No AI, no Date, no randomness.
//
// Pricing priority (see CLAUDE.md): an explicit/manual/spoken sell price always
// wins over a computed one; a per-line markup wins over the default rule; the
// tiered default fills the gap; if there is no cost and no sell, we DO NOT
// invent a number — we flag it "unpriced" for review.
// ---------------------------------------------------------------------------

export type MarkupTier = {
  /** Applies when cost < underCost. Use null for the final open-ended tier. */
  underCost: number | null
  multiplier: number
  label: string
}

/**
 * Default landscaping / plant markup, keyed on COST:
 *   cost under $90  -> x1.25
 *   cost $90 or over -> x1.15
 * A default the user can override per line (explicit sell or per-line markup).
 */
export const DEFAULT_COST_MARKUP_TIERS: MarkupTier[] = [
  { underCost: 90, multiplier: 1.25, label: "cost <$90 x1.25" },
  { underCost: null, multiplier: 1.15, label: "cost >=$90 x1.15" },
]

export type SellPriceSource =
  | "explicit_sell" // a sell price was supplied directly (spoken / manual / list) — wins
  | "line_markup" // a per-line markup multiplier was supplied (e.g. a "Mark up" column)
  | "tiered_default" // computed from the default tiered rule
  | "unpriced" // no cost and no sell — cannot compute, flag for review

export type SellPriceResolution = {
  sell_price: number | null
  source: SellPriceSource
  /** The multiplier actually applied to cost (null for explicit/unpriced). */
  multiplier: number | null
  /** Human-readable rule that fired, for the review/audit trail. */
  rule_label: string | null
  warning?: string
}

/** Round a dollar amount to whole cents, half-up, robust to float noise near .5. */
function roundToCents(dollars: number): number {
  return Math.round(dollars * 100 + 1e-9) / 100
}

/** Apply a multiplier to a cost using integer-cent arithmetic. */
function applyMultiplier(cost: number, multiplier: number): number {
  const costCents = Math.round(cost * 100)
  const sellCents = Math.round(costCents * multiplier + 1e-9)
  return sellCents / 100
}

function isUsableNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** The tier that applies to a given cost. */
export function tierForCost(cost: number, tiers: MarkupTier[] = DEFAULT_COST_MARKUP_TIERS): MarkupTier {
  return tiers.find((tier) => tier.underCost === null || cost < tier.underCost) ?? tiers[tiers.length - 1]
}

/**
 * Resolve a sell price from a cost + optional per-line overrides.
 *
 * @param cost_price      supplier / nursery cost (e.g. Botanic "Price")
 * @param sell_price      an explicit sell price, if the list/user supplied one — always wins
 * @param line_multiplier a per-line markup multiplier (e.g. 1.4 from a "Mark up" column) — beats the default
 * @param tiers           the default tiered rule (defaults to DEFAULT_COST_MARKUP_TIERS)
 */
export function resolveSellFromCost(input: {
  cost_price?: number | null
  sell_price?: number | null
  line_multiplier?: number | null
  tiers?: MarkupTier[]
}): SellPriceResolution {
  const { cost_price, sell_price, line_multiplier, tiers = DEFAULT_COST_MARKUP_TIERS } = input

  // 1. An explicit sell price always wins — never silently overwrite it.
  if (isUsableNumber(sell_price)) {
    return { sell_price: roundToCents(sell_price), source: "explicit_sell", multiplier: null, rule_label: "explicit sell price" }
  }

  // 2. No cost -> cannot compute. Flag, do not invent.
  if (!isUsableNumber(cost_price)) {
    return {
      sell_price: null,
      source: "unpriced",
      multiplier: null,
      rule_label: null,
      warning: "No cost or sell price — sell price cannot be computed, needs review.",
    }
  }

  // 3. A per-line markup multiplier beats the default tiered rule.
  if (isUsableNumber(line_multiplier) && line_multiplier > 0) {
    return {
      sell_price: applyMultiplier(cost_price, line_multiplier),
      source: "line_markup",
      multiplier: line_multiplier,
      rule_label: `per-line x${line_multiplier}`,
    }
  }

  // 4. Default tiered rule, keyed on cost.
  const tier = tierForCost(cost_price, tiers)
  return {
    sell_price: applyMultiplier(cost_price, tier.multiplier),
    source: "tiered_default",
    multiplier: tier.multiplier,
    rule_label: tier.label,
  }
}
