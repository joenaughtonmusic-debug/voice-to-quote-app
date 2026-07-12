/**
 * Priced maintenance extras / consumables (M4).
 *
 * Mirrors the tidy extras mechanism (`tidy-extras.ts`) for ongoing maintenance, applying Joe's
 * fold-vs-itemise rule to each extra:
 *   - a priced, non-"including" mention becomes its own line (Nadia sprays $10 / tool servicing $12,
 *     Brett petrol $7) — a spoken $ beside the extra wins,
 *   - a mention inside an "including …" visit-price clause FOLDS into the service (Stella's herbicide
 *     spraying) — no separate line; it stays a service inclusion,
 *   - a bare mention with no price is flagged ("price to confirm") — never guessed, never dropped.
 *
 * The M1 facts layer captures which extras were mentioned; this module resolves each to a price and
 * a fold/itemise decision. To price a new extra, add a row to EXTRA_DEFS.
 */

import { extractMaintenancePricingFacts } from "./maintenance-pricing-facts"

export type ResolvedMaintenanceExtra = {
  name: string
  amount: number | null
  /** Spoken as included in the visit price → folds in, shown as a service inclusion not its own line. */
  included: boolean
}

type ExtraDef = { name: string; trigger: RegExp }

// Ordered for display (sprays / extras, tool servicing, petrol). Triggers mirror the M1 facts capture.
const EXTRA_DEFS: ReadonlyArray<ExtraDef> = [
  { name: "Sprays / extras", trigger: /\bsprays?\b|\bherbicide\b/i },
  { name: "Tool servicing", trigger: /\btool\s+(?:maintenance|servicing|service)\b/i },
  { name: "Petrol", trigger: /\bpetrol\b/i },
]

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** A $ amount stated beside the extra in its sentence ("Petrol for the mower is $7"). */
function dollarNear(sentence: string, trigger: RegExp): number | null {
  const m = sentence.match(trigger)
  if (!m || m.index == null) return null
  const window = sentence.slice(Math.max(0, m.index - 10), m.index + m[0].length + 25)
  const d = window.match(/\$\s?([\d,]+(?:\.\d+)?)/)
  if (!d) return null
  const amount = Number((d[1] ?? "").replace(/,/g, ""))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function resolveMaintenanceExtras(transcript?: string | null): ResolvedMaintenanceExtra[] {
  const text = (transcript ?? "").replace(/\s+/g, " ")
  const mentioned = new Set(extractMaintenancePricingFacts(text).extras.map((e) => e.name))
  const sents = sentences(text)

  const resolved: ResolvedMaintenanceExtra[] = []
  for (const def of EXTRA_DEFS) {
    if (!mentioned.has(def.name)) continue
    const hosts = sents.filter((s) => def.trigger.test(s))
    // A priced mention that is NOT inside an "including …" clause itemises as its own line; this is
    // checked first so a separately priced extra still itemises even when the same activity also
    // appears in an "each visit may include …" service clause.
    const priceable = hosts.find((s) => !/\binclud\w*\b/i.test(s) && /\$/.test(s))
    if (priceable) {
      resolved.push({ name: def.name, amount: dollarNear(priceable, def.trigger), included: false })
    } else if (hosts.some((s) => /\binclud\w*\b/i.test(s))) {
      resolved.push({ name: def.name, amount: null, included: true })
    } else {
      resolved.push({ name: def.name, amount: null, included: false })
    }
  }
  return resolved
}

/**
 * Triggers for extras that itemise as their own priced line — used to stop a separately priced
 * extra from ALSO appearing under Service Includes (a double-up). Folded/"included" extras (e.g.
 * Stella's herbicide spraying) are deliberately excluded, so they remain service inclusions.
 */
export function itemisedMaintenanceExtraTriggers(transcript?: string | null): RegExp[] {
  const resolved = resolveMaintenanceExtras(transcript)
  return EXTRA_DEFS.filter((def) => {
    const match = resolved.find((e) => e.name === def.name)
    return match != null && !match.included && match.amount != null
  }).map((def) => def.trigger)
}
