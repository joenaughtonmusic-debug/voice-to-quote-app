import type { ReviewNotice } from "../review-notices/types"
import type { PricingFact } from "./types"

export type PricingReviewLineItem = {
  item_name?: string | null
  item_type?: string | null
  description?: string | null
  total?: string | number | null
}

export function buildPricingReviewNotices({
  pricing,
  lineItems,
}: {
  pricing: PricingFact[]
  lineItems: PricingReviewLineItem[]
}): ReviewNotice[] {
  const spokenPrice = pricing.find((fact) => fact.type === "fixed_price" && typeof fact.amount === "number")
  if (!spokenPrice?.amount) return []

  const labourTotal = largestLabourTotal(lineItems)
  if (labourTotal === null || Math.abs(labourTotal - spokenPrice.amount) < 0.01) return []

  return [
    {
      id: "pricing.spoken-price-mismatch",
      message: `Spoken price is ${money(spokenPrice.amount)}${cadenceText(spokenPrice.cadence)}, but matched labour total is ${money(labourTotal)}. Review pricing before sending.`,
      severity: "warning",
      source: "core",
      category: "pricing",
      metadata: {
        spoken_amount: spokenPrice.amount,
        labour_total: labourTotal,
        cadence: spokenPrice.cadence ?? null,
      },
    },
  ]
}

function largestLabourTotal(lineItems: PricingReviewLineItem[]) {
  const totals = lineItems
    .filter((item) => /\blabou?r\b/i.test([item.item_name, item.item_type, item.description].filter(Boolean).join(" ")))
    .map((item) => numberFromValue(item.total))
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)

  return totals[0] ?? null
}

function numberFromValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (!value) return null
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function cadenceText(cadence: PricingFact["cadence"]) {
  if (cadence === "per_visit") return " per visit"
  if (cadence === "per_month") return " per month"
  if (cadence === "per_week") return " per week"
  if (cadence === "monthly") return " monthly"
  return ""
}
