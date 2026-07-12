import { type QuoteSpecialist } from "@/lib/quote-specialist-instructions"
import { type PrimaryTrade } from "@/lib/trade-profile"

export type QuoteClassification = { specialist: QuoteSpecialist; reason: string }

export function primaryTradeToSpecialist(primaryTrade: PrimaryTrade): QuoteSpecialist {
  switch (primaryTrade) {
    case "gardening_maintenance":
      return "maintenance"
    case "landscaping":
      return "landscaping"
    case "building":
      return "building"
    case "electrical":
      return "electrical"
    case "plumbing":
      return "plumbing"
    case "painting":
      return "painting"
    case "cleaning":
      return "cleaning"
    case "arborist":
      return "arborist"
    case "multi_trade":
      return "general"
  }
}

export function primaryTradeInstruction(primaryTrade: PrimaryTrade) {
  if (primaryTrade === "multi_trade") {
    return "The user is configured as multi_trade. Classify from transcript/template evidence only."
  }

  return `The user's primary_trade setting is "${primaryTrade}". Use it as a strong signal. If the transcript is ambiguous, default to the matching trade. If the transcript/template clearly describes a different trade, use that clearer trade instead.`
}

export function isQuoteSpecialist(value: unknown): value is QuoteSpecialist {
  return (
    value === "maintenance" ||
    value === "one_off_tidy" ||
    value === "landscaping" ||
    value === "decking" ||
    value === "planting" ||
    value === "hedge_trimming" ||
    value === "electrical" ||
    value === "building" ||
    value === "plumbing" ||
    value === "painting" ||
    value === "cleaning" ||
    value === "arborist" ||
    value === "general"
  )
}

export function transcriptMentionsRecurringWork(transcript: string) {
  return /\b(ongoing|maintenance|maintenance\s+visits?|monthly|recurring|regular|regular\s+service|fortnightly|weekly|two[-\s]?monthly|3[-\s]?monthly|three[-\s]?monthly|every\s+\d+\s+weeks?|per\s+month)\b/i.test(
    transcript,
  )
}

export function transcriptMentionsHedgePlanting(transcript: string) {
  const hasPlantSpeciesOrPlanting =
    /\b(ficus\s+tuffi|ficus\s+tuffy|griselinia|grislynia|buxus|pittosporum|lomandra|flax|plants?|planting|supply\s+and\s+install|supply|install)\b/i.test(
      transcript,
    )
  const hasHedgeLengthOrOptions =
    /\b\d+(?:\.\d+)?\s*(?:m|metres?|meters?)\b[^.\n]{0,80}\bhedge\b/i.test(transcript) ||
    /\bhedge\b[^.\n]{0,80}\b(options?|sizes?|pot\s+sizes?|available\s+sizes|supply|install|planting)\b/i.test(transcript)
  const hasTrimmingVerb = /\b(trim|trimming|cut|cutting|reduce|reduction|shape|shaping|prune|pruning|lower|lowering|top|topping|maintain|maintenance)\b/i.test(
    transcript,
  )

  return hasPlantSpeciesOrPlanting && hasHedgeLengthOrOptions && !hasTrimmingVerb
}

export function transcriptMentionsHedgeTrimming(transcript: string) {
  if (transcriptMentionsHedgePlanting(transcript)) return false
  return /\b(hedge\s+trimming|trim\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|cut\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|hedge\s+reduction|reduce\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|shape\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|prune\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|lower\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|top\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|maintain\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge)\b/i.test(
    transcript,
  )
}

/**
 * A distinct NON-PLANTING structural-trade area in the transcript (paving/retaining/decking/
 * hard fill). Deliberately a tight allow-list of unambiguous construction nouns — it must NOT
 * match planting-adjacent edging like a "timber board border" around a planting bed, so a pure
 * planting job (Michelia / Client A) is never mistaken for a mixed one.
 */
export function transcriptMentionsNonPlantingStructuralTrade(transcript: string) {
  return /\b(pavers?|paving|paved\s+area|retaining\s+wall|decking|hard\s?fill)\b/i.test(transcript)
}

/**
 * AI-0 mixed-trade guard. When a job is classified as pure planting but the transcript ALSO
 * describes a distinct non-planting structural trade (e.g. a paver area alongside planting),
 * it is a MIXED landscaping job: re-route it to `general_landscaping` so the general-landscaping
 * extraction/assembly captures ALL scope (the paver would otherwise be dropped by the planting
 * specialist). Deterministic, plan/model-agnostic, and narrow: it only overrides `planting`, and
 * only when a hard structural-trade noun is present. Any other classification is returned as-is.
 */
export function refineMixedLandscapingClassification(
  classification: QuoteClassification,
  transcript: string,
): QuoteClassification {
  if (classification.specialist !== "planting") return classification
  if (!transcriptMentionsNonPlantingStructuralTrade(transcript)) return classification
  return {
    specialist: "landscaping",
    reason:
      "Mixed landscaping: planting plus a distinct non-planting structural trade (paving/retaining/decking/hard fill) " +
      `was detected, so the job is routed to general landscaping rather than pure planting. Original: ${classification.reason}`,
  }
}
