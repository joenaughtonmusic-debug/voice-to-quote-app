import { formatNzd, formatNzd2, frequencyLabel, pricingSourceLabel } from "./pricing"
import type { SimplePricing, SimpleQuote } from "./types"

/**
 * Fixed customer templates. The body wording is constant — Joe's real sent-quote
 * wording — and only the slots (frequency, address, focus tasks, greenwaste
 * treatment) vary. Customer text never shows hours, rates, or internal notes.
 */

const MAINTENANCE_OVERVIEW = [
  "Hedge trimming and shaping as required",
  "General weeding of garden beds and landscaped areas",
  "Removal of unwanted or self-seeded plants",
  "Monitoring and treatment of plant health, pests, and diseases",
  "Weed spraying where required",
  "Feeding of garden as plants in general and as required",
  "Leaf litter removal and general garden tidy",
  "Blow down of work areas on completion",
]

function cleanTask(description: string) {
  const cleaned = description.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function customerTasks(quote: SimpleQuote) {
  return quote.tasks.map((task) => cleanTask(task.description)).filter(Boolean)
}

export function simpleQuoteTitle(quote: SimpleQuote) {
  const address = quote.siteAddress.trim()
  if (quote.jobType === "maintenance") {
    const base = `Ongoing ${frequencyLabel(quote)} Garden Maintenance`
    return address ? `${base} – ${address}` : base
  }
  return address ? `One-Off Garden Tidy – ${address}` : "One-Off Garden Tidy"
}

export function renderMaintenanceBody(quote: SimpleQuote): string {
  const freqWord = frequencyLabel(quote).toLowerCase()

  // Greenwaste wording follows the CONFIRMED treatment only. "not_mentioned" must not
  // silently promise greenwaste removal the customer was never quoted for.
  const priceReflects =
    quote.greenwaste.treatment === "included"
      ? `Price reflects the ${freqWord} service fee and includes ongoing garden maintenance, greenwaste removal, and spraying (pesticides and herbicides as required)`
      : quote.greenwaste.treatment === "separate_line"
        ? `Price reflects the ${freqWord} service fee and includes ongoing garden maintenance and spraying (pesticides and herbicides as required). Greenwaste removal is charged separately.`
        : `Price reflects the ${freqWord} service fee and includes ongoing garden maintenance and spraying (pesticides and herbicides as required)`

  const paragraphs: string[] = [
    simpleQuoteTitle(quote),
    priceReflects,
    `Scheduled visits to maintain the overall presentation, health, and condition of the garden. Pricing is based on ${freqWord} service frequency.`,
  ]

  const note = quote.frequencyNote.trim()
  if (note) paragraphs.push(note.charAt(0).toUpperCase() + note.slice(1))

  const focus = customerTasks(quote)
  if (focus.length > 0) {
    paragraphs.push(["Main focus of visits:", ...focus].join("\n"))
  }

  paragraphs.push(["Service Overview", "", "Each visit may include:", "", ...MAINTENANCE_OVERVIEW].join("\n"))

  return paragraphs.join("\n\n")
}

export function renderTidyBody(quote: SimpleQuote): string {
  const scope = customerTasks(quote)
  const closers: string[] = []
  if (quote.greenwaste.treatment === "included") closers.push("All greenwaste removed and disposed of")
  if (quote.greenwaste.treatment === "separate_line") closers.push("Greenwaste removal charged as a separate line")
  closers.push("Blow down and tidy of work areas on completion")

  const paragraphs: string[] = [simpleQuoteTitle(quote)]
  if (scope.length > 0) {
    paragraphs.push(["Scope of work:", "", ...scope].join("\n"))
  }
  paragraphs.push(closers.join("\n"))

  return paragraphs.join("\n\n")
}

export function renderCustomerBody(quote: SimpleQuote): string {
  return quote.jobType === "maintenance" ? renderMaintenanceBody(quote) : renderTidyBody(quote)
}

/** Priced lines + totals block, shared by the preview and clipboard text. */
export function renderPriceLines(quote: SimpleQuote, pricing: SimplePricing): string {
  const lines: string[] = []
  const perVisit = quote.jobType === "maintenance" ? " per visit" : ""

  for (const line of pricing.lines) {
    lines.push(`${line.description} — ${formatNzd(line.amount)}${line.kind === "labour" ? perVisit : ""}`)
  }
  for (const pending of pricing.pendingLines) {
    lines.push(pending.description)
  }

  if (pricing.total != null && pricing.gst != null) {
    if (pricing.pendingLines.length > 0) {
      lines.push("Total covers the priced lines above; any line still to be confirmed is excluded.")
    }
    lines.push(`Includes GST (15%): ${formatNzd2(pricing.gst)}`)
    lines.push(`Total (NZD): ${formatNzd2(pricing.total)}${perVisit}`)
  }

  return lines.join("\n")
}

/** Internal-only section — hours, rate, pricing source, site/internal notes. Never exported. */
export function renderInternalNotes(quote: SimpleQuote, pricing: SimplePricing): string {
  const lines: string[] = [`Pricing: ${pricingSourceLabel(pricing)}`]
  if (pricing.hoursUsed != null) lines.push(`Hours: ${pricing.hoursUsed}`)
  for (const task of quote.tasks) {
    if (task.hours != null) lines.push(`${cleanTask(task.description)} — ${task.hours}h`)
  }
  for (const note of quote.internalNotes) {
    const cleaned = note.trim()
    if (cleaned) lines.push(cleaned)
  }
  return lines.join("\n")
}
