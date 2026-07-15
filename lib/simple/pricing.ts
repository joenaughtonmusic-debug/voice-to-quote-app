import type {
  PricingSource,
  SimplePendingLine,
  SimplePricedLine,
  SimplePricing,
  SimpleQuote,
} from "./types"

export const DEFAULT_LABOUR_RATE = 80

function round2(value: number) {
  return Math.round(value * 100) / 100
}

/** GST portion of a GST-inclusive amount, rounded per line (NZ 15%: amount × 3/23). */
export function lineGst(amount: number) {
  return round2((amount * 3) / 23)
}

export function frequencyLabel(quote: Pick<SimpleQuote, "frequency" | "frequencyOther">) {
  if (quote.frequency === "other") return quote.frequencyOther.trim() || "Ongoing"
  if (quote.frequency === "monthly") return "Monthly"
  return quote.frequency
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-")
}

export function totalHours(quote: Pick<SimpleQuote, "statedTotalHours" | "tasks">): number | null {
  if (quote.statedTotalHours != null && quote.statedTotalHours > 0) return quote.statedTotalHours
  const taskHours = quote.tasks.map((task) => task.hours ?? 0).filter((hours) => hours > 0)
  if (taskHours.length === 0) return null
  return round2(taskHours.reduce((sum, hours) => sum + hours, 0))
}

function labourLineDescription(quote: SimpleQuote) {
  if (quote.jobType === "maintenance") {
    return `Garden maintenance visit (${frequencyLabel(quote).toLowerCase()})`
  }
  return "Labour — main scope"
}

/**
 * Labour / per-visit price. Priority (spoken-price-first, never a silent default):
 *   1. manual edit on the confirm screen (an informed override of everything below)
 *   2. spoken total ("maybe $300 with greenwaste" → $300)
 *   3. hours × spoken rate
 *   4. hours × DEFAULT_LABOUR_RATE — flagged rateWasDefaulted, rendered loud
 *   5. unpriced — no total is shown and export is blocked
 */
function resolveLabour(quote: SimpleQuote): {
  amount: number | null
  source: PricingSource
  rateWasDefaulted: boolean
  hoursUsed: number | null
  rateUsed: number | null
} {
  const hours = totalHours(quote)

  if (quote.manualTotal != null && quote.manualTotal > 0) {
    return { amount: quote.manualTotal, source: "manual", rateWasDefaulted: false, hoursUsed: hours, rateUsed: null }
  }
  if (quote.spokenTotal != null && quote.spokenTotal > 0) {
    return { amount: quote.spokenTotal, source: "spoken", rateWasDefaulted: false, hoursUsed: hours, rateUsed: null }
  }
  if (hours != null && quote.spokenRate != null && quote.spokenRate > 0) {
    return {
      amount: round2(hours * quote.spokenRate),
      source: "hours_x_spoken_rate",
      rateWasDefaulted: false,
      hoursUsed: hours,
      rateUsed: quote.spokenRate,
    }
  }
  if (hours != null) {
    return {
      amount: round2(hours * DEFAULT_LABOUR_RATE),
      source: "hours_x_default_rate",
      rateWasDefaulted: true,
      hoursUsed: hours,
      rateUsed: DEFAULT_LABOUR_RATE,
    }
  }
  return { amount: null, source: "unpriced", rateWasDefaulted: false, hoursUsed: null, rateUsed: null }
}

export function resolveSimplePricing(quote: SimpleQuote): SimplePricing {
  const labour = resolveLabour(quote)
  const lines: SimplePricedLine[] = []
  const pendingLines: SimplePendingLine[] = []

  if (labour.amount != null) {
    lines.push({ description: labourLineDescription(quote), amount: labour.amount, kind: "labour" })
  }

  if (quote.greenwaste.treatment === "separate_line") {
    if (quote.greenwaste.amount != null && quote.greenwaste.amount > 0) {
      lines.push({ description: "Removal of greenwaste", amount: quote.greenwaste.amount, kind: "greenwaste" })
    } else {
      pendingLines.push({ description: "Removal of greenwaste — price to confirm" })
    }
  }

  for (const extra of quote.extras) {
    const name = extra.name.trim()
    if (!name) continue
    if (extra.amount != null && extra.amount > 0) {
      lines.push({ description: name, amount: extra.amount, kind: "extra" })
    } else {
      pendingLines.push({ description: `${name} — price to confirm` })
    }
  }

  // Labour is the anchor: no total until it is priced.
  if (labour.amount == null) {
    return {
      labourAmount: null,
      pricingSource: labour.source,
      rateWasDefaulted: false,
      hoursUsed: labour.hoursUsed,
      rateUsed: labour.rateUsed,
      lines,
      pendingLines,
      total: null,
      gst: null,
    }
  }

  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0))
  const gst = round2(lines.reduce((sum, line) => sum + lineGst(line.amount), 0))

  return {
    labourAmount: labour.amount,
    pricingSource: labour.source,
    rateWasDefaulted: labour.rateWasDefaulted,
    hoursUsed: labour.hoursUsed,
    rateUsed: labour.rateUsed,
    lines,
    pendingLines,
    total,
    gst,
  }
}

export function formatNzd(value: number) {
  const hasCents = Math.round(value * 100) % 100 !== 0
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatNzd2(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function pricingSourceLabel(pricing: Pick<SimplePricing, "pricingSource" | "hoursUsed" | "rateUsed">) {
  switch (pricing.pricingSource) {
    case "manual":
      return "Manually entered"
    case "spoken":
      return "Spoken price"
    case "hours_x_spoken_rate":
      return `${pricing.hoursUsed}h × $${pricing.rateUsed}/hr (spoken rate)`
    case "hours_x_default_rate":
      return `${pricing.hoursUsed}h × $${pricing.rateUsed}/hr — DEFAULT RATE, check before sending`
    case "unpriced":
      return "Unpriced — add a price or hours before exporting"
  }
}
