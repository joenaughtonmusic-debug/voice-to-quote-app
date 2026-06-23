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

export type ResolvedLabourPrice = {
  amount: number
  pricingSource: "spoken_fixed" | "structured_allowance" | "unpriced"
  quantity: number
  unitAmount: number
  unitAmountWasDefaulted: boolean
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
  const usesDayRate = /\b(days?|day\s*rate|daily)\b/i.test(unit)
  const personDays = allowance.people * allowance.days

  const amount = usesDayRate ? personDays * rate : allowance.hours * rate
  if (!Number.isFinite(amount) || amount <= 0) return null

  return {
    amount,
    pricingSource: "structured_allowance",
    quantity: 1,
    unitAmount: amount,
    unitAmountWasDefaulted: false,
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
