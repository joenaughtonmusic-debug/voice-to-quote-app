import type { QuoteFact, QuoteFactCategory } from "@/lib/core/quote-facts"
import type { QuoteTemplateLibraryItem, QuoteTemplateSectionDraft } from "@/lib/template-import-learning"

export type TemplateRecommendationConfidence = "high" | "medium" | "low"

export type TemplateRecommendation = {
  template: QuoteTemplateLibraryItem
  templateName: string
  confidence: TemplateRecommendationConfidence
  score: number
  reason: string
  detected: string[]
  positiveReasons: string[]
  weakSignals: string[]
  matchedQuoteFactCategories: string[]
  matchedKeywords: string[]
}

type TemplateScore = TemplateRecommendation & {
  categoryMatches: QuoteFactCategory[]
  keywordMatches: string[]
  nameKeywordMatches: string[]
}

const RECOMMENDATION_MIN_SCORE = 7
const HIGH_CONFIDENCE_SCORE = 14
const MEDIUM_CONFIDENCE_SCORE = 8
const STRONG_CATEGORY_ALIGNMENT_SCORE = 12
const PLANTING_MAINTENANCE_MISMATCH_PENALTY = 80

type TemplateDomain = "maintenance" | "planting" | "decking" | "retaining" | null

const CATEGORY_LABELS: Partial<Record<QuoteFactCategory, string>> = {
  job_scope: "job scope",
  labour: "labour",
  plants: "plants",
  materials: "materials",
  waste: "waste/removal",
  equipment: "equipment",
  optional_works: "optional works",
  exclusions: "exclusions",
  terms: "terms",
}

const STOP_WORDS = new Set([
  "and",
  "are",
  "for",
  "from",
  "include",
  "including",
  "install",
  "quote",
  "scope",
  "section",
  "template",
  "the",
  "this",
  "with",
  "work",
  "works",
])

export function recommendTemplateForQuote({
  facts,
  templates,
  sectionsByTemplateId,
  trade,
  jobType,
}: {
  facts: QuoteFact[]
  templates: QuoteTemplateLibraryItem[]
  sectionsByTemplateId: Record<string, QuoteTemplateSectionDraft[]>
  trade?: string | null
  jobType?: string | null
}): TemplateRecommendation | null {
  const scores = scoreTemplatesForQuote({ facts, templates, sectionsByTemplateId, trade, jobType })
  const best = scores[0]

  if (!best || best.score < RECOMMENDATION_MIN_SCORE || best.confidence === "low") return null

  return {
    template: best.template,
    templateName: best.templateName,
    confidence: best.confidence,
    score: best.score,
    reason: best.reason,
    detected: best.detected,
    positiveReasons: best.positiveReasons,
    weakSignals: best.weakSignals,
    matchedQuoteFactCategories: best.matchedQuoteFactCategories,
    matchedKeywords: best.matchedKeywords,
  }
}

export function customerVisibleTemplateRecommendation({
  recommendation,
  selectedTemplateId,
}: {
  recommendation: TemplateRecommendation | null
  selectedTemplateId?: string | null
}) {
  return selectedTemplateId ? null : recommendation
}

export function scoreTemplatesForQuote({
  facts,
  templates,
  sectionsByTemplateId,
  trade,
  jobType,
}: {
  facts: QuoteFact[]
  templates: QuoteTemplateLibraryItem[]
  sectionsByTemplateId: Record<string, QuoteTemplateSectionDraft[]>
  trade?: string | null
  jobType?: string | null
}): TemplateScore[] {
  const quoteText = quoteSearchText(facts, trade, jobType)
  const quoteKeywords = keywordSet(quoteText)
  const quoteCategories = new Set(facts.map((fact) => fact.category))
  const quoteDomain = quoteDomainFromContext(trade, jobType)
  const maintenanceContext = quoteDomain === "maintenance" || hasMaintenanceSignals(quoteText)
  const strongPlantingSignals = hasStrongPlantingSignals(facts, quoteText)

  return templates
    .map((template) => {
      const sections = sectionsByTemplateId[template.id] ?? []
      const templateDomain = templateDomainFromMetadata(template)
      const templateCategories = new Set(
        sections
          .map((section) => String(section.section_category ?? ""))
          .filter((category): category is QuoteFactCategory => isScoredCategory(category)),
      )
      const templateText = templateSearchText(template, sections)
      const templateKeywords = keywordSet(templateText)
      const templateNameKeywords = keywordSet(
        [template.name, template.template_name, template.trade, template.job_type, template.category].filter(Boolean).join(" "),
      )
      const rawKeywordMatches = [...quoteKeywords].filter((keyword) => templateKeywords.has(keyword))
      const keywordMatches = filterWeakPlantingKeywordMatches({
        keywordMatches: rawKeywordMatches,
        templateDomain,
        maintenanceContext,
        strongPlantingSignals,
      })
      const nameKeywordMatches = keywordMatches.filter((keyword) => templateNameKeywords.has(keyword))
      const categoryMatches = [...templateCategories].filter((category) => quoteCategories.has(category))
      const metadataScore = metadataMatchScore(template, trade, jobType)
      const guardPenalty = plantingMaintenanceMismatchPenalty(templateDomain, maintenanceContext, strongPlantingSignals)
      const score = metadataScore + categoryMatches.length * 2 + keywordMatches.length + nameKeywordMatches.length * 4 - guardPenalty
      const confidence = confidenceForScore(score, categoryMatches.length, keywordMatches.length, metadataScore, nameKeywordMatches.length)
      const detected = detectedReasons({ facts, categoryMatches, keywordMatches })
      const positiveReasons = positiveReasonsForScore({
        template,
        trade,
        jobType,
        categoryMatches,
        keywordMatches,
        nameKeywordMatches,
        metadataScore,
      })
      const weakSignals = weakSignalsForScore({
        templateCategories: [...templateCategories],
        categoryMatches,
        metadataScore,
        trade,
        jobType,
        template,
        guardPenalty,
      })

      return {
        template,
        templateName: displayTemplateName(template),
        confidence,
        score,
        reason: reasonForScore(detected),
        detected,
        positiveReasons,
        weakSignals,
        matchedQuoteFactCategories: categoryMatches.map(categoryLabel),
        matchedKeywords: keywordMatches.slice(0, 10),
        categoryMatches,
        keywordMatches,
        nameKeywordMatches,
      }
    })
    .sort((a, b) => b.score - a.score)
}

function metadataMatchScore(template: QuoteTemplateLibraryItem, trade?: string | null, jobType?: string | null) {
  const templateTrade = normalize(template.trade)
  const templateJobType = normalize(template.job_type)
  const templateCategory = normalize(template.category)
  const quoteTrade = normalize(trade)
  const quoteJobType = normalize(jobType)
  const quoteDomain = quoteDomainFromContext(trade, jobType)
  const templateDomain = templateDomainFromMetadata(template)
  let score = 0

  if (templateDomain && quoteDomain && templateDomain === quoteDomain) {
    score += STRONG_CATEGORY_ALIGNMENT_SCORE
  }

  if (metadataValuesMatch(templateCategory, quoteJobType) || metadataValuesMatch(templateCategory, quoteTrade)) {
    score += 8
  }

  if (metadataValuesMatch(templateTrade, quoteTrade)) {
    score += 4
  }

  if (metadataValuesMatch(templateJobType, quoteJobType)) {
    score += 5
  }

  return score
}

function plantingMaintenanceMismatchPenalty(templateDomain: TemplateDomain, maintenanceContext: boolean, hasStrongPlantingSignals: boolean) {
  if (templateDomain === "planting" && maintenanceContext && !hasStrongPlantingSignals) {
    return PLANTING_MAINTENANCE_MISMATCH_PENALTY
  }

  return 0
}

function filterWeakPlantingKeywordMatches({
  keywordMatches,
  templateDomain,
  maintenanceContext,
  strongPlantingSignals,
}: {
  keywordMatches: string[]
  templateDomain: TemplateDomain
  maintenanceContext: boolean
  strongPlantingSignals: boolean
}) {
  if (templateDomain !== "planting" || !maintenanceContext || strongPlantingSignals) return keywordMatches
  return keywordMatches.filter((keyword) => keyword !== "plant")
}

function metadataValuesMatch(templateValue: string, quoteValue: string) {
  return Boolean(
    templateValue &&
      quoteValue &&
      (templateValue === quoteValue || templateValue.includes(quoteValue) || quoteValue.includes(templateValue)),
  )
}

function positiveReasonsForScore({
  template,
  trade,
  jobType,
  categoryMatches,
  keywordMatches,
  nameKeywordMatches,
  metadataScore,
}: {
  template: QuoteTemplateLibraryItem
  trade?: string | null
  jobType?: string | null
  categoryMatches: QuoteFactCategory[]
  keywordMatches: string[]
  nameKeywordMatches: string[]
  metadataScore: number
}) {
  const reasons = new Set<string>()
  const quoteTrade = normalize(trade)
  const quoteJobType = normalize(jobType)
  const templateTrade = normalize(template.trade)
  const templateJobType = normalize(template.job_type)
  const templateCategory = normalize(template.category)
  const quoteDomain = quoteDomainFromContext(trade, jobType)
  const templateDomain = templateDomainFromMetadata(template)

  if (templateDomain && quoteDomain && templateDomain === quoteDomain) {
    reasons.add(`${titleCase(quoteDomain)} category matches template metadata.`)
  }

  if (metadataValuesMatch(templateCategory, quoteJobType) || metadataValuesMatch(templateCategory, quoteTrade)) {
    reasons.add(`${titleCase(templateCategory)} template category matches quote context.`)
  }

  if (metadataValuesMatch(templateTrade, quoteTrade)) {
    reasons.add(`${titleCase(quoteTrade)} trade context matches template metadata.`)
  }

  if (metadataValuesMatch(templateJobType, quoteJobType)) {
    reasons.add(`${titleCase(quoteJobType)} job type matches template metadata.`)
  }

  for (const category of categoryMatches) {
    reasons.add(`${categoryLabel(category)} facts match the template structure.`)
  }

  if (nameKeywordMatches.length > 0) {
    reasons.add(`Template name/metadata matches: ${nameKeywordMatches.slice(0, 4).join(", ")}.`)
  }

  if (keywordMatches.length > 0) {
    reasons.add(`Quote wording matches template terms: ${keywordMatches.slice(0, 6).join(", ")}.`)
  }

  return [...reasons].slice(0, 8)
}

function weakSignalsForScore({
  templateCategories,
  categoryMatches,
  metadataScore,
  trade,
  jobType,
  template,
  guardPenalty,
}: {
  templateCategories: QuoteFactCategory[]
  categoryMatches: QuoteFactCategory[]
  metadataScore: number
  trade?: string | null
  jobType?: string | null
  template: QuoteTemplateLibraryItem
  guardPenalty: number
}) {
  const weakSignals = new Set<string>()
  const matched = new Set(categoryMatches)

  for (const category of templateCategories) {
    if (!matched.has(category)) {
      weakSignals.add(`No ${categoryLabel(category)} facts detected.`)
    }
  }

  if (normalize(trade) && !normalize(template.trade) && metadataScore === 0) {
    weakSignals.add("Template has no trade metadata to confirm the match.")
  }

  if (normalize(jobType) && !normalize(template.job_type) && metadataScore < 5) {
    weakSignals.add("Template has no job type metadata to confirm the match.")
  }

  if (guardPenalty > 0) {
    weakSignals.add("Planting-specific intent was not detected for this maintenance quote.")
  }

  return [...weakSignals].slice(0, 5)
}

function confidenceForScore(
  score: number,
  categoryMatchCount: number,
  keywordMatchCount: number,
  metadataScore: number,
  nameKeywordMatchCount: number,
): TemplateRecommendationConfidence {
  if (score >= HIGH_CONFIDENCE_SCORE && nameKeywordMatchCount >= 1 && categoryMatchCount >= 1 && keywordMatchCount >= 2) return "high"
  if (score >= HIGH_CONFIDENCE_SCORE && categoryMatchCount >= 2 && keywordMatchCount >= 3) return "high"
  if (score >= HIGH_CONFIDENCE_SCORE && metadataScore >= 5 && categoryMatchCount >= 1) return "high"
  if (score >= HIGH_CONFIDENCE_SCORE && metadataScore >= STRONG_CATEGORY_ALIGNMENT_SCORE && keywordMatchCount >= 1) return "high"
  if (score >= MEDIUM_CONFIDENCE_SCORE && categoryMatchCount >= 1 && keywordMatchCount >= 2) return "medium"
  if (score >= MEDIUM_CONFIDENCE_SCORE && metadataScore >= STRONG_CATEGORY_ALIGNMENT_SCORE) return "medium"
  return "low"
}

function detectedReasons({
  facts,
  categoryMatches,
  keywordMatches,
}: {
  facts: QuoteFact[]
  categoryMatches: QuoteFactCategory[]
  keywordMatches: string[]
}) {
  const reasons = new Set<string>()

  for (const category of categoryMatches) {
    reasons.add(categoryLabel(category))
  }

  for (const keyword of keywordMatches.slice(0, 8)) {
    const matchingFact = facts.find((fact) => normalize(fact.description).includes(keyword))
    reasons.add(matchingFact ? conciseFactDescription(matchingFact.description) : keyword)
  }

  return [...reasons].slice(0, 6)
}

function categoryLabel(category: QuoteFactCategory) {
  return CATEGORY_LABELS[category] ?? category.replaceAll("_", " ")
}

function displayTemplateName(template: QuoteTemplateLibraryItem) {
  return template.name || template.template_name || "Untitled template"
}

function reasonForScore(detected: string[]) {
  if (detected.length === 0) return "Matched reviewed template metadata and quote facts."
  return "Detected: " + detected.join(", ") + "."
}

function quoteSearchText(facts: QuoteFact[], trade?: string | null, jobType?: string | null) {
  return [
    trade,
    jobType,
    ...facts
      .filter((fact) =>
        ["job_scope", "labour", "plants", "materials", "waste", "equipment", "optional_works"].includes(fact.category),
      )
      .map((fact) => fact.description),
  ]
    .filter(Boolean)
    .join(" ")
}

function templateSearchText(template: QuoteTemplateLibraryItem, sections: QuoteTemplateSectionDraft[]) {
  return [
    template.name,
    template.template_name,
    template.trade,
    template.job_type,
    template.category,
    template.document_type,
    ...toSearchTextParts(template.common_line_items),
    ...toSearchTextParts(template.default_scope),
    ...toSearchTextParts(template.default_exclusions),
    ...toSearchTextParts(template.default_pricing_structure),
    ...templateContentSearchParts(template.template_content),
    ...templateContentSearchParts(template.metadata),
    template.source_filename,
    template.source_text,
    ...sections.flatMap((section) => [
      section.section_name,
      section.section_category,
      section.raw_text,
      section.template_text,
      section.export_category,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
}

function toSearchTextParts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(toSearchTextParts)
  if (typeof value === "string") return [value]
  if (typeof value === "number" || typeof value === "boolean") return [String(value)]
  if (!value || typeof value !== "object") return []

  return Object.values(value as Record<string, unknown>).flatMap(toSearchTextParts)
}

function templateContentSearchParts(value: unknown): string[] {
  return toSearchTextParts(value)
}

function keywordSet(value: string) {
  const words = normalize(value)
    .split(/\s+/)
    .map((word) => stemKeyword(word.trim()))
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))

  return new Set(words)
}

function stemKeyword(value: string) {
  if (value.endsWith("ing") && value.length > 6) return value.slice(0, -3)
  if (value.endsWith("ies") && value.length > 6) return value.slice(0, -3) + "y"
  if (value.endsWith("es") && value.length > 5) return value.slice(0, -2)
  if (value.endsWith("s") && value.length > 5) return value.slice(0, -1)
  return value
}

function conciseFactDescription(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim()
    .slice(0, 80)
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function quoteDomainFromContext(trade?: string | null, jobType?: string | null): TemplateDomain {
  return canonicalDomain(jobType) ?? canonicalDomain(trade)
}

function templateDomainFromMetadata(template: QuoteTemplateLibraryItem): TemplateDomain {
  return (
    canonicalDomain(template.category) ??
    canonicalDomain(template.job_type) ??
    canonicalDomain(template.trade) ??
    canonicalDomain(template.name) ??
    canonicalDomain(template.template_name)
  )
}

function canonicalDomain(value: string | null | undefined): TemplateDomain {
  const text = normalize(value)
  if (!text) return null
  if (/\b(maintenance|maintain|ongoing garden|garden service|groundskeeping|weeding|pruning)\b/.test(text)) return "maintenance"
  if (/\b(decking|deck)\b/.test(text)) return "decking"
  if (/\b(retaining|retainer)\b/.test(text)) return "retaining"
  if (/\b(planting|plant install|hedge planting|plant supply|supply plants|plants)\b/.test(text)) return "planting"
  return null
}

function hasStrongPlantingSignals(facts: QuoteFact[], quoteText: string) {
  const text = normalize(quoteText)
  const plantFacts = facts
    .filter((fact) => fact.category === "plants")
    .map((fact) => normalize(fact.description))
    .filter(Boolean)

  if (
    plantFacts.length > 0 &&
    plantFacts.every((description) =>
      /\b(plant health|self seeded|self seeded plants?|plant removal|removal of plants?|spraying|spray|herbicide|pruning|weeding|green waste)\b/.test(
        description,
      ),
    )
  ) {
    return false
  }

  const plantingText = [text, ...plantFacts].join(" ")
  const namedPlantMention = /\b(?:ficus tuffi|griselinia|lomandra|corokia|pittosporum|buxus|murraya|lavender|carex)\b/.test(
    plantingText,
  )
  const plantingIntent =
    /\b(supply and install|plant supply|supply plants|install plants|planting area|plant options?|hedge planting|plant out|new hedge|planting labour)\b/.test(
      plantingText,
    )

  return Boolean(
    plantingIntent ||
      /\b\d+\s*(?:x|off)?\s*(?:plants?|trees?|shrubs?|hedges?)\b/.test(plantingText) ||
      (namedPlantMention && /\b(supply|install|planting|plant options?|hedge|new)\b/.test(plantingText)),
  )
}

function hasMaintenanceSignals(value: string) {
  const text = normalize(value)
  return /\b(maintenance|garden maintenance|monthly|regular|weeding|pruning|spraying|herbicide|green waste|greenwaste|plant health|self seeded|tidy)\b/.test(
    text,
  )
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ")
}

function isScoredCategory(value: string): value is QuoteFactCategory {
  return Boolean(CATEGORY_LABELS[value as QuoteFactCategory])
}
