/**
 * Deterministic garden-tidy pricing facts (T1 — reliability foundation).
 *
 * "AI interprets language; deterministic code performs calculations." The AI-narrated fields
 * (labour_allowance, greenwaste, line_items) vary run-to-run, so the priced figures they feed
 * flicker. This module parses the pricing-relevant facts straight from the RAW transcript — a
 * fixed string — so the same transcript yields the SAME figures every run.
 *
 * T1 wires only the spoken TOTALS (labour "$400 for labour", greenwaste "$130 of green waste")
 * as the top-priority, always-stable price source. The remaining facts (rate, hours, days,
 * people, greenwaste quantity, extras) are captured and tested here as the foundation for the
 * rule-based pricing batches (T2 labour day-rate, T3 greenwaste rule, T4 extras) — they are not
 * yet consumed.
 */

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
  quarter: 0.25,
}

export type TidyExtra = { name: string }

export type TidyPricingFacts = {
  /** Spoken labour dollar total — "$400 for labour". Wired (T1). */
  spokenLabourTotal: number | null
  /** Labour hourly rate — "$80 an hour". Foundation for T2. */
  labourRate: number | null
  /** Explicit labour hours — "five hours". Foundation for T2. */
  labourHours: number | null
  /** Labour days — "full day" → 1, "1.5 days" → 1.5. Foundation for T2. */
  labourDays: number | null
  /** Crew size — "two people". Foundation for T2. */
  labourPeople: number | null
  /** True when the stated hours are a whole-crew total ("12 hours total") — don't ×people. */
  labourHoursAreTotal: boolean
  /** Spoken greenwaste dollar total — "$130 of green waste". Wired (T1). */
  spokenGreenwasteTotal: number | null
  /** Greenwaste bag count — "two bags of green waste". Foundation for T3. */
  greenwasteBags: number | null
  /** Greenwaste trailer fraction/count — "½ trailer load". Foundation for T3. */
  greenwasteTrailers: number | null
  /** How many distinct greenwaste bag/trailer quantities were stated. >1 → ambiguous, don't rule-price. */
  greenwasteQuantityMentions: number
  /** Odd/ambiguous greenwaste unit to flag rather than price — e.g. "1.5 days". Foundation for T3. */
  greenwasteOddUnit: string | null
  /** Named consumables/extras mentioned — e.g. extra-strength weedkiller. Foundation for T4. */
  extras: TidyExtra[]
}

function toNumber(word: string | undefined): number | null {
  if (!word) return null
  const cleaned = word.trim().toLowerCase()
  if (cleaned in WORD_NUMBERS) return WORD_NUMBERS[cleaned]
  const numeric = Number(cleaned.replace(/,/g, ""))
  return Number.isFinite(numeric) ? numeric : null
}

const NUM = "\\d+(?:\\.\\d+)?|a|one|two|three|four|five|six|seven|eight|nine|ten"

function firstMatchNumber(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern)
  return m ? toNumber(m[1]) : null
}

export function extractTidyPricingFacts(transcript: string | null | undefined): TidyPricingFacts {
  const text = (transcript ?? "").replace(/\s+/g, " ")

  // ── Spoken totals (wired) ────────────────────────────────────────────────
  // "$400 for labour" / "$400 for the labour". Never matches a rate ("$80 an hour").
  const spokenLabourTotal = firstMatchNumber(text, /\$\s?([\d,]+(?:\.\d+)?)\s+(?:for|of)\s+(?:the\s+)?lab(?:ou)?r/i)
  // "$130 of green waste" / "$130 green waste". Leading-$ only, so "$5 of dump rate" is never taken.
  const spokenGreenwasteTotal = firstMatchNumber(
    text,
    /\$\s?([\d,]+(?:\.\d+)?)\s*(?:worth\s+of\s+|of\s+)?green\s?waste/i,
  )

  // ── Labour basis (foundation, T2) ────────────────────────────────────────
  const labourRate = firstMatchNumber(text, /\$\s?([\d,]+(?:\.\d+)?)\s*(?:an|per|\/)\s*(?:hour|hr)s?\b/i)
  // A stated TOTAL ("total of 3.5 hours") is the labour hours, even when per-task
  // hours ("1.5 hours") appear earlier — prefer the total over the first match.
  const totalHours =
    firstMatchNumber(text, new RegExp(`\\btotal\\s+of\\s+(${NUM})\\s*(?:hours?|hrs?)\\b`, "i")) ??
    firstMatchNumber(text, new RegExp(`\\b(${NUM})\\s*(?:hours?|hrs?)\\s+(?:total|in\\s+total|altogether)\\b`, "i"))
  const labourHours = totalHours ?? firstMatchNumber(text, new RegExp(`\\b(${NUM})\\s*(?:hours?|hrs?)\\b`, "i"))
  const labourPeople = firstMatchNumber(text, new RegExp(`\\b(${NUM})\\s+(?:people|persons?|men|man|staff)\\b`, "i"))
  // "12 hours total / in total / altogether / between them" — the hours are the whole-crew total,
  // so they must NOT be multiplied by the crew size again.
  const labourHoursAreTotal =
    /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?)\s+(?:total|in\s+total|altogether|combined|between\s+them)\b/i.test(text) ||
    /\b(?:total|altogether)\s+of\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?)\b/i.test(text)

  let labourDays: number | null = null
  if (/\bfull\s+day\b/i.test(text)) {
    labourDays = 1
  } else if (/\bhalf\s+(?:a\s+)?day\b/i.test(text)) {
    labourDays = 0.5
  } else if (/\bthree\s+quarters?\s+(?:of\s+)?(?:a\s+)?day\b/i.test(text)) {
    labourDays = 0.75
  } else if (/\b(?:a\s+)?quarter\s+(?:of\s+)?(?:a\s+)?day\b/i.test(text)) {
    labourDays = 0.25
  } else {
    const half = text.match(new RegExp(`\\b(${NUM})\\s+and\\s+a\\s+(half|quarter)\\s+days?\\b`, "i"))
    if (half) {
      const whole = toNumber(half[1]) ?? 0
      labourDays = whole + (half[2].toLowerCase() === "half" ? 0.5 : 0.25)
    } else {
      // Exclude a "days" that belongs to greenwaste ("1.5 days of green waste").
      labourDays = firstMatchNumber(text, new RegExp(`\\b(${NUM})\\s+days?\\b(?!\\s+of\\s+green\\s?waste)`, "i"))
    }
  }

  // ── Greenwaste quantity (foundation, T3) ─────────────────────────────────
  const greenwasteBags = firstMatchNumber(text, new RegExp(`\\b(${NUM})\\s+bags?\\b`, "i"))
  let greenwasteTrailers: number | null = null
  const halfTrailer = text.match(/\b(half|quarter|1\/2|1\/4)\s+(?:of\s+)?(?:a\s+)?trailer/i)
  if (halfTrailer) {
    greenwasteTrailers = /1\/2|half/i.test(halfTrailer[1]) ? 0.5 : 0.25
  } else {
    greenwasteTrailers = firstMatchNumber(text, new RegExp(`\\b(${NUM})\\s+trailer`, "i"))
  }
  // Count distinct greenwaste quantities. More than one ("two trailer loads … three quarters of a
  // trailer") is ambiguous for the single-quantity rule, so it stays a qty display rather than being
  // part-priced.
  const trailerMentions = (text.match(new RegExp(`\\b(?:${NUM}|half|quarter|three\\s+quarters)\\s+(?:of\\s+)?(?:a\\s+)?trailer`, "gi")) ?? []).length
  const bagMentions = (text.match(new RegExp(`\\b(${NUM})\\s+bags?\\b`, "gi")) ?? []).length
  const greenwasteQuantityMentions = trailerMentions + bagMentions

  // Greenwaste stated in a time unit is ambiguous ("1.5 days of green waste") — capture to flag.
  const oddUnit = text.match(/\b(\d+(?:\.\d+)?\s*days?)\s+of\s+green\s?waste|green\s?waste[^.]*?\b(\d+(?:\.\d+)?\s*days?)\b/i)
  const greenwasteOddUnit = oddUnit ? (oddUnit[1] ?? oddUnit[2] ?? "").replace(/\s+/g, " ").trim() || null : null

  // ── Extras / consumables (foundation, T4) ────────────────────────────────
  const extras: TidyExtra[] = []
  if (/\bextra[-\s]?strength\s+weed\s?killer\b/i.test(text)) extras.push({ name: "Weedkiller - extra strength" })
  if (/\borganic\s+weed\s?killer\b/i.test(text)) extras.push({ name: "Weedkiller - organic" })

  return {
    spokenLabourTotal,
    labourRate,
    labourHours,
    labourDays,
    labourPeople,
    labourHoursAreTotal,
    spokenGreenwasteTotal,
    greenwasteBags,
    greenwasteTrailers,
    greenwasteQuantityMentions,
    greenwasteOddUnit,
    extras,
  }
}
