import type { PricingCadence, PricingExtractionResult, PricingFact, PricingFactType } from "./types"

type PricingDraft = Omit<PricingFact, "id">

const MONEY_PATTERN = /\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g

function cleanSourceText(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function sentenceCandidates(text: string) {
  return Array.from(text.matchAll(/[^.!?\n]+[.!?]?/g))
    .map((match) => cleanSourceText(match[0]))
    .filter(Boolean)
}

function amountFromMatch(match: RegExpMatchArray) {
  const whole = match[1]?.replace(/,/g, "")
  if (!whole) return null
  const decimal = match[2] ? `.${match[2]}` : ""
  const value = Number(`${whole}${decimal}`)
  return Number.isFinite(value) ? value : null
}

function amountFromText(value: string) {
  const match = [...value.matchAll(MONEY_PATTERN)][0]
  return match ? amountFromMatch(match) : null
}

function moneyAmounts(value: string) {
  return [...value.matchAll(MONEY_PATTERN)]
    .map(amountFromMatch)
    .filter((amount): amount is number => amount !== null)
}

function cadenceFromText(value: string): PricingCadence | null {
  if (/\bper\s+visit\b/i.test(value)) return "per_visit"
  if (/\bper\s+month\b/i.test(value)) return "per_month"
  if (/\bmonthly\b/i.test(value)) return "monthly"
  if (/\bper\s+week\b/i.test(value)) return "per_week"
  return null
}

function cleanLabel(value: string) {
  return value
    .replace(/\b(optional\s+extra|add[- ]?on|additional|extra|price|estimate|allowance|cost|is|for)\b/gi, " ")
    .replace(MONEY_PATTERN, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
    .trim()
}

function splitList(value: string) {
  return value
    .split(/\s*,\s*|\s+\band\b\s+/i)
    .map((item) => item.trim().replace(/^(?:and\s+)+/i, "").replace(/^[,;:\s]+|[,;:\s]+$/g, ""))
    .filter(Boolean)
}

function inclusionsFromText(value: string) {
  const match = value.match(/\bincluding\s+(.+?)(?:$|(?:\s+optional\s+extra|\s+add[- ]?on))/i)
  if (!match?.[1]) return []

  return splitList(match[1])
}

function fixedPriceSource(sentence: string) {
  const match =
    sentence.match(/\b(?:price\s+(?:per\s+\w+\s+)?(?:is\s+)?|quoted\s+price\s+(?:is\s+)?|cost\s+(?:is\s+)?)(\$?\s*\d[\d,]*(?:\.\d{1,2})?)/i) ??
    sentence.match(/(?:^|\s)(\$?\s*\d[\d,]*(?:\.\d{1,2})?)(?:\s+(?:per\s+visit|per\s+month|per\s+week|monthly)\b)?/i)

  return match ? cleanSourceText(match[0]) : sentence
}

function optionalExtraForSentence(sentence: string): PricingDraft | null {
  if (!/\b(optional\s+extra|add[- ]?on|additional)\b/i.test(sentence)) return null

  const amount = amountFromText(sentence)
  if (amount === null) return null

  return {
    type: "optional_extra",
    amount,
    amount_min: null,
    amount_max: null,
    currency: "NZD",
    cadence: cadenceFromText(sentence),
    label: cleanLabel(sentence) || "Optional extra",
    inclusions: inclusionsFromText(sentence),
    source_text: sentence,
    confidence: "high",
  }
}

function rangeForSentence(sentence: string): PricingDraft | null {
  const betweenMatch = sentence.match(
    /\b(?:estimate\s+)?between\s+(\$?\s*\d[\d,]*(?:\.\d{1,2})?)\s+and\s+(\$?\s*\d[\d,]*(?:\.\d{1,2})?)/i,
  )
  const toMatch = sentence.match(/(\$?\s*\d[\d,]*(?:\.\d{1,2})?)\s+to\s+(\$?\s*\d[\d,]*(?:\.\d{1,2})?)/i)
  const match = betweenMatch ?? toMatch
  if (!match?.[1] || !match[2]) return null

  const amountMin = amountFromText(match[1])
  const amountMax = amountFromText(match[2])
  if (amountMin === null || amountMax === null) return null

  return {
    type: "price_range",
    amount: null,
    amount_min: Math.min(amountMin, amountMax),
    amount_max: Math.max(amountMin, amountMax),
    currency: "NZD",
    cadence: cadenceFromText(sentence),
    label: cleanLabel(sentence) || "Estimate",
    inclusions: inclusionsFromText(sentence),
    source_text: sentence,
    confidence: "high",
  }
}

function allowanceForSentence(sentence: string): PricingDraft | null {
  if (!/\bin\s+the\s+region\s+of\b|\ballow(?:ance)?\b/i.test(sentence)) return null

  const amount = amountFromText(sentence)
  if (amount === null) return null

  return {
    type: "allowance",
    amount,
    amount_min: null,
    amount_max: null,
    currency: "NZD",
    cadence: cadenceFromText(sentence),
    label: cleanLabel(sentence) || "Allowance",
    inclusions: inclusionsFromText(sentence),
    source_text: sentence,
    confidence: "medium",
    metadata: /\bin\s+the\s+region\s+of\b/i.test(sentence) ? { approximate: true } : undefined,
  }
}

function fixedPriceForSentence(sentence: string): PricingDraft | null {
  const amounts = moneyAmounts(sentence)
  if (amounts.length !== 1) return null
  if (/\b(optional\s+extra|add[- ]?on|additional|between|to\s+\$?\s*\d|in\s+the\s+region\s+of|allow(?:ance)?)\b/i.test(sentence)) {
    return null
  }
  if (!/\$\s*\d|\b(?:price|quoted\s+price|cost)\b/i.test(sentence)) {
    return null
  }

  const amount = amounts[0]

  return {
    type: "fixed_price",
    amount,
    amount_min: null,
    amount_max: null,
    currency: "NZD",
    cadence: cadenceFromText(sentence),
    label: cleanLabel(sentence) || "Fixed price",
    inclusions: inclusionsFromText(sentence),
    source_text: fixedPriceSource(sentence),
    confidence: "high",
  }
}

function pricingForSentence(sentence: string): PricingDraft[] {
  const optional = optionalExtraForSentence(sentence)
  if (optional) return [optional]

  const range = rangeForSentence(sentence)
  if (range) return [range]

  const allowance = allowanceForSentence(sentence)
  if (allowance) return [allowance]

  const fixedPrice = fixedPriceForSentence(sentence)
  return fixedPrice ? [fixedPrice] : []
}

function withIds(pricing: PricingDraft[]) {
  return pricing.map((fact, index): PricingFact => ({ ...fact, id: `pricing-${index + 1}` }))
}

function dedupePricing(pricing: PricingDraft[]) {
  const seen = new Set<string>()
  return pricing.filter((fact) => {
    const key = `${fact.type}:${fact.amount ?? ""}:${fact.amount_min ?? ""}:${fact.amount_max ?? ""}:${fact.source_text}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function extractPricing(text: string): PricingExtractionResult {
  const pricing = sentenceCandidates(text).flatMap(pricingForSentence)

  return {
    pricing: withIds(dedupePricing(pricing)),
    source_text: text,
  }
}
