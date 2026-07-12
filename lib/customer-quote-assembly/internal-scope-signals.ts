/**
 * Shared "is this line internal, not customer scope?" gate.
 *
 * PRODUCTION_DIRECTION hard rule: internal planning notes — a labour basis (hours/rate/
 * crew×duration), a green-waste quantity or price, a dump/tip rate, a scheduling reminder
 * (weekday, "add to the labour note"), or option/version planning chatter — must NEVER
 * reach the customer's scope of work. Genuine work activities carry none of these signals
 * and pass through (default keep — never silently dropped).
 *
 * Used by both the garden-tidy customer assembler (Scope of Work) and the shared customer
 * quote preview (customerPreview.scopeItems), so the guarantee holds on every customer
 * surface regardless of whether a line came from primary_quote.notes or an AI-narrated
 * customer_scope line.
 */

function cleanLine(value: string) {
  return value
    .replace(/^\s*(?:scope|note|site\s+note)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim()
}

const LABOUR_PATTERN =
  /\b(?:\d+|one|two|three|four|five)\s+(?:people|persons?|staff|men|man)\b.*?\b(?:day|hour|hr)s?\b|\b(?:one|two|three|four|five|\d+)\s+(?:and\s+a\s+(?:half|quarter|third))\s+(?:day|hour|hr)s?\b|\bjob\s+will\s+take\b.*?\b(?:day|hour|hr)s?\b/i

const TRAILER_PATTERN =
  /\btrailer\s+loads?|(?:\d+|one|two|three|four|five|half|quarter|third)\s+(?:of\s+a\s+)?trailer/i

export function isLabourAllowanceLine(value: string) {
  return LABOUR_PATTERN.test(cleanLine(value))
}

export function isGreenwasteQuantityLine(value: string) {
  const cleaned = cleanLine(value)
  return (
    TRAILER_PATTERN.test(cleaned) ||
    (/\bgreen\s*waste|greenwaste\b/i.test(cleaned) &&
      /\b(?:load|loads|trailer|skip|bin|tip|m³|m3|cubic)\b/i.test(cleaned))
  )
}

/**
 * An hourly/day rate, "N hours" + rate/labour basis, a labour-duration estimate/allowance, or
 * an estimated/total-labour workings line. Targeted so a genuine scope instruction that happens
 * to mention time (e.g. "cure concrete for 24 hours") is NOT mistaken for a labour basis.
 */
function isLabourBasisLine(value: string) {
  const cleaned = cleanLine(value).toLowerCase()
  return (
    /\$\s?\d[\d,]*(?:\.\d+)?\s*(?:per|an|\/)\s*(?:hour|hr|day)\b/i.test(cleaned) ||
    /\bper\s+hour\b/i.test(cleaned) ||
    /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?)\b.*\b(?:lab(?:ou)?r|at\s+\$)/i.test(cleaned) ||
    /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?)\s+of\s+(?:work|lab(?:ou)?r)\b/i.test(cleaned) ||
    /\b(?:estimate[d:]?|allow(?:ance)?|approx\.?|approximately)\b[^.]*\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|days?)\b/i.test(cleaned) ||
    /\b(?:total\s+)?estimated\s+lab(?:ou)?r\b/i.test(cleaned) ||
    /\btotal\b.*\blab(?:ou)?r\b.*\bis\b/i.test(cleaned)
  )
}

/** A green-waste line carrying a quantity, a price, or a time-unit allowance ("1.5 days of green waste"). */
function isGreenwasteFactLine(value: string) {
  const cleaned = cleanLine(value)
  return /\bgreen\s*waste|greenwaste\b/i.test(cleaned) && /\$?\d/.test(cleaned)
}

/** Disposal-cost basis (dump / tip rate). */
function isDisposalRateLine(value: string) {
  return /\b(?:dump|tip)\s+(?:rate|fee)\b/i.test(cleanLine(value))
}

/** A day-of-week or "…labour note" reminder — internal scheduling, never customer scope. */
function isSchedulingOrReminderLine(value: string) {
  const cleaned = cleanLine(value).toLowerCase()
  return (
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(cleaned) ||
    /\b(?:add(?:ed)?\s+to|to\s+add\s+to)\s+(?:the\s+)?lab(?:ou)?r\s+note\b/i.test(cleaned) ||
    /\blab(?:ou)?r\s+note\b/i.test(cleaned)
  )
}

/** Option/version planning chatter the estimator dictates to themselves. */
function isPlanningMetaLine(value: string) {
  const cleaned = cleanLine(value).toLowerCase()
  return (
    /\btentative\b/i.test(cleaned) ||
    /\blarger and smaller\b/i.test(cleaned) ||
    /\b(?:larger|smaller|reduced)\s+(?:version|scope)\b/i.test(cleaned) ||
    /\bversions?\s+of\s+the\s+job\b/i.test(cleaned) ||
    /\bplans?\s+for\s+(?:a\s+)?(?:larger|smaller)\b/i.test(cleaned)
  )
}

/** Explicit tool-bring / "internal note" reminders. */
function isInternalReminderLine(value: string) {
  const cleaned = cleanLine(value).toLowerCase()
  return (
    /\binternal\s+note\b/i.test(cleaned) ||
    /\b(?:make\s+sure\s+(?:we|to)\s+bring|bring\s+(?:the\s+)?(?:pole\s+)?(?:chainsaw|silkies|loppers)|pole\s+chainsaw|silkies|loppers)\b/i.test(
      cleaned,
    ) ||
    /\btools?\s+(?:to\s+)?bring\b/i.test(cleaned)
  )
}

/** True when a line carries any internal signal and must be kept out of customer scope. */
export function hasInternalScopeSignal(value: string) {
  return (
    isLabourAllowanceLine(value) ||
    isLabourBasisLine(value) ||
    isGreenwasteQuantityLine(value) ||
    isGreenwasteFactLine(value) ||
    isDisposalRateLine(value) ||
    isSchedulingOrReminderLine(value) ||
    isPlanningMetaLine(value) ||
    isInternalReminderLine(value)
  )
}
