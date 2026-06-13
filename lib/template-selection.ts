import { displayTemplateName, type QuoteTemplateLibraryItem } from "./template-import-learning"
import type { QuoteFact } from "./core/quote-facts"
import type { TemplateRecommendation } from "./template-recommendation"

export type TemplateSelectionSource = "manual" | "deterministic" | "existing_quote" | "stale_ai" | "none"

export type TemplateSelectionResolution = {
  templateId: string
  source: TemplateSelectionSource
}

export function resolveInitialTemplateSelection({
  templates,
  selectedTemplateId,
  selectedTemplateName,
  recommendation,
  facts = [],
  jobType,
  trade,
  currentTemplateId,
  currentSource = "none",
}: {
  templates: QuoteTemplateLibraryItem[]
  selectedTemplateId?: string | null
  selectedTemplateName?: string | null
  recommendation?: TemplateRecommendation | null
  facts?: QuoteFact[]
  jobType?: string | null
  trade?: string | null
  currentTemplateId?: string | null
  currentSource?: TemplateSelectionSource
}) {
  return resolveTemplateSelection({
    templates,
    selectedTemplateId,
    selectedTemplateName,
    recommendation,
    facts,
    jobType,
    trade,
    currentTemplateId,
    currentSource,
  }).templateId
}

export function resolveTemplateSelection({
  templates,
  selectedTemplateId,
  selectedTemplateName,
  recommendation,
  facts = [],
  jobType,
  trade,
  currentTemplateId,
  currentSource = "none",
}: {
  templates: QuoteTemplateLibraryItem[]
  selectedTemplateId?: string | null
  selectedTemplateName?: string | null
  recommendation?: TemplateRecommendation | null
  facts?: QuoteFact[]
  jobType?: string | null
  trade?: string | null
  currentTemplateId?: string | null
  currentSource?: TemplateSelectionSource
}): TemplateSelectionResolution {
  if (currentSource === "manual") {
    return {
      templateId: currentTemplateId ?? "",
      source: "manual",
    }
  }

  if (recommendation?.template.id) {
    return {
      templateId: recommendation.template.id,
      source: "deterministic",
    }
  }

  const selectedFromQuote =
    templates.find((template) => template.id === selectedTemplateId) ??
    templates.find(
      (template) =>
        selectedTemplateName &&
        displayTemplateName(template).toLowerCase() === selectedTemplateName.toLowerCase(),
    )

  if (!selectedFromQuote) {
    return {
      templateId: "",
      source: "none",
    }
  }

  if (isStaleAiSelection({ template: selectedFromQuote, facts, jobType, trade })) {
    return {
      templateId: "",
      source: "stale_ai",
    }
  }

  return {
    templateId: selectedFromQuote.id,
    source: "existing_quote",
  }
}

function isStaleAiSelection({
  template,
  facts,
  jobType,
  trade,
}: {
  template: QuoteTemplateLibraryItem
  facts: QuoteFact[]
  jobType?: string | null
  trade?: string | null
}) {
  const quoteDomain = domainFromText([jobType, trade, ...facts.map((fact) => fact.description)].join(" "))
  const templateDomain = domainFromText(
    [template.category, template.trade, template.job_type, template.template_name, template.name].join(" "),
  )

  return quoteDomain === "maintenance" && templateDomain === "planting" && !hasStrongPlantingEvidence(facts)
}

function hasStrongPlantingEvidence(facts: QuoteFact[]) {
  const text = facts.map((fact) => `${fact.category} ${fact.description}`).join(" ").toLowerCase()
  return /\b(supply\s+and\s+install|plant\s+supply|supply\s+plants|install\s+plants|hedge\s+planting|planting\s+area|plant\s+options?|new\s+hedge)\b/.test(
    text,
  ) || /\b(plants?)\b.{0,40}\b(\d+\s*(?:x|each|plants?)|25l|45l|14l|litre|liter)\b/.test(text)
}

function domainFromText(value: string) {
  const text = value.toLowerCase().replace(/[^a-z0-9]+/g, " ")
  if (/\bmaintenance|garden maintenance|garden tidy|weeding|pruning|greenwaste|green waste|plant health|self seeded\b/.test(text)) {
    return "maintenance"
  }
  if (/\bplanting|plant supply|supply plants|install plants|hedge planting|plant options|ficus|griselinia|lomandra\b/.test(text)) {
    return "planting"
  }
  if (/\bdecking|deck\b/.test(text)) return "decking"
  if (/\bretaining\b/.test(text)) return "retaining"
  return "unknown"
}
