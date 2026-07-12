/**
 * Deterministic ongoing-maintenance pricing facts (M1 — reliability foundation).
 *
 * Mirrors `tidy-pricing-facts.ts` for the maintenance flow. "AI interprets language; deterministic
 * code performs calculations." The AI-narrated fields flicker run-to-run, so the priced figures
 * they feed flicker too. This module parses the maintenance pricing-relevant facts straight from
 * the RAW transcript — a fixed string — so the same transcript yields the SAME figures every run.
 *
 * The shared labour/greenwaste basis (hours, rate, people, bags) is reused from the tidy facts
 * engine so the two flows stay consistent. The maintenance-specific facts added here are:
 *   - the spoken per-visit price (the maintenance anchor — spoken wins, consumed by M2),
 *   - the visit cadence (surfaced on the customer quote — M5),
 *   - whether greenwaste is spoken as INCLUDED in the visit price vs a separate line (M3),
 *   - a maintenance-aware spoken greenwaste total that also catches the trailing-$ order
 *     ("removal of greenwaste $26.50"), which the tidy leading-$ parser does not (M3),
 *   - the named extras mentioned — sprays/extras, tool servicing, petrol (foundation for M4).
 *
 * Like the tidy layer at T1, most of these facts are CAPTURED and tested here as the foundation
 * for the later maintenance batches (M2 per-visit price, M3 greenwaste line, M4 priced extras,
 * M5 frequency). Whether a mentioned extra renders as its own line or folds into the visit price
 * is a downstream (M4) classification decision, not made here.
 */

import { extractTidyPricingFacts } from "./tidy-pricing-facts"

export type MaintenanceCadence =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "six_weekly"
  | "two_monthly"
  | "three_monthly"
  | "four_monthly"

export type MaintenanceExtra = { name: string }

export type MaintenancePricingFacts = {
  /** Spoken per-visit price — "$285 per visit" / "price per visit $405". The anchor; spoken wins (M2). */
  spokenPerVisitPrice: number | null
  /** Visit cadence — "6-weekly" → "six_weekly". Surfaced on the customer quote (M5). */
  cadence: MaintenanceCadence | null
  /** Labour hours per visit — "4.5 hours labour". Foundation for the computed per-visit price (M2). */
  labourHours: number | null
  /** Labour hourly rate — "$75 an hour". Foundation for M2 (rare in maintenance; a spoken visit price usually wins). */
  labourRate: number | null
  /** Crew size — "two people". Foundation for M2. */
  labourPeople: number | null
  /** Greenwaste spoken as INCLUDED in the visit price ("including greenwaste removal") → no separate line (M3). */
  greenwasteIncluded: boolean
  /** Spoken greenwaste dollar total — "removal of greenwaste $26.50". Foundation for the greenwaste line (M3). */
  spokenGreenwasteTotal: number | null
  /** Greenwaste bag count — foundation for the greenwaste rule (M3). */
  greenwasteBags: number | null
  /** Named extras mentioned — sprays/extras, tool servicing, petrol. Foundation for priced extras (M4). */
  extras: MaintenanceExtra[]
}

function parseAmount(word: string | undefined): number | null {
  if (!word) return null
  const numeric = Number(word.replace(/,/g, ""))
  return Number.isFinite(numeric) ? numeric : null
}

function firstAmount(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern)
  return m ? parseAmount(m[1]) : null
}

/** Visit cadence, checked most-specific first so "2-monthly" never falls through to bare "monthly". */
function extractCadence(text: string): MaintenanceCadence | null {
  if (/\b(?:four[-\s]monthly|4[-\s]monthly|every\s+4\s+months?)\b/i.test(text)) return "four_monthly"
  if (/\b(?:three[-\s]monthly|3[-\s]monthly|every\s+3\s+months?|quarterly)\b/i.test(text)) return "three_monthly"
  if (/\b(?:two[-\s]monthly|2[-\s]monthly|every\s+2\s+months?)\b/i.test(text)) return "two_monthly"
  if (/\b(?:six[-\s]weekly|6[-\s]weekly|every\s+6\s+weeks?)\b/i.test(text)) return "six_weekly"
  if (/\b(?:fortnightly|two[-\s]weekly|every\s+2\s+weeks?)\b/i.test(text)) return "fortnightly"
  // Bare "monthly" — exclude the digit/word "N-monthly" forms handled above.
  if (/\bmonthly\b/i.test(text) && !/\b(?:[2-9]|two|three|four)[-\s]monthly\b/i.test(text)) return "monthly"
  // Bare "weekly" — exclude "six-weekly" / "fortnightly" style compounds handled above.
  if (/\bweekly\b/i.test(text) && !/\b(?:[0-9]+|six|two|four|fort)[-\s]?weekly\b/i.test(text)) return "weekly"
  return null
}

export function extractMaintenancePricingFacts(
  transcript: string | null | undefined,
): MaintenancePricingFacts {
  const text = (transcript ?? "").replace(/\s+/g, " ")
  const tidy = extractTidyPricingFacts(text)

  // ── Per-visit price (the maintenance anchor, M2) ─────────────────────────
  // "$405 per visit" / "$405 a visit" (leading), or "per visit $405" / "price per visit $405"
  // (trailing). Never matches a greenwaste "$26.50" — that requires the word "visit" adjacent.
  const perVisitLeading = firstAmount(text, /\$\s?([\d,]+(?:\.\d+)?)\s+(?:per|a)\s+visit\b/i)
  // The trailing form excludes an hourly rate stated after "per visit" ("per visit at $75 an hour"):
  // that $75 is the rate feeding the computed price (M2), not the per-visit total.
  // (?![\d.,]) ensures the whole number is captured before the rate lookahead runs — otherwise the
  // engine backtracks to a truncated capture ("$75 an hour" → "7") once the full number is rejected.
  const perVisitTrailing = firstAmount(
    text,
    /\bper\s+visit\b\s*(?:is|of|at|:)?\s*\$\s?([\d,]+(?:\.\d+)?)(?![\d.,])(?!\s*(?:per|an|\/)\s*(?:hour|hr))/i,
  )
  const spokenPerVisitPrice = perVisitLeading ?? perVisitTrailing

  // ── Cadence (M5) ─────────────────────────────────────────────────────────
  const cadence = extractCadence(text)

  // ── Greenwaste treatment (M3) ────────────────────────────────────────────
  // Spoken as included in the visit price → fold into the service, no separate line (Brett/Stella).
  const greenwasteIncluded =
    /\binclud\w*\b[^.]*\bgreen\s?waste\b/i.test(text) || /\bgreen\s?waste\b[^.]*\bincluded\b/i.test(text)

  // Maintenance-aware spoken greenwaste total: catch both the leading-$ order ("$26.50 of greenwaste")
  // and the trailing-$ order ("removal of greenwaste $26.50"), which the tidy leading-$ parser misses.
  // Suppressed when greenwaste is folded into the visit price (no separate figure to price).
  const gwLeading = firstAmount(text, /\$\s?([\d,]+(?:\.\d+)?)\s*(?:worth\s+of\s+|for\s+|of\s+)?(?:the\s+)?green\s?waste/i)
  const gwTrailing = firstAmount(text, /green\s?waste[^.$]{0,40}?\$\s?([\d,]+(?:\.\d+)?)/i)
  const spokenGreenwasteTotal = greenwasteIncluded ? null : (gwLeading ?? gwTrailing ?? tidy.spokenGreenwasteTotal)

  // ── Extras / consumables mentioned (foundation, M4) ──────────────────────
  // Name-only capture, mirroring the tidy extras foundation. Whether each renders as its own line
  // (Nadia sprays/tool, Brett petrol) or folds into the visit price (Stella's herbicide) is the
  // separate-vs-included decision made in M4, not here.
  const extras: MaintenanceExtra[] = []
  if (/\btool\s+(?:maintenance|servicing|service)\b/i.test(text)) extras.push({ name: "Tool servicing" })
  if (/\bpetrol\b/i.test(text)) extras.push({ name: "Petrol" })
  if (/\bsprays?\b|\bherbicide\b/i.test(text)) extras.push({ name: "Sprays / extras" })

  return {
    spokenPerVisitPrice,
    cadence,
    labourHours: tidy.labourHours,
    labourRate: tidy.labourRate,
    labourPeople: tidy.labourPeople,
    greenwasteIncluded,
    spokenGreenwasteTotal,
    greenwasteBags: tidy.greenwasteBags,
    extras,
  }
}
