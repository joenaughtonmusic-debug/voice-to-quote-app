export type PricingFactType = "fixed_price" | "price_range" | "optional_extra" | "allowance"
export type PricingCadence =
  | "per_visit"
  | "monthly"
  | "per_month"
  | "per_week"
  | "six_weekly"
  | "two_monthly"
  | "three_monthly"
  | "four_monthly"
export type PricingConfidence = "high" | "medium" | "low"

export type PricingFact = {
  id: string
  type: PricingFactType
  amount?: number | null
  amount_min?: number | null
  amount_max?: number | null
  currency: "NZD"
  cadence?: PricingCadence | null
  label?: string | null
  inclusions: string[]
  source_text: string
  confidence: PricingConfidence
  metadata?: Record<string, string | number | boolean | null>
}

export type PricingExtractionResult = {
  pricing: PricingFact[]
  source_text: string
}
