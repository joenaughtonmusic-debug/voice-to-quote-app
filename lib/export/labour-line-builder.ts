import type { PricingFact } from "../core/pricing-extraction"
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

export type ResolvedLabourPrice = {
  amount: number
  pricingSource: "spoken_fixed" | "structured_allowance" | "unpriced"
  quantity: number
  unitAmount: number
  unitAmountWasDefaulted: boolean
  allowanceWorkings?: LabourAllowanceWorkings
}

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

export function resolveLabourExportPrice(
  quote: Pick<XeroPayloadQuote, "pricing_facts" | "labour_allowance" | "primary_quote" | "line_items">,
): ResolvedLabourPrice {
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

  const structured = structuredAllowanceLabourPrice(quote as XeroPayloadQuote)
  if (structured) return structured

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
