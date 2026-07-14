// ---------------------------------------------------------------------------
// Landscaping quote assembly (L5 — the finale).
//
// Takes the confirmed chunks from the builder and assembles a full quote:
// priced lines, subtotal, GST-INCLUSIVE total, in three views (customer / team /
// internal) plus Xero export lines whose total matches the customer total.
//
// GST rule mirrors the gardening build exactly (garden-tidy.ts computeTidyTotals):
// line amounts are GST-INCLUSIVE; the GST line is the SUM of each line's portion
// (amount × 3/23, rounded per line) — matching Xero and Joe's real quotes.
// Verified there on [720, 72.88, 6] -> 798.88 / 104.20 and [440, 39.75] ->
// 479.75 / 62.57; the same numbers are re-asserted in this module's test.
//
// Deterministic: same input -> same quote. Never invents a price — unpriced lines
// are surfaced and excluded from the total, not guessed. Gardening is untouched.
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** GST portion of a GST-INCLUSIVE amount (NZ 15%): amount × 3/23, rounded to cents. */
function lineGst(inclusiveAmount: number): number {
  return round2((inclusiveAmount * 3) / 23)
}

/** Totals for a set of GST-INCLUSIVE line amounts (per-line GST rounding, Xero parity). */
export function computeInclusiveTotals(inclusiveAmounts: number[]): { total: number; gst: number; subtotal: number } {
  const total = round2(inclusiveAmounts.reduce((sum, a) => sum + a, 0))
  const gst = round2(inclusiveAmounts.reduce((sum, a) => sum + lineGst(a), 0))
  return { total, gst, subtotal: round2(total - gst) }
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

// --- Input (a serialisable view of the builder's confirmed chunks) ----------

export type AssemblyLineInput = {
  description: string
  qty?: number | null
  unit?: string | null
  unit_price?: number | null // GST-inclusive
  price_source?: string | null
  matched_name?: string | null
  cost_price?: number | null
  spacing_rule?: string | null
  count_formula?: string | null
  confirmed?: boolean
  needs_confirm?: boolean
  account_code?: string | null
  tax_type?: string | null
}

export type AssemblyChunkInput = {
  title: string
  work_type: string
  source_text?: string
  approved?: boolean
  lines: AssemblyLineInput[]
}

export type LandscapingQuoteInput = {
  customer_name?: string
  site_address?: string
  quote_title?: string
  chunks: AssemblyChunkInput[]
}

// --- Output -----------------------------------------------------------------

export type XeroLine = {
  description: string
  quantity: number
  unitAmount: number // GST-inclusive
  lineAmount: number // round2(quantity × unitAmount)
  accountCode?: string
  taxType: string
}

export type AssembledQuote = {
  title: string
  customer_name: string
  site_address: string
  totals: { subtotal: number; gst: number; total: number }
  customer: { sections: { title: string; lines: string[] }[]; totals_lines: string[] }
  team: { sections: { title: string; items: string[] }[] }
  internal: { sections: { title: string; lines: string[] }[]; flags: string[] }
  xero: { lines: XeroLine[]; total: number }
  review_flags: string[]
}

const DEFAULT_TAX_TYPE = "OUTPUT2" // NZ GST on income (15%)

function qtyOf(line: AssemblyLineInput): { qty: number; assumed: boolean } {
  if (typeof line.qty === "number" && Number.isFinite(line.qty) && line.qty > 0) return { qty: line.qty, assumed: false }
  return { qty: 1, assumed: true }
}

function unitLabel(line: AssemblyLineInput): string {
  return line.unit ? ` ${line.unit}` : ""
}

export function assembleLandscapingQuote(input: LandscapingQuoteInput): AssembledQuote {
  const title = input.quote_title?.trim() || "Landscaping Quote"
  const customer_name = input.customer_name?.trim() || ""
  const site_address = input.site_address?.trim() || ""

  const approvedChunks = input.chunks.filter((chunk) => chunk.approved)
  const skippedChunks = input.chunks.filter((chunk) => !chunk.approved)

  const review_flags: string[] = []
  for (const chunk of skippedChunks) {
    review_flags.push(`Section "${chunk.title}" is not approved — excluded from the quote.`)
  }

  const customerSections: { title: string; lines: string[] }[] = []
  const teamSections: { title: string; items: string[] }[] = []
  const internalSections: { title: string; lines: string[] }[] = []
  const internalFlags: string[] = []
  const xeroLines: XeroLine[] = []
  const inclusiveAmounts: number[] = []

  for (const chunk of approvedChunks) {
    const customerLines: string[] = []
    const internalLines: string[] = []
    const teamItems: string[] = []
    if (chunk.source_text?.trim()) teamItems.push(chunk.source_text.trim())

    for (const line of chunk.lines) {
      const desc = line.description.trim()
      if (!desc) continue
      const { qty, assumed } = qtyOf(line)
      const priced = typeof line.unit_price === "number" && Number.isFinite(line.unit_price)

      // Team view: what + how much, no prices.
      teamItems.push(`${desc}${qty !== 1 || line.unit ? ` — ${qty}${unitLabel(line)}` : ""}`)

      if (!priced) {
        customerLines.push(`${desc} — price to be confirmed`)
        internalLines.push(`${desc} — UNPRICED (${line.price_source ?? "no match"})`)
        review_flags.push(`"${desc}" has no price — set one before sending.`)
        continue
      }

      const unit = line.unit_price as number
      const lineAmount = round2(qty * unit)
      inclusiveAmounts.push(lineAmount)

      // Customer line.
      customerLines.push(`${desc} — ${qty}${unitLabel(line)} × ${money(unit)} = ${money(lineAmount)}`)

      // Internal line (cost / source / matched row / assumptions).
      const bits: string[] = [`${qty}${unitLabel(line)} × ${money(unit)} = ${money(lineAmount)}`]
      if (line.price_source) bits.push(`price: ${line.price_source}`)
      if (line.matched_name) bits.push(`matched: ${line.matched_name}`)
      if (typeof line.cost_price === "number") bits.push(`cost: ${money(line.cost_price)}`)
      if (line.spacing_rule) bits.push(`spacing: ${line.spacing_rule}`)
      if (line.count_formula) bits.push(line.count_formula)
      internalLines.push(`${desc} — ${bits.join(" · ")}`)

      if (assumed) review_flags.push(`"${desc}" quantity assumed to be 1 — confirm.`)
      if (line.needs_confirm && !line.confirmed) review_flags.push(`Price for "${desc}" needs confirming.`)

      // Xero line — same GST-inclusive amount so totals match the customer copy.
      xeroLines.push({
        description: desc,
        quantity: qty,
        unitAmount: unit,
        lineAmount,
        accountCode: line.account_code ?? undefined,
        taxType: line.tax_type ?? DEFAULT_TAX_TYPE,
      })
    }

    if (customerLines.length) customerSections.push({ title: chunk.title, lines: customerLines })
    if (internalLines.length) internalSections.push({ title: `${chunk.title} (${chunk.work_type})`, lines: internalLines })
    if (teamItems.length) teamSections.push({ title: `${chunk.title} (${chunk.work_type})`, items: teamItems })
  }

  const totals = computeInclusiveTotals(inclusiveAmounts)
  const xeroTotal = round2(xeroLines.reduce((sum, l) => sum + l.lineAmount, 0))

  const totals_lines = [
    `Subtotal (excl GST): ${money(totals.subtotal)}`,
    `GST (15%): ${money(totals.gst)}`,
    `Total (incl GST): ${money(totals.total)}`,
  ]

  internalFlags.push(...review_flags)
  if (xeroTotal !== totals.total) {
    internalFlags.push(`Xero total ${money(xeroTotal)} does not match customer total ${money(totals.total)}.`)
  }

  return {
    title,
    customer_name,
    site_address,
    totals,
    customer: { sections: customerSections, totals_lines },
    team: { sections: teamSections },
    internal: { sections: internalSections, flags: internalFlags },
    xero: { lines: xeroLines, total: xeroTotal },
    review_flags,
  }
}
