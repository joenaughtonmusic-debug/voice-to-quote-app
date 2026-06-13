import type { ProcessedQuote, QuoteLineItem } from "@/lib/processed-quote"
import { buildTradeQuoteFacts } from "../trades/registry"

export const QUOTE_FACT_CATEGORIES = [
  "customer_details",
  "job_scope",
  "labour",
  "plants",
  "materials",
  "waste",
  "equipment",
  "optional_works",
  "exclusions",
  "terms",
  "site_conditions",
  "internal_notes",
  "missing_information",
  "warnings",
  "generic",
] as const

export type QuoteFactCategory = (typeof QUOTE_FACT_CATEGORIES)[number]

export type QuoteFactConfidence = "high" | "medium" | "low"

export type QuoteFactAmount = {
  quantity?: number | null
  quantityText?: string | null
  unit?: string | null
  unitAmount?: number | null
  totalAmount?: number | null
}

export type QuoteFact = QuoteFactAmount & {
  id: string
  category: QuoteFactCategory
  description: string
  label?: string | null
  sourceField: string
  sourceText?: string | null
  sourceIndex?: number | null
  confidence: QuoteFactConfidence
  customerFacing: boolean
  internalVisible: boolean
  exportable: boolean
  metadata?: Record<string, string | number | boolean | null>
}

export type QuoteFactPlaceholder =
  | "{{customer_name}}"
  | "{{site_address}}"
  | "{{job_scope}}"
  | "{{labour_scope}}"
  | "{{materials_scope}}"
  | "{{waste_scope}}"
  | "{{plant_options}}"
  | "{{exclusions}}"
  | "{{terms}}"

type AddTextFactsOptions = {
  category: QuoteFactCategory
  sourceField: string
  customerFacing: boolean
  internalVisible?: boolean
  exportable?: boolean
  confidence?: QuoteFactConfidence
  categoryResolver?: (text: string) => QuoteFactCategory
  label?: string
  metadata?: Record<string, string | number | boolean | null>
}

const WASTE_PATTERN = /\b(waste|greenwaste|green waste|rubbish|debris|offcuts|spoil|hardfill|tip|disposal|dispose|removal|remove old|cart away)\b/i
const EQUIPMENT_PATTERN = /\b(equipment|hire|machine|machinery|digger|excavator|scaffold|skip bin|trailer|tool hire)\b/i
const MATERIAL_PATTERN = /\b(material|timber|board|boards|concrete|post mix|fixing|hardware|cable|pipe|fitting|paint|mulch|soil|garden mix|plants?|supply)\b/i
const LABOUR_PATTERN = /\b(labour|labor|crew|person|people|days?|hours?|allowance|install time|work time)\b/i
const PLANT_PATTERN = /\b(plants?|planting|hedge|tree|shrub|litre|litres|\b\d+\s*l\b|pot|nursery)\b/i
const WORK_DESCRIPTION_PATTERN = /^\s*(construct|build|install|set out|lay|replace|repair|paint|clean|trim|finish|connect|wire|plumb|fit|assemble|prepare|excavate|remove and replace)\b/i

export function quoteFactsFromProcessedQuote(quote: ProcessedQuote): QuoteFact[] {
  const facts: QuoteFact[] = []

  addSingleFact(facts, {
    category: "customer_details",
    description: quote.client_name,
    label: "Customer name",
    sourceField: "client_name",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
    confidence: quote.client_name ? "high" : "low",
    metadata: { field: "client_name" },
  })

  addSingleFact(facts, {
    category: "customer_details",
    description: quote.site_address,
    label: "Site address",
    sourceField: "site_address",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
    confidence: quote.site_address ? "high" : "low",
    metadata: { field: "site_address" },
  })

  addTextFacts(facts, quote.primary_quote.scope, {
    category: "job_scope",
    sourceField: "primary_quote.scope",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
  })

  addTextFacts(facts, quote.customer_scope, {
    category: "job_scope",
    sourceField: "customer_scope",
    customerFacing: true,
    internalVisible: false,
    exportable: false,
  })

  addTextFacts(facts, quote.primary_quote.notes, {
    category: "site_conditions",
    sourceField: "primary_quote.notes",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
    confidence: "medium",
  })

  quote.optional_quotes.forEach((option, optionIndex) => {
    addTextFacts(facts, option.scope, {
      category: "optional_works",
      sourceField: `optional_quotes.${optionIndex}.scope`,
      customerFacing: true,
      internalVisible: true,
      exportable: false,
      metadata: {
        quote_title: option.quote_title,
        job_type: option.job_type,
      },
    })
  })

  addSingleFact(facts, {
    category: "labour",
    description: quote.labour_allowance,
    label: "Labour allowance",
    sourceField: "labour_allowance",
    customerFacing: false,
    internalVisible: true,
    exportable: false,
    confidence: quote.labour_allowance ? "medium" : "low",
  })

  addTextFacts(facts, quote.materials, {
    category: "materials",
    sourceField: "materials",
    customerFacing: false,
    internalVisible: true,
    exportable: false,
    categoryResolver: categoryForMaterialText,
  })

  addSingleFact(facts, {
    category: "waste",
    description: quote.greenwaste,
    label: "Greenwaste",
    sourceField: "greenwaste",
    customerFacing: false,
    internalVisible: true,
    exportable: false,
    confidence: quote.greenwaste ? "medium" : "low",
  })

  addTextFacts(facts, quote.exclusions, {
    category: "exclusions",
    sourceField: "exclusions",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
  })

  addTextFacts(facts, quote.internal_notes, {
    category: "internal_notes",
    sourceField: "internal_notes",
    customerFacing: false,
    internalVisible: true,
    exportable: false,
    confidence: "medium",
  })

  addTextFacts(facts, quote.follow_up_tasks, {
    category: "internal_notes",
    sourceField: "follow_up_tasks",
    customerFacing: false,
    internalVisible: true,
    exportable: false,
    confidence: "medium",
    label: "Follow-up task",
  })

  addTextFacts(facts, quote.missing_information, {
    category: "missing_information",
    sourceField: "missing_information",
    customerFacing: false,
    internalVisible: true,
    exportable: false,
    confidence: "high",
  })

  addTextFacts(facts, quote.confidence_warnings, {
    category: "warnings",
    sourceField: "confidence_warnings",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
    confidence: "high",
  })

  quote.line_items.forEach((item, index) => {
    const description = item.description || item.item_name || item.item_code
    addSingleFact(facts, {
      category: categoryFromLineItem(item),
      description,
      label: item.item_name || item.item_code || "Line item",
      sourceField: "line_items",
      sourceIndex: index,
      sourceText: description,
      customerFacing: false,
      internalVisible: true,
      exportable: true,
      confidence: lineItemConfidence(item),
      quantity: parseNumericAmount(item.quantity),
      quantityText: item.quantity,
      unit: item.unit || null,
      unitAmount: parseNumericAmount(item.final_rate_used ?? item.override_rate ?? item.knowledge_base_rate ?? item.rate),
      totalAmount: parseNumericAmount(item.total),
      metadata: {
        item_code: item.item_code,
        item_name: item.item_name,
        item_type: item.item_type,
        source_system: item.source_system ?? null,
        account_code: item.account_code ?? item.sales_account_code ?? null,
        tax_type: item.tax_type ?? item.tax_code ?? null,
        needs_review: item.needs_review,
      },
    })
  })

  quote.quote_options?.forEach((option, optionIndex) => {
    addSingleFact(facts, {
      category: categoryFromQuoteOption(option.category),
      description: [option.title, option.description].filter(Boolean).join(" - "),
      label: option.label,
      sourceField: "quote_options",
      sourceIndex: optionIndex,
      customerFacing: true,
      internalVisible: true,
      exportable: false,
      confidence: "high",
      totalAmount: option.subtotal,
      metadata: {
        option_id: option.id,
        option_category: option.category,
        area_label: option.areaLabel ?? null,
        source: option.source,
      },
    })
  })

  facts.push(...buildTradeQuoteFacts(quote))

  return dedupeFacts(facts)
}

function categoryFromQuoteOption(category: string): QuoteFactCategory {
  if (category === "planting") return "plants"
  if (category === "material") return "materials"
  if (category === "labour") return "labour"
  return "optional_works"
}

export function quoteFactsForCategory(facts: QuoteFact[], category: QuoteFactCategory) {
  return facts.filter((fact) => fact.category === category)
}

export function customerFacingQuoteFacts(facts: QuoteFact[]) {
  return facts.filter((fact) => fact.customerFacing)
}

export function exportableQuoteFacts(facts: QuoteFact[]) {
  return facts.filter((fact) => fact.exportable)
}

export function quoteFactText(fact: QuoteFact) {
  return fact.description.trim()
}

export function quoteFactsToPlaceholderValues(facts: QuoteFact[]): Partial<Record<QuoteFactPlaceholder, string>> {
  return {
    "{{customer_name}}": factByMetadataField(facts, "client_name")?.description,
    "{{site_address}}": factByMetadataField(facts, "site_address")?.description,
    "{{job_scope}}": joinFactDescriptions(facts, "job_scope"),
    "{{labour_scope}}": joinFactDescriptions(facts, "labour"),
    "{{materials_scope}}": joinFactDescriptions(facts, "materials"),
    "{{waste_scope}}": joinFactDescriptions(facts, "waste"),
    "{{plant_options}}": joinFactDescriptions(facts, "plants"),
    "{{exclusions}}": joinFactDescriptions(facts, "exclusions"),
    "{{terms}}": joinFactDescriptions(facts, "terms"),
  }
}

export function categoryFromLineItem(item: QuoteLineItem): QuoteFactCategory {
  const text = [item.item_type, item.item_name, item.description].filter(Boolean).join(" ")
  const lowerType = item.item_type.toLowerCase()

  if (lowerType.includes("labour") || lowerType.includes("labor") || LABOUR_PATTERN.test(text)) return "labour"
  if (lowerType.includes("plant") || PLANT_PATTERN.test(text)) return "plants"
  if (WASTE_PATTERN.test(text)) return "waste"
  if (EQUIPMENT_PATTERN.test(text)) return "equipment"
  if (WORK_DESCRIPTION_PATTERN.test(text)) return "job_scope"
  if (lowerType.includes("material") || lowerType.includes("chemical") || MATERIAL_PATTERN.test(text)) return "materials"

  return "generic"
}

export function categoryForMaterialText(text: string): QuoteFactCategory {
  if (WASTE_PATTERN.test(text)) return "waste"
  if (EQUIPMENT_PATTERN.test(text)) return "equipment"
  if (WORK_DESCRIPTION_PATTERN.test(text)) return "job_scope"
  return "materials"
}

export function isQuoteFactCategory(value: string): value is QuoteFactCategory {
  return QUOTE_FACT_CATEGORIES.includes(value as QuoteFactCategory)
}

function addTextFacts(facts: QuoteFact[], values: string[] | undefined, options: AddTextFactsOptions) {
  values?.forEach((value, index) => {
    const description = value.trim()
    if (!description) return

    addSingleFact(facts, {
      category: options.categoryResolver?.(description) ?? options.category,
      description,
      label: options.label ?? null,
      sourceField: options.sourceField,
      sourceIndex: index,
      sourceText: description,
      customerFacing: options.customerFacing,
      internalVisible: options.internalVisible ?? true,
      exportable: options.exportable ?? false,
      confidence: options.confidence ?? "high",
      metadata: options.metadata,
    })
  })
}

function addSingleFact(facts: QuoteFact[], fact: Omit<QuoteFact, "id">) {
  const description = fact.description.trim()
  if (!description) return

  facts.push({
    ...fact,
    id: buildFactId(fact.sourceField, fact.sourceIndex ?? facts.length, description),
    description,
  })
}

function buildFactId(sourceField: string, index: number, description: string) {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)

  return `${sourceField}.${index}.${slug || "fact"}`
}

function dedupeFacts(facts: QuoteFact[]) {
  const seen = new Set<string>()
  return facts.filter((fact) => {
    const key = `${fact.category}:${fact.description.toLowerCase()}:${fact.sourceField}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function lineItemConfidence(item: QuoteLineItem): QuoteFactConfidence {
  const confidence = item.match_confidence.toLowerCase()
  if (confidence.includes("high")) return "high"
  if (confidence.includes("medium")) return "medium"
  if (item.needs_review || item.warning) return "low"
  return "medium"
}

function parseNumericAmount(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (!value) return null

  const match = String(value)
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/)

  if (!match) return null
  const amount = Number(match[0])
  return Number.isFinite(amount) ? amount : null
}

function factByMetadataField(facts: QuoteFact[], field: string) {
  return facts.find((fact) => fact.metadata?.field === field && fact.description.trim())
}

function joinFactDescriptions(facts: QuoteFact[], category: QuoteFactCategory) {
  const text = facts
    .filter((fact) => fact.category === category)
    .map((fact) => fact.description.trim())
    .filter(Boolean)
    .join("\n")

  return text || undefined
}
