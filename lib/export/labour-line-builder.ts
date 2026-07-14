import type { PricingFact } from "../core/pricing-extraction"
import { extractTidyPricingFacts, type TidyPricingFacts } from "./tidy-pricing-facts"
import {
  labourLineItem,
  numberFromValue,
  spokenCustomerFixedPrice,
} from "./xero/helpers"
import type { XeroPayloadQuote } from "./xero/types"

const HOURS_PER_DAY = 8

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
}

export type ParsedLabourAllowance = {
  people: number
  days: number
  hours: number
  sourceText: string
}

export type LabourAllowanceWorkings = {
  people: number
  days: number
  hoursPerPerson: number
  totalHours: number
  rate: number
  rateUnit: string
  sourceText: string
}

/**
 * Pristine's standard labour rate (per person, per hour), applied when hours are
 * stated but no rate/total is spoken. Flagged as defaulted so it is surfaced for
 * confirmation, never a silent guess.
 */
export const DEFAULT_LABOUR_RATE = 80

export type ResolvedLabourPrice = {
  amount: number
  pricingSource: "spoken_fixed" | "structured_allowance" | "inline_hours_rate" | "computed_day_rate" | "computed_default_rate" | "unpriced"
  quantity: number
  unitAmount: number
  unitAmountWasDefaulted: boolean
  allowanceWorkings?: LabourAllowanceWorkings
}

/** Business rule (T2): a spoken "full day" of labour is 7.5 hours. */
export const FULL_DAY_HOURS = 7.5

function parseWordNumber(value: string) {
  const normalized = value.trim().toLowerCase()
  if (WORD_NUMBERS[normalized] !== undefined) return WORD_NUMBERS[normalized]
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

function parseFractionalDayPhrase(value: string): number | null {
  const cleaned = value.trim().toLowerCase()

  if (/\bfull\s+day\b/.test(cleaned)) return 1

  const fractionMatch = cleaned.match(
    /\b(one|two|three|\d+(?:\.\d+)?)\s+and\s+a\s+(half|quarter|third)\b/i,
  )
  if (fractionMatch) {
    const whole = parseWordNumber(fractionMatch[1] ?? "")
    if (whole === null) return null
    const fraction = fractionMatch[2]?.toLowerCase()
    if (fraction === "half") return whole + 0.5
    if (fraction === "quarter") return whole + 0.25
    if (fraction === "third") return whole + 1 / 3
  }

  const threeQuarters = cleaned.match(/\bthree\s+quarters?\b/i)
  if (threeQuarters) return 0.75

  const numeric = parseWordNumber(cleaned)
  if (numeric !== null) return numeric

  return null
}

function allowanceFromMatch(people: number, days: number, sourceText: string): ParsedLabourAllowance {
  return {
    people,
    days,
    hours: people * days * HOURS_PER_DAY,
    sourceText,
  }
}

export function parseLabourAllowanceText(text: string): ParsedLabourAllowance | null {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (!cleaned) return null

  const fullDayMatch = cleaned.match(
    /\b(one|two|three|four|five|\d+)\s+(?:people|persons?|staff|men|man)\s+(?:for\s+)?(?:a\s+)?full\s+day\b/i,
  )
  if (fullDayMatch) {
    const people = parseWordNumber(fullDayMatch[1] ?? "")
    if (people !== null && people > 0) return allowanceFromMatch(people, 1, cleaned)
  }

  const peopleForDaysMatch = cleaned.match(
    /\b(one|two|three|four|five|\d+)\s+(?:people|persons?|staff|men|man)\s+for\s+(?:approximately\s+)?(one\s+and\s+a\s+(?:half|quarter|third)|three\s+quarters?(?:\s+of\s+a\s+day)?|full\s+day|one|two|three|four|five|\d+(?:\.\d+)?)\s*(?:days?|day)?\b/i,
  )
  if (peopleForDaysMatch) {
    const people = parseWordNumber(peopleForDaysMatch[1] ?? "")
    const days = parseFractionalDayPhrase(peopleForDaysMatch[2] ?? "")
    if (people !== null && people > 0 && days !== null && days > 0) {
      return allowanceFromMatch(people, days, cleaned)
    }
  }

  const peopleDaysMatch = cleaned.match(
    /\b(one|two|three|four|five|\d+)\s+(?:people|persons?|staff|men|man)\s+(one\s+and\s+a\s+(?:half|quarter|third)|three\s+quarters?(?:\s+of\s+a\s+day)?|full\s+day|one|two|three|four|five|\d+(?:\.\d+)?)\s*(?:days?|day)?\b/i,
  )
  if (peopleDaysMatch) {
    const people = parseWordNumber(peopleDaysMatch[1] ?? "")
    const days = parseFractionalDayPhrase(peopleDaysMatch[2] ?? "")
    if (people !== null && people > 0 && days !== null && days > 0) {
      return allowanceFromMatch(people, days, cleaned)
    }
  }

  const allowDaysStaffMatch = cleaned.match(
    /\ballow\s+(\d+(?:\.\d+)?|one|two|three|four|five)\s+days?\s+for\s+(\d+|one|two|three|four|five)\s+(?:staff|people|persons?)\b/i,
  )
  if (allowDaysStaffMatch) {
    const days = parseFractionalDayPhrase(allowDaysStaffMatch[1] ?? "")
    const people = parseWordNumber(allowDaysStaffMatch[2] ?? "")
    if (days !== null && days > 0 && people !== null && people > 0) {
      return allowanceFromMatch(people, days, cleaned)
    }
  }

  const staffDayMatch = cleaned.match(
    /\b(\d+(?:\.\d+)?)\s+day\s*,?\s*(\d+)\s+(?:staff|people|persons?)\b/i,
  )
  if (staffDayMatch) {
    const days = parseFractionalDayPhrase(staffDayMatch[1] ?? "")
    const people = parseWordNumber(staffDayMatch[2] ?? "")
    if (days !== null && days > 0 && people !== null && people > 0) {
      return allowanceFromMatch(people, days, cleaned)
    }
  }

  return null
}

export function parseLabourAllowanceFromQuote(quote: Pick<XeroPayloadQuote, "labour_allowance" | "primary_quote">) {
  const candidates = [
    quote.labour_allowance,
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.primary_quote?.scope ?? []),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const parsed = parseLabourAllowanceText(candidate)
    if (parsed) return parsed
  }

  return null
}

function labourRateFromQuote(quote: XeroPayloadQuote) {
  const labourItem = labourLineItem(quote)
  if (!labourItem) return null

  const rate = numberFromValue(
    labourItem.final_rate_used ?? labourItem.rate ?? labourItem.knowledge_base_rate ?? labourItem.override_rate,
  )
  if (rate === null) return null

  const unit = (labourItem.unit ?? "hours").trim().toLowerCase()
  return { rate, unit, labourItem }
}

export function structuredAllowanceLabourPrice(quote: XeroPayloadQuote): ResolvedLabourPrice | null {
  const allowance = parseLabourAllowanceFromQuote(quote)
  if (!allowance) return null

  const rateInfo = labourRateFromQuote(quote)
  if (!rateInfo) return null

  const { rate, unit } = rateInfo
  // Only treat the rate as a day rate when the line-item unit explicitly says
  // "day rate", "daily rate", or "per day". A unit of "days" describes the
  // quantity (e.g. "1.5 days"), not the rate basis — in that case the KB rate
  // is still per hour and we must multiply converted hours × rate.
  const usesDayRate = /\b(day[-_\s]?rate|daily[-_\s]?rate|per[-_\s]?day)\b/i.test(unit)
  const personDays = allowance.people * allowance.days

  const amount = usesDayRate ? personDays * rate : allowance.hours * rate
  if (!Number.isFinite(amount) || amount <= 0) return null

  return {
    amount,
    pricingSource: "structured_allowance",
    quantity: 1,
    unitAmount: amount,
    unitAmountWasDefaulted: false,
    allowanceWorkings: {
      people: allowance.people,
      days: allowance.days,
      hoursPerPerson: HOURS_PER_DAY,
      totalHours: allowance.hours,
      rate,
      rateUnit: unit,
      sourceText: allowance.sourceText,
    },
  }
}

/**
 * Deterministic labour total from an inline "N hours at $R (per hour)" allowance —
 * e.g. "5 hours at $80 per hour" → 5 × 80 = $400. Both the hours and the rate are stated
 * in the same spoken labour context, so this is the spoken labour total (spoken price
 * wins), not an assumed crew×day computation. Returns null unless BOTH an hours count and
 * an hourly rate are present (so "full day, two people at $80/hr" — no hours — stays
 * unpriced and gets flagged rather than guessed).
 */
export function inlineHoursRateLabourPrice(
  quote: Pick<XeroPayloadQuote, "labour_allowance" | "primary_quote">,
): ResolvedLabourPrice | null {
  const context = [
    quote.labour_allowance,
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.primary_quote?.scope ?? []),
  ]
    .filter(Boolean)
    .join(" ")

  const hoursMatch = context.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i)
  const rateMatch = context.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(?:per|an|\/)\s*(?:hour|hr)\b/i)
  if (!hoursMatch || !rateMatch) return null

  const hours = Number(hoursMatch[1])
  const rate = Number((rateMatch[1] ?? "").replace(/,/g, ""))
  const amount = hours * rate
  if (!Number.isFinite(amount) || amount <= 0) return null

  return {
    amount,
    pricingSource: "inline_hours_rate",
    quantity: 1,
    unitAmount: amount,
    unitAmountWasDefaulted: false,
    allowanceWorkings: {
      people: 1,
      days: 0,
      hoursPerPerson: hours,
      totalHours: hours,
      rate,
      rateUnit: "hours",
      sourceText: `${hoursMatch[0]} at ${rateMatch[0]}`,
    },
  }
}

/**
 * Deterministic labour total from a rate + duration stated in the transcript (T2). Applies Joe's
 * rule: a "full day" is 7.5 hours and the hourly rate is PER PERSON, so
 * total = hours × people × rate. "full day, 2 people at $80/hr" → 7.5 × 2 × 80 = $1,200.
 * A stated "full day"/days count takes precedence over a bare "N hours" (which may belong to a
 * reduced-scope option, not the main labour). Reads the fixed transcript facts, so it is stable
 * run-to-run. Returns null unless BOTH a rate and a duration are stated.
 */
export function dayRateLabourPrice(facts: TidyPricingFacts): ResolvedLabourPrice | null {
  const rate = facts.labourRate
  if (rate == null || rate <= 0) return null

  const hoursFromDays = facts.labourDays != null
  const hours = hoursFromDays ? (facts.labourDays as number) * FULL_DAY_HOURS : facts.labourHours
  if (hours == null || hours <= 0) return null

  // Stated whole-crew total hours ("12 hours total, 2 people") already cover the crew, so they are
  // NOT multiplied by crew size again. Per-person hours and day allowances still ×people.
  const people = facts.labourHoursAreTotal && !hoursFromDays ? 1 : (facts.labourPeople ?? 1)
  const amount = hours * people * rate
  if (!Number.isFinite(amount) || amount <= 0) return null

  return {
    amount,
    pricingSource: "computed_day_rate",
    quantity: 1,
    unitAmount: amount,
    unitAmountWasDefaulted: false,
    allowanceWorkings: {
      people,
      days: facts.labourDays ?? 0,
      hoursPerPerson: facts.labourDays != null ? FULL_DAY_HOURS : (facts.labourHours ?? 0),
      totalHours: hours * people,
      rate,
      rateUnit: "hours",
      sourceText: `${people} person(s) × ${hours}h × $${rate}/hr`,
    },
  }
}

export function resolveLabourExportPrice(
  quote: Pick<XeroPayloadQuote, "pricing_facts" | "labour_allowance" | "primary_quote" | "line_items"> & {
    raw_transcript?: string | null
  },
): ResolvedLabourPrice {
  const tidyFacts = extractTidyPricingFacts(quote.raw_transcript)

  // T1 — a labour total spoken in the raw transcript ("$400 for labour") is the most reliable
  // source: parsed deterministically from a fixed string, so it is stable run-to-run and wins
  // (spoken price priority). Independent of the AI-narrated labour_allowance/line_items.
  if (typeof tidyFacts.spokenLabourTotal === "number" && tidyFacts.spokenLabourTotal > 0) {
    return {
      amount: tidyFacts.spokenLabourTotal,
      pricingSource: "spoken_fixed",
      quantity: 1,
      unitAmount: tidyFacts.spokenLabourTotal,
      unitAmountWasDefaulted: false,
    }
  }

  const spoken = spokenCustomerFixedPrice(quote)
  if (typeof spoken?.amount === "number" && Number.isFinite(spoken.amount)) {
    return {
      amount: spoken.amount,
      pricingSource: "spoken_fixed",
      quantity: 1,
      unitAmount: spoken.amount,
      unitAmountWasDefaulted: false,
    }
  }

  // T2 — deterministic day-rate computation from the transcript facts, above the AI-field
  // allowance/inline paths (which vary run-to-run).
  const dayRate = dayRateLabourPrice(tidyFacts)
  if (dayRate) return dayRate

  const structured = structuredAllowanceLabourPrice(quote as XeroPayloadQuote)
  if (structured) return structured

  const inline = inlineHoursRateLabourPrice(quote)
  if (inline) return inline

  // Hours are stated but no rate/total was spoken: price at the standard rate,
  // flagged as defaulted (unitAmountWasDefaulted) so the UI surfaces it for
  // confirmation rather than leaving the quote unpriced. e.g. 3.5h -> 3.5 × $80 = $280.
  if (typeof tidyFacts.labourHours === "number" && tidyFacts.labourHours > 0) {
    const people = tidyFacts.labourHoursAreTotal ? 1 : tidyFacts.labourPeople ?? 1
    const amount = Math.round(tidyFacts.labourHours * people * DEFAULT_LABOUR_RATE * 100) / 100
    return {
      amount,
      pricingSource: "computed_default_rate",
      quantity: 1,
      unitAmount: amount,
      unitAmountWasDefaulted: true,
    }
  }

  return {
    amount: 0,
    pricingSource: "unpriced",
    quantity: 1,
    unitAmount: 0,
    unitAmountWasDefaulted: true,
  }
}

export function spokenFixedLabourPrice(pricingFacts: PricingFact[] | undefined) {
  const spoken = spokenCustomerFixedPrice({ pricing_facts: pricingFacts })
  return typeof spoken?.amount === "number" && Number.isFinite(spoken.amount) ? spoken.amount : null
}

type LabourLineItem = {
  item_name?: string | null
  item_type?: string | null
  unit?: string | null
  quantity?: string | null
  final_rate_used?: string | null
  rate?: string | null
  knowledge_base_rate?: string | null
  total?: string | null
  match_reason?: string | null
}

function isLabourItem(item: LabourLineItem) {
  return /\blabou?r\b/i.test(item.item_type ?? "") || /\blabou?r\b/i.test(item.item_name ?? "")
}

function quantityNumericValue(quantity: string | null | undefined) {
  if (!quantity?.trim()) return null
  const match = quantity.trim().match(/^(\d+(?:\.\d+)?)/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function isHourlyLabourUnit(unit: string | null | undefined) {
  const normalized = (unit ?? "").trim().toLowerCase()
  return !normalized || /^(hours?|hrs?)$/.test(normalized)
}

function labourItemNeedsHourNormalisation(item: LabourLineItem, parsed: ParsedLabourAllowance | null) {
  if (!isLabourItem(item)) return false

  const unit = (item.unit ?? "").trim().toLowerCase()
  const quantity = (item.quantity ?? "").trim().toLowerCase()

  // AI set unit to days.
  if (/^days?$/.test(unit)) return true

  // preferTradeAwareLabourLineItems may overwrite unit to "hours" while quantity
  // still embeds days (e.g. quantity "1.5 days" + unit "hours" → "Qty 1.5 days hours").
  if (/\bdays?\b/.test(quantity) && isHourlyLabourUnit(unit)) return true

  // Quantity reflects person-days (1.5) but rate is hourly — not billable hours (12).
  if (parsed && parsed.hours > 0 && isHourlyLabourUnit(unit)) {
    const qtyNum = quantityNumericValue(quantity)
    const personDays = parsed.people * parsed.days
    if (
      qtyNum !== null &&
      Math.abs(qtyNum - personDays) < 0.01 &&
      Math.abs(qtyNum - parsed.hours) > 0.01
    ) {
      return true
    }
  }

  return false
}

type RecoverableQuoteLineItem = {
  item_code: string
  item_name: string
  item_type: string
  description: string
  quantity: string | null
  unit: string
  rate: string | null
  knowledge_base_rate: string | null
  override_rate: string | null
  final_rate_used: string | null
  total: string | null
  match_confidence: string
  match_reason: string
  needs_review: boolean
  warning: string
}

/**
 * Recovery fallback for when all deterministic labour paths
 * (extractLabourDayPeopleAllowances, extractPerTaskHourAllowances,
 *  preferTradeAwareLabourLineItems) have run but produced no labour line item.
 *
 * This happens when the spoken labour allowance uses word-form numbers
 * ("one person for one and a half days") that the numeric-digit extractors
 * cannot parse. parseLabourAllowanceText handles these cases.
 *
 * Accepts an optional knowledgeBaseRate (pre-fetched from the KB by the caller)
 * so the synthetic item has a total from the start — no second rate-lookup pass
 * is required.
 *
 * The match_reason starts with "Deterministic labour allowance calculated from
 * spoken days" so normaliseDaysLabourLineItem and applyPerTaskHourAllowances
 * will both skip it.
 */
export function recoverMissingLabourLineItem<
  T extends {
    labour_allowance?: string | null
    primary_quote?: { scope?: string[] | null; notes?: string[] | null } | null
    line_items: RecoverableQuoteLineItem[]
  },
>(quote: T, transcript?: string, knowledgeBaseRate: string | null = null): T {
  // Skip if any labour item already exists (deterministic or AI paths succeeded)
  if (quote.line_items.some((item) => isLabourItem(item))) return quote

  const candidates = [
    quote.labour_allowance,
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.primary_quote?.scope ?? []),
    transcript,
  ].filter(Boolean) as string[]

  let parsed: ParsedLabourAllowance | null = null
  for (const candidate of candidates) {
    parsed = parseLabourAllowanceText(candidate)
    if (parsed) break
  }
  if (!parsed || parsed.hours <= 0) return quote

  const { hours, people, days, sourceText } = parsed
  const rate = Number(knowledgeBaseRate ?? 0)
  const total = rate > 0 ? String(hours * rate) : null

  const synthetic: RecoverableQuoteLineItem = {
    item_code: "",
    item_name: "Landscaping Labour",
    item_type: "labour",
    description: `${people} person × ${days} days × 8 hrs/day = ${hours} hours`,
    quantity: String(hours),
    unit: "hours",
    rate: knowledgeBaseRate,
    knowledge_base_rate: knowledgeBaseRate,
    override_rate: null,
    final_rate_used: knowledgeBaseRate,
    total,
    match_confidence: knowledgeBaseRate ? "medium" : "low",
    match_reason: `Deterministic labour allowance calculated from spoken days — recovered from word-form allowance: "${sourceText}". parseLabourAllowanceText parsed ${people}p × ${days}d × 8h = ${hours}h.`,
    needs_review: knowledgeBaseRate === null,
    warning: knowledgeBaseRate === null ? "Rate missing — no KB labour item matched" : "",
  }

  quote.line_items.push(synthetic)
  return quote
}

/**
 * When the AI extracts a labour line item with unit "days" (e.g. "1.5 days")
 * but the KB rate is per-hour, the quantity and total are wrong.
 *
 * This step uses parseLabourAllowanceText on the quote's labour_allowance (and
 * primary_quote scope/notes/transcript as fallbacks) to recover totalHours and
 * recalculates total = totalHours × rate.
 *
 * Only fires when neither the deterministic days×people path nor the per-task-hours
 * path has already replaced the labour line_item (detected via match_reason).
 */
export function normaliseDaysLabourLineItem<
  T extends {
    labour_allowance?: string | null
    primary_quote?: { scope?: string[] | null; notes?: string[] | null } | null
    line_items: LabourLineItem[]
  },
>(quote: T, transcript?: string): T {
  // Skip if already handled by a deterministic pipeline path
  if (
    quote.line_items.some(
      (item) =>
        /Deterministic labour allowance calculated from spoken days/i.test(item.match_reason ?? "") ||
        /Deterministic per-task hour allowances/i.test(item.match_reason ?? ""),
    )
  ) {
    return quote
  }

  // Try to parse total hours from labour_allowance, scope/notes, then transcript.
  const candidates = [
    quote.labour_allowance,
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.primary_quote?.scope ?? []),
    transcript,
  ].filter(Boolean) as string[]

  let parsed: ParsedLabourAllowance | null = null
  for (const candidate of candidates) {
    parsed = parseLabourAllowanceText(candidate)
    if (parsed) break
  }
  if (!parsed || parsed.hours <= 0) return quote

  const labourItemsToNormalise = quote.line_items.filter((item) =>
    labourItemNeedsHourNormalisation(item, parsed),
  )
  if (labourItemsToNormalise.length === 0) return quote

  const { hours: totalHours, people, days } = parsed

  for (const item of labourItemsToNormalise) {
    const rate = Number(item.final_rate_used ?? item.rate ?? item.knowledge_base_rate ?? 0)
    item.quantity = String(totalHours)
    item.unit = "hours"
    if (rate > 0) {
      item.total = String(totalHours * rate)
    }
    const normNote = `Hours normalised from ${people} person × ${days} days × 8 hrs/day = ${totalHours}h.`
    item.match_reason = item.match_reason ? `${item.match_reason} ${normNote}` : normNote
  }

  return quote
}
