import pdf from "pdf-parse/lib/pdf-parse.js"
import { NextResponse } from "next/server"
import { createAuthedSupabaseClient, getBearerToken } from "@/lib/api-auth"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const ANALYSIS_MODEL = process.env.OPENAI_QUOTE_ANALYSIS_MODEL ?? "gpt-4o-mini"
const QUOTE_EXAMPLES_BUCKET = "quote-examples"
const UNREADABLE_PDF_ERROR = "Could not extract readable text from this PDF. Scanned/image PDFs are not supported yet."

export const runtime = "nodejs"

type KnowledgeDocumentType =
  | "quote_template"
  | "materials_price_list"
  | "plant_list"
  | "supplier_catalogue"
  | "terms_conditions"
  | "common_exclusions"
  | "historical_quote_example"

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tone_analysis: { type: "string" },
    common_sections: { type: "array", items: { type: "string" } },
    repeated_exclusions: { type: "array", items: { type: "string" } },
    pricing_layout: { type: "string" },
    common_materials_plants_tools: { type: "array", items: { type: "string" } },
    suggested_reusable_template_wording: { type: "array", items: { type: "string" } },
    trade_vocabulary_terms: { type: "array", items: { type: "string" } },
    reusable_customer_wording: { type: "array", items: { type: "string" } },
    pricing_rules_detected: { type: "array", items: { type: "string" } },
    common_line_items: { type: "array", items: { type: "string" } },
    exclusions_and_conditions: { type: "array", items: { type: "string" } },
    quote_template_suggestions: { type: "array", items: { type: "string" } },
    ai_prompt_rules: { type: "array", items: { type: "string" } },
    document_type: { type: "string" },
    template_name: { type: "string" },
    category: { type: "string" },
    standard_customer_wording: { type: "array", items: { type: "string" } },
    inclusions: { type: "array", items: { type: "string" } },
    internal_notes: { type: "array", items: { type: "string" } },
    materials_price_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item_name: { type: "string" },
          category: { type: "string" },
          unit: { type: "string" },
          cost_price: { type: "string" },
          sell_price: { type: "string" },
          notes: { type: "string" },
        },
        required: ["item_name", "category", "unit", "cost_price", "sell_price", "notes"],
      },
    },
    plant_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          plant_name: { type: "string" },
          pot_size: { type: "string" },
          spacing: { type: "string" },
          price: { type: "string" },
          notes: { type: "string" },
        },
        required: ["plant_name", "pot_size", "spacing", "price", "notes"],
      },
    },
    terms_conditions: { type: "array", items: { type: "string" } },
    common_exclusion_clauses: { type: "array", items: { type: "string" } },
  },
  required: [
    "tone_analysis",
    "common_sections",
    "repeated_exclusions",
    "pricing_layout",
    "common_materials_plants_tools",
    "suggested_reusable_template_wording",
    "trade_vocabulary_terms",
    "reusable_customer_wording",
    "pricing_rules_detected",
    "common_line_items",
    "exclusions_and_conditions",
    "quote_template_suggestions",
    "ai_prompt_rules",
    "document_type",
    "template_name",
    "category",
    "standard_customer_wording",
    "inclusions",
    "internal_notes",
    "materials_price_items",
    "plant_items",
    "terms_conditions",
    "common_exclusion_clauses",
  ],
}

const templateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    template_name: { type: "string" },
    category: { type: "string" },
    document_type: { type: "string" },
    variables: {
      type: "object",
      additionalProperties: false,
      properties: {
        client_name: { type: "string" },
        site_address: { type: "string" },
        quote_date: { type: "string" },
        expiry_date: { type: "string" },
        frequency: { type: "string" },
        price_or_estimate_range: { type: "string" },
        optional_variables: { type: "array", items: { type: "string" } },
      },
      required: [
        "client_name",
        "site_address",
        "quote_date",
        "expiry_date",
        "frequency",
        "price_or_estimate_range",
        "optional_variables",
      ],
    },
    standard_scope: { type: "array", items: { type: "string" } },
    standard_inclusions: { type: "array", items: { type: "string" } },
    standard_exclusions: { type: "array", items: { type: "string" } },
    pricing_rules: { type: "array", items: { type: "string" } },
    estimate_wording: { type: "array", items: { type: "string" } },
    customer_wording: { type: "array", items: { type: "string" } },
    internal_notes: { type: "array", items: { type: "string" } },
    site_specific_notes: { type: "array", items: { type: "string" } },
    materials_or_line_items: { type: "array", items: { type: "string" } },
    trade_vocabulary: { type: "array", items: { type: "string" } },
    terms_conditions: { type: "array", items: { type: "string" } },
    ai_prompt_rules: { type: "array", items: { type: "string" } },
  },
  required: [
    "template_name",
    "category",
    "document_type",
    "variables",
    "standard_scope",
    "standard_inclusions",
    "standard_exclusions",
    "pricing_rules",
    "estimate_wording",
    "customer_wording",
    "internal_notes",
    "site_specific_notes",
    "materials_or_line_items",
    "trade_vocabulary",
    "terms_conditions",
    "ai_prompt_rules",
  ],
}

type UploadedQuoteExample = {
  id: string
  user_id: string
  file_name: string
  storage_path: string | null
  document_type: KnowledgeDocumentType | string | null
}

type FailureStage =
  | "storage_download"
  | "pdf_text_extraction"
  | "pdf_text_cleaning"
  | "readable_text_validation"
  | "openai_analysis"
  | "database_update"

type TemplateSchema = {
  template_name: string
  category: string
  document_type: string
  variables: {
    client_name: string
    site_address: string
    quote_date: string
    expiry_date: string
    frequency: string
    price_or_estimate_range: string
    optional_variables: string[]
  }
  standard_scope: string[]
  standard_inclusions: string[]
  standard_exclusions: string[]
  pricing_rules: string[]
  estimate_wording: string[]
  customer_wording: string[]
  internal_notes: string[]
  site_specific_notes: string[]
  materials_or_line_items: string[]
  trade_vocabulary: string[]
  terms_conditions: string[]
  ai_prompt_rules: string[]
}

function getOutputText(result: any) {
  if (typeof result?.output_text === "string") return result.output_text

  for (const item of result?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text
      }
    }
  }

  return null
}

function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] ?? ""
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " "))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

async function extractTextFromPdf(bytes: Buffer) {
  const parsed = await pdf(bytes)
  return normalizeExtractedText(parsed.text ?? "")
}

function isReadableExtractedText(text: string, documentType: KnowledgeDocumentType) {
  const compactText = text.replace(/\s+/g, " ").trim()
  const isQuoteTemplate = documentType === "quote_template"
  if (compactText.length < (isQuoteTemplate ? 30 : 50)) return false

  const asciiPrintableCount = (compactText.match(/[A-Za-z0-9\s.,;:!?'"()[\]/&$%#@+-]/g) ?? []).length
  const letterCount = (compactText.match(/[A-Za-z]/g) ?? []).length
  const wordCount = (compactText.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) ?? []).length
  const suspiciousCharacters = (compactText.match(/[�\u0000-\u001f]/g) ?? []).length
  const templateStructureHits = (
    compactText.match(/\b(service|scope|pricing|price|notes?|greenwaste|estimate|included|exclusions?|conditions?)\b/gi) ?? []
  ).length

  if (asciiPrintableCount / compactText.length < 0.6) return false
  if (suspiciousCharacters > Math.max(3, Math.floor(compactText.length * 0.02))) return false

  if (isQuoteTemplate) {
    if (letterCount >= 15 && wordCount >= 4 && templateStructureHits >= 1) return true
    if (letterCount >= 35 && wordCount >= 8) return true
    return false
  }

  if (letterCount < 25) return false
  if (wordCount < 6) return false

  return true
}

function logAnalysisDebug({
  fileName,
  fileType,
  extractedText,
  documentType,
  failedStage,
}: {
  fileName: string
  fileType: string
  extractedText: string
  documentType: KnowledgeDocumentType
  failedStage: FailureStage
}) {
  console.log("[analyse-uploaded-quote] PDF analysis debug", {
    file_name: fileName,
    file_type: fileType,
    extracted_text_length: extractedText.length,
    extracted_text_preview: extractedText.slice(0, 1000),
    document_type: documentType,
    failed_stage: failedStage,
  })
}

function cleanExtractedPdfText(text: string, documentType: KnowledgeDocumentType) {
  const normalizedText = normalizeExtractedText(text)
  const lines = normalizedText.split("\n")
  const occurrenceCounts = new Map<string, number>()

  for (const line of lines) {
    const key = line.toLowerCase()
    occurrenceCounts.set(key, (occurrenceCounts.get(key) ?? 0) + 1)
  }

  const cleanedLines = lines
    .map((line) => line.trim())
    .filter((line) => {
      const lowerLine = line.toLowerCase()
      const occurrenceCount = occurrenceCounts.get(lowerLine) ?? 0

      if (occurrenceCount > 2 && line.length < 90) return false
      if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(line)) return false
      if (/^(quote\s*)?(no\.?|number|ref|reference)\s*[:#]?\s*[a-z0-9-]+$/i.test(line)) return false
      if (/^(date|quote date|gst no|gst number|abn)\s*[:#]/i.test(line)) return false
      if (/^(www\.|https?:\/\/|phone|email)\b/i.test(line)) return false

      return true
    })

  const joinedLines = cleanedLines.join("\n")
  const withSpacedHeadings = joinedLines
    .replace(/([a-z])([A-Z][a-z])/g, "$1 $2")
    .replace(/\b(Scope|Inclusions|Exclusions|Conditions|Notes|Pricing|Frequency|Maintenance|Labour|Greenwaste|Hardfill|GST|Total)(?=[A-Z])/g, "$1\n")
    .replace(/([.!?])(?=[A-Z][a-z])/g, "$1 ")
    .replace(/\b(Quote|Invoice|Estimate)(No|Number|Date)\b/gi, "$1 $2")
    .replace(/\b(GST)(Included|Exclusive|Number|No)\b/gi, "$1 $2")

  const cleanedText = normalizeExtractedText(withSpacedHeadings)
  if (documentType !== "quote_template") return cleanedText

  return cleanedText
    .replace(/\b(client|customer|name)\s*[:\-]\s*[A-Z][A-Za-z .'-]{2,}/gi, "$1: {client_name}")
    .replace(/\b(site|property|address)\s*[:\-]\s*[^\n]+/gi, "$1: {site_address}")
    .replace(/\b(quote date|date)\s*[:\-]\s*[^\n]+/gi, "$1: {quote_date}")
    .replace(/\b(expiry|valid until|valid to)\s*[:\-]\s*[^\n]+/gi, "$1: {expiry_date}")
    .replace(/\b(quote|estimate)\s*(no|number|ref|reference)\s*[:#\-]?\s*[A-Za-z0-9-]+/gi, "$1 $2: {quote_reference}")
    .replace(/\$\s?\d[\d,]*(?:\.\d{2})?(?:\s?-\s?\$?\d[\d,]*(?:\.\d{2})?)?/g, "{price_or_estimate_range}")
}

function hasPopulatedAnalysisSummary(analysis: any) {
  return (
    typeof analysis?.tone_analysis === "string" &&
    analysis.tone_analysis.trim().length > 0 &&
    Array.isArray(analysis.common_sections) &&
    Array.isArray(analysis.repeated_exclusions) &&
    typeof analysis.pricing_layout === "string" &&
    analysis.pricing_layout.trim().length > 0 &&
    Array.isArray(analysis.common_materials_plants_tools) &&
    Array.isArray(analysis.suggested_reusable_template_wording) &&
    Array.isArray(analysis.trade_vocabulary_terms) &&
    Array.isArray(analysis.reusable_customer_wording) &&
    Array.isArray(analysis.pricing_rules_detected) &&
    Array.isArray(analysis.common_line_items) &&
    Array.isArray(analysis.exclusions_and_conditions) &&
    Array.isArray(analysis.quote_template_suggestions) &&
    Array.isArray(analysis.ai_prompt_rules) &&
    typeof analysis.document_type === "string" &&
    typeof analysis.template_name === "string" &&
    typeof analysis.category === "string" &&
    Array.isArray(analysis.standard_customer_wording) &&
    Array.isArray(analysis.inclusions) &&
    Array.isArray(analysis.internal_notes) &&
    Array.isArray(analysis.materials_price_items) &&
    Array.isArray(analysis.plant_items) &&
    Array.isArray(analysis.terms_conditions) &&
    Array.isArray(analysis.common_exclusion_clauses)
  )
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

function looksSiteSpecific(value: string) {
  return /\b(special focus|focus on|watch for|avoid|do not|don't|access|gate|dog|client asked|customer asked|at this site|oxalis)\b/i.test(
    value,
  )
}

function looksLikeServiceTask(value: string) {
  return /\b(tidy|clean|clear|weed|spray|prune|trim|mow|edge|blow|remove|load|cart|dispose|spread|mulch|plant)\b/i.test(
    value,
  )
}

function looksLikeServiceDescription(value: string) {
  return /\b(service|tidy|maintenance|garden|property|section|clean[- ]?up|scope|work areas|greenwaste)\b/i.test(
    value,
  )
}

function isGstOrTotalOnly(value: string) {
  return /\b(gst|total|subtotal)\b/i.test(value) && !looksLikeServiceDescription(value)
}

function normalizePrices(value: string) {
  return value
    .replace(/\$\s?\[[^\]]*price[^\]]*\]/gi, "{price_or_estimate_range}")
    .replace(/\[[^\]]*price[^\]]*\]/gi, "{price_or_estimate_range}")
    .replace(/\$\s?x\b/gi, "{price_or_estimate_range}")
    .replace(/\bprice\s*[:=]\s*x\b/gi, "price: {price_or_estimate_range}")
    .replace(/\$\s?\d[\d,]*(?:\.\d{2})?(?:\s?-\s?\$?\d[\d,]*(?:\.\d{2})?)?/g, "{price_or_estimate_range}")
}

function isRecurringTemplate(analysis: TemplateSchema) {
  const haystack = [
    analysis.template_name,
    analysis.category,
    ...stringArray(analysis.standard_scope),
    ...stringArray(analysis.standard_inclusions),
    ...stringArray(analysis.pricing_rules),
    ...stringArray(analysis.estimate_wording),
    ...stringArray(analysis.customer_wording),
    ...stringArray(analysis.ai_prompt_rules),
  ]
    .join(" ")
    .toLowerCase()

  if (/\b(one[- ]?off|one off|single visit|initial tidy|once[- ]?off)\b/.test(haystack)) return false
  return /\b(recurring|regular|ongoing|maintenance|subscription|weekly|fortnightly|monthly|three[- ]?monthly|two[- ]?monthly|quarterly|per visit|frequency)\b/.test(
    haystack,
  )
}

function extractTradeVocabularyFromTemplate(analysis: TemplateSchema) {
  const haystack = [
    analysis.template_name,
    ...stringArray(analysis.standard_scope),
    ...stringArray(analysis.standard_inclusions),
    ...stringArray(analysis.pricing_rules),
    ...stringArray(analysis.estimate_wording),
    ...stringArray(analysis.customer_wording),
    ...stringArray(analysis.materials_or_line_items),
  ]
    .join(" ")
    .toLowerCase()

  const candidates = [
    ["one-off tidy", /\b(one[- ]?off|one off).*\b(tidy|garden tidy|property tidy)\b|\b(tidy|garden tidy|property tidy).*\b(one[- ]?off|one off)\b/],
    ["overgrowth", /\bovergrowth\b/],
    ["trimming", /\b(trimming|trim|pruning|prune)\b/],
    ["weeding", /\b(weeding|weed|weeds)\b/],
    ["greenwaste", /\b(greenwaste|green waste)\b/],
    ["site conditions", /\b(site conditions|conditions|variables involved|access|terrain)\b/],
    ["garden areas", /\b(garden areas|garden beds|work areas|garden|gardens)\b/],
    ["estimate wording", /\b(estimate|estimated|not a fixed quote|variables involved)\b/],
    ["blow down", /\b(blow down|blower)\b/],
    ["tidy work areas", /\b(tidy work areas|work areas)\b/],
  ] as const

  return candidates.filter(([, pattern]) => pattern.test(haystack)).map(([term]) => term)
}

function cleanupTemplateAnalysis(analysis: TemplateSchema): TemplateSchema {
  const recurringTemplate = isRecurringTemplate(analysis)
  const optionalVariables = stringArray(analysis.variables?.optional_variables).filter((variable) => {
    if (variable === "{frequency}" || variable.toLowerCase() === "frequency") return recurringTemplate
    return true
  })

  const cleaned: TemplateSchema = {
    template_name: analysis.template_name?.trim() || "Quote Template",
    category: analysis.category?.trim() || "custom",
    document_type: "quote_template",
    variables: {
      client_name: analysis.variables?.client_name || "{client_name}",
      site_address: analysis.variables?.site_address || "{site_address}",
      quote_date: analysis.variables?.quote_date || "{quote_date}",
      expiry_date: analysis.variables?.expiry_date || "{expiry_date}",
      frequency: recurringTemplate ? analysis.variables?.frequency || "{frequency}" : "",
      price_or_estimate_range: analysis.variables?.price_or_estimate_range || "{price_or_estimate_range}",
      optional_variables: optionalVariables,
    },
    standard_scope: stringArray(analysis.standard_scope).map(normalizePrices),
    standard_inclusions: stringArray(analysis.standard_inclusions).map(normalizePrices),
    standard_exclusions: stringArray(analysis.standard_exclusions).map(normalizePrices),
    pricing_rules: stringArray(analysis.pricing_rules).map(normalizePrices),
    estimate_wording: stringArray(analysis.estimate_wording).map(normalizePrices),
    customer_wording: stringArray(analysis.customer_wording).map(normalizePrices).filter((item) => !isGstOrTotalOnly(item)),
    internal_notes: stringArray(analysis.internal_notes),
    site_specific_notes: stringArray(analysis.site_specific_notes),
    materials_or_line_items: stringArray(analysis.materials_or_line_items).map(normalizePrices),
    trade_vocabulary: stringArray(analysis.trade_vocabulary),
    terms_conditions: stringArray(analysis.terms_conditions),
    ai_prompt_rules: stringArray(analysis.ai_prompt_rules),
  }

  if (cleaned.standard_scope.length === 0) {
    const serviceWording = cleaned.customer_wording.filter(looksLikeServiceDescription)
    cleaned.standard_scope = serviceWording.slice(0, 3)
  }

  if (cleaned.standard_inclusions.length === 0) {
    cleaned.standard_inclusions = [...cleaned.standard_scope, ...cleaned.customer_wording]
      .filter(looksLikeServiceTask)
      .slice(0, 8)
  }

  const exclusionsToKeep: string[] = []
  for (const exclusion of cleaned.standard_exclusions) {
    if (looksSiteSpecific(exclusion)) {
      cleaned.site_specific_notes.push(exclusion)
    } else {
      exclusionsToKeep.push(exclusion)
    }
  }
  cleaned.standard_exclusions = exclusionsToKeep

  const serviceTasksFromExclusions = cleaned.standard_exclusions.filter(looksLikeServiceTask)
  if (serviceTasksFromExclusions.length > 0) {
    cleaned.standard_inclusions = [...cleaned.standard_inclusions, ...serviceTasksFromExclusions]
    cleaned.standard_exclusions = cleaned.standard_exclusions.filter((item) => !looksLikeServiceTask(item))
  }

  cleaned.trade_vocabulary = Array.from(
    new Set([...cleaned.trade_vocabulary, ...extractTradeVocabularyFromTemplate(cleaned)]),
  )

  cleaned.ai_prompt_rules = [
    ...cleaned.ai_prompt_rules,
    "Use this template's standard scope as the starting customer-facing service description when the template is selected.",
    "Keep uploaded site-specific notes out of default customer wording unless the new transcript repeats them.",
    "Replace customer names, addresses, dates, frequencies, and one-off prices with current transcript details or variables.",
  ]

  return cleaned
}

function hasPopulatedTemplateAnalysis(analysis: any): analysis is TemplateSchema {
  return (
    analysis &&
    typeof analysis.template_name === "string" &&
    typeof analysis.category === "string" &&
    typeof analysis.document_type === "string" &&
    analysis.variables &&
    typeof analysis.variables === "object" &&
    Array.isArray(analysis.variables.optional_variables) &&
    Array.isArray(analysis.standard_scope) &&
    Array.isArray(analysis.standard_inclusions) &&
    Array.isArray(analysis.standard_exclusions) &&
    Array.isArray(analysis.pricing_rules) &&
    Array.isArray(analysis.estimate_wording) &&
    Array.isArray(analysis.customer_wording) &&
    Array.isArray(analysis.internal_notes) &&
    Array.isArray(analysis.site_specific_notes) &&
    Array.isArray(analysis.materials_or_line_items) &&
    Array.isArray(analysis.trade_vocabulary) &&
    Array.isArray(analysis.terms_conditions) &&
    Array.isArray(analysis.ai_prompt_rules)
  )
}

function getTemplateSchemaIssues(analysis: any) {
  const issues: string[] = []
  const stringFields = ["template_name", "category", "document_type"]
  const arrayFields = [
    "standard_scope",
    "standard_inclusions",
    "standard_exclusions",
    "pricing_rules",
    "estimate_wording",
    "customer_wording",
    "internal_notes",
    "site_specific_notes",
    "materials_or_line_items",
    "trade_vocabulary",
    "terms_conditions",
    "ai_prompt_rules",
  ]

  for (const field of stringFields) {
    if (typeof analysis?.[field] !== "string") issues.push(`${field}: expected string`)
  }

  if (!analysis?.variables || typeof analysis.variables !== "object") {
    issues.push("variables: expected object")
  } else {
    for (const field of ["client_name", "site_address", "quote_date", "expiry_date", "frequency", "price_or_estimate_range"]) {
      if (typeof analysis.variables[field] !== "string") issues.push(`variables.${field}: expected string`)
    }
    if (!Array.isArray(analysis.variables.optional_variables)) {
      issues.push("variables.optional_variables: expected array")
    }
  }

  for (const field of arrayFields) {
    if (!Array.isArray(analysis?.[field])) issues.push(`${field}: expected array`)
  }

  return issues
}

function getNormalizedDocumentType(documentType: UploadedQuoteExample["document_type"]): KnowledgeDocumentType {
  if (
    documentType === "quote_template" ||
    documentType === "materials_price_list" ||
    documentType === "plant_list" ||
    documentType === "supplier_catalogue" ||
    documentType === "terms_conditions" ||
    documentType === "common_exclusions" ||
    documentType === "historical_quote_example"
  ) {
    return documentType
  }

  return "historical_quote_example"
}

function getDocumentTypeInstruction(documentType: KnowledgeDocumentType) {
  switch (documentType) {
    case "quote_template":
      return `This is a Quote Template upload. Analyse it as a reusable quote template. Extract template_name, category, standard customer wording, inclusions, exclusions, pricing rules, internal notes, trade vocabulary, and future AI prompt rules. Use category as one of: maintenance, landscaping, decking, hedge, planting, custom. Populate template-related fields strongly. Also populate empty arrays for unrelated materials/plants fields if not present.

Quote Template PDFs can be short and simple. Do not require quote number, client name, totals, GST, or detailed line items. If the source only has headings such as Service, Pricing, Notes, Greenwaste terms, or Estimate wording, treat those as valid reusable template structure. Analyse:
- Service as the reusable scope/service type.
- Pricing as pricing rules or variables.
- Notes as customer wording, internal notes, exclusions, or conditions depending on wording.
- Greenwaste terms as waste/pricing rules and trade vocabulary.
- Estimate wording as reusable pricing caveat language.

When converting this source document into reusable template content, replace specific customer/job details with variables:
- customer name -> {client_name}
- property/site address -> {site_address}
- quote date -> {quote_date}
- expiry date or quote-valid-until date -> {expiry_date}
- maintenance frequency or visit cadence -> {frequency}
- quoted price, estimate range, subtotal, or total -> {price_or_estimate_range}
- quote number/reference -> {quote_reference}

Do not hardcode names, addresses, dates, quote numbers, or one-off prices into reusable_customer_wording, standard_customer_wording, suggested_reusable_template_wording, quote_template_suggestions, ai_prompt_rules, or template_name unless the document explicitly marks them as standard defaults. Preserve the wording structure but use placeholders for those details.`
    case "materials_price_list":
      return "This is a Materials / Price List upload. Extract materials_price_items with item_name, category, unit, cost_price, sell_price, and notes where available. Store pricing and vocabulary knowledge. Do not frame it as a quote template unless the document explicitly contains quote wording."
    case "plant_list":
      return "This is a Plant List upload. Extract plant_items with plant_name, pot_size, spacing, price, and notes where available. Include plant names and horticultural terms in trade_vocabulary_terms. Do not create quote-template wording unless present."
    case "supplier_catalogue":
      return "This is a Supplier Catalogue upload. Extract catalogue items into materials_price_items, including categories, units, prices, and notes where available. Include supplier/product vocabulary. Do not create a quote template."
    case "terms_conditions":
      return "This is a Terms & Conditions upload. Extract payment terms, deposits, exclusions, client responsibilities, validity period, and reusable customer-facing clauses into terms_conditions, exclusions_and_conditions, and standard_customer_wording."
    case "common_exclusions":
      return "This is a Common Exclusions upload. Extract reusable exclusion clauses into common_exclusion_clauses, exclusions_and_conditions, repeated_exclusions, and ai_prompt_rules. Prefer exact clauses."
    case "historical_quote_example":
      return "This is a Historical Quote Example upload. Extract reusable quote wording, pricing rules, exclusions, common line items, trade vocabulary, suggested templates, and future AI prompt rules from the historical quote."
  }
}

function inferTemplateCategory(analysis: any) {
  const haystack = [
    analysis.template_name,
    ...(Array.isArray(analysis.trade_vocabulary_terms) ? analysis.trade_vocabulary_terms : []),
    ...(Array.isArray(analysis.common_line_items) ? analysis.common_line_items : []),
    ...(Array.isArray(analysis.quote_template_suggestions) ? analysis.quote_template_suggestions : []),
  ]
    .join(" ")
    .toLowerCase()

  if (haystack.includes("deck") || haystack.includes("timber") || haystack.includes("pergola")) return "decking"
  if (haystack.includes("hedge") || haystack.includes("trim") || haystack.includes("pruning")) return "hedge"
  if (haystack.includes("plant") || haystack.includes("mulch") || haystack.includes("soil")) return "planting"
  if (haystack.includes("landscap") || haystack.includes("paver") || haystack.includes("aggregate")) return "landscaping"
  if (haystack.includes("maintenance") || haystack.includes("tidy") || haystack.includes("greenwaste")) return "maintenance"

  return "custom"
}

async function createTemplateFromAnalysis({
  supabase,
  userId,
  sourceId,
  analysis,
}: {
  supabase: ReturnType<typeof createAuthedSupabaseClient>
  userId: string
  sourceId: string
  analysis: any
}) {
  const { data: existingTemplate } = await supabase
    .from("quote_templates")
    .select("id")
    .eq("source_uploaded_quote_example_id", sourceId)
    .eq("user_id", userId)
    .maybeSingle()

  if (existingTemplate?.id) return null

  const { error } = await supabase.from("quote_templates").insert({
    user_id: userId,
    template_name: analysis.template_name || analysis.quote_template_suggestions?.[0] || "Knowledge Template",
    category: analysis.category || inferTemplateCategory(analysis),
    default_scope: analysis.standard_customer_wording?.length
      ? analysis.standard_customer_wording
      : analysis.reusable_customer_wording,
    default_exclusions: analysis.exclusions_and_conditions,
    default_pricing_structure: [...analysis.pricing_rules_detected, ...analysis.common_line_items],
    template_content: analysis,
    source_uploaded_quote_example_id: sourceId,
  })

  return error
}

function joinSpecific(items: unknown, fallback: string) {
  if (!Array.isArray(items)) return fallback

  const values = items.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  return values.length > 0 ? values.join("; ") : fallback
}

function buildFailureSummary(
  stage: FailureStage,
  errorMessage: string,
  debugTextPreview?: string,
  extractedTextLength = 0,
  cleanedTextPreview = "",
  details?: Record<string, unknown>,
) {
  return {
    failed_stage: stage,
    error_message: errorMessage,
    debug_text_preview: debugTextPreview?.slice(0, 500) ?? "",
    extracted_text_length: extractedTextLength,
    cleaned_text_preview: cleanedTextPreview.slice(0, 500),
    ...(details ? { details } : {}),
  }
}

async function failAnalysis({
  supabase,
  id,
  userId,
  stage,
  errorMessage,
  status,
  debugTextPreview,
  extractedTextLength,
  cleanedTextPreview,
  details,
}: {
  supabase: ReturnType<typeof createAuthedSupabaseClient>
  id: string
  userId: string
  stage: FailureStage
  errorMessage: string
  status: number
  debugTextPreview?: string
  extractedTextLength?: number
  cleanedTextPreview?: string
  details?: Record<string, unknown>
}) {
  const failureSummary = buildFailureSummary(
    stage,
    errorMessage,
    debugTextPreview,
    extractedTextLength,
    cleanedTextPreview,
    details,
  )

  console.error("[analyse-uploaded-quote] analysis failure", failureSummary)

  await supabase
    .from("uploaded_quote_examples")
    .update({
      ai_analysis_status: "failed",
      analysis_summary: failureSummary,
    })
    .eq("id", id)
    .eq("user_id", userId)

  return NextResponse.json(
    {
      error: errorMessage,
      failed_stage: stage,
      error_message: errorMessage,
      debug_text_preview: failureSummary.debug_text_preview,
      extracted_text_length: failureSummary.extracted_text_length,
      cleaned_text_preview: failureSummary.cleaned_text_preview,
      details: failureSummary.details,
    },
    { status },
  )
}

async function markAnalysing(supabase: ReturnType<typeof createAuthedSupabaseClient>, id: string, userId: string) {
  return supabase
    .from("uploaded_quote_examples")
    .update({ ai_analysis_status: "analysing" })
    .eq("id", id)
    .eq("user_id", userId)
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 })
  }

  const accessToken = getBearerToken(request)
  if (!accessToken) {
    return NextResponse.json({ error: "Authentication token is required." }, { status: 401 })
  }

  const supabase = createAuthedSupabaseClient(accessToken)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken)

  if (userError || !user) {
    return NextResponse.json({ error: userError?.message ?? "Authenticated user was not found." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const uploadedQuoteExampleId =
    typeof body?.uploaded_quote_example_id === "string" ? body.uploaded_quote_example_id.trim() : ""

  if (!uploadedQuoteExampleId) {
    return NextResponse.json({ error: "uploaded_quote_example_id is required." }, { status: 400 })
  }

  const { data: example, error: exampleError } = await supabase
    .from("uploaded_quote_examples")
    .select("id, user_id, file_name, storage_path, document_type")
    .eq("id", uploadedQuoteExampleId)
    .eq("user_id", user.id)
    .single<UploadedQuoteExample>()

  if (exampleError || !example) {
    return NextResponse.json({ error: exampleError?.message ?? "Knowledge upload was not found." }, { status: 404 })
  }

  let stage: FailureStage = "storage_download"
  let extractedText = ""
  let cleanedText = ""
  const documentType = getNormalizedDocumentType(example.document_type)
  let fileType = getFileExtension(example.file_name) || "unknown"

  try {
    const { error: analysingError } = await markAnalysing(supabase, example.id, user.id)
    if (analysingError) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage: "database_update",
        errorMessage: `Could not start knowledge upload analysis: ${analysingError.message}`,
        status: 500,
      })
    }

    if (!example.storage_path) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage: "storage_download",
        errorMessage: "Knowledge upload does not have a storage path.",
        status: 400,
      })
    }

    const extension = getFileExtension(example.file_name)
    fileType = extension || "unknown"
    if (extension === "doc" || extension === "docx") {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage: "pdf_text_extraction",
        errorMessage: "DOC and DOCX knowledge analysis is not supported yet. Upload a PDF for analysis.",
        status: 415,
      })
    }

    if (extension !== "pdf") {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage: "pdf_text_extraction",
        errorMessage: "Only PDF knowledge analysis is supported right now.",
        status: 415,
      })
    }

    stage = "storage_download"
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(QUOTE_EXAMPLES_BUCKET)
      .download(example.storage_path)

    if (downloadError || !fileBlob) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage,
        errorMessage: downloadError?.message ?? "Could not download knowledge upload.",
        status: 500,
      })
    }
    fileType = fileBlob.type || extension || "unknown"

    stage = "pdf_text_extraction"
    try {
      extractedText = await extractTextFromPdf(Buffer.from(await fileBlob.arrayBuffer()))
    } catch (error) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage,
        errorMessage: error instanceof Error ? error.message : "PDF text extraction failed.",
        status: 500,
      })
    }

    stage = "readable_text_validation"
    stage = "pdf_text_cleaning"
    cleanedText = cleanExtractedPdfText(extractedText, documentType)

    stage = "readable_text_validation"
    logAnalysisDebug({
      fileName: example.file_name,
      fileType,
      extractedText,
      documentType,
      failedStage: stage,
    })

    if (!isReadableExtractedText(extractedText, documentType) && !isReadableExtractedText(cleanedText, documentType)) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage,
        errorMessage: UNREADABLE_PDF_ERROR,
        status: 422,
        debugTextPreview: extractedText,
        extractedTextLength: extractedText.length,
        cleanedTextPreview: cleanedText,
      })
    }

    if (documentType === "quote_template") {
      stage = "openai_analysis"
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ANALYSIS_MODEL,
          input: [
            {
              role: "system",
              content: `You extract strict reusable Quote Template data for a NZ gardening and property maintenance quote-writing app.

Return only JSON matching the strict TemplateSchema. Do not return generic uploaded quote analysis fields.

Classification rules:
- standard_scope: The broad service description. This is high priority and must be populated from service description text.
- standard_inclusions: Tasks normally included in this template.
- standard_exclusions: Work not included. Do not put service tasks here.
- pricing_rules: How pricing should be treated, including estimate range, variable pricing, greenwaste, GST, optional work.
- estimate_wording: Any wording that explains estimate vs fixed quote.
- customer_wording: Reusable customer-facing wording.
- internal_notes: Notes useful for the business but not normally customer-facing.
- site_specific_notes: Details specific to the original job/customer that should not become default template content.
- materials_or_line_items: Reusable materials, service items, labour sections, waste items, or optional extras.
- trade_vocabulary: Relevant trade terms, plants, materials, tools, services.
- terms_conditions: Payment terms, deposits, progress payments, access, validity, ownership, client responsibilities.
- ai_prompt_rules: Rules to apply when this template is used later.

Strict rules:
- Do not hardcode customer names, addresses, quote numbers, dates, or one-off prices into reusable template fields.
- Convert customer/job details into variables: {client_name}, {site_address}, {quote_date}, {expiry_date}, {frequency}, {price_or_estimate_range}.
- Put additional detected placeholders in variables.optional_variables.
- Put job-specific instructions such as "special focus on Oxalis" into site_specific_notes, not exclusions.
- Do not treat service tasks as exclusions.
- Do not ignore short templates.
- Do not require line items, quote numbers, GST, totals, client names, or addresses for a valid template.
- If the source has Service, Pricing, Notes, Greenwaste terms, or Estimate wording, treat it as a valid reusable template.
- The service description is high priority and must become standard_scope and customer_wording when reusable.
- If a clause is only about GST/total and not a service description, do not make it the main customer_wording.
- Use plain NZ gardening/property maintenance wording.
- Do not invent missing content.`,
            },
            {
              role: "user",
              content: `Extract a strict reusable Quote Template from this cleaned PDF text:\n\n${cleanedText.slice(0, 24000)}\n\nRaw extracted text preview:\n${extractedText.slice(0, 1500)}`,
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "strict_quote_template_analysis",
              strict: true,
              schema: templateSchema,
            },
          },
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof result?.error?.message === "string" ? result.error.message : "OpenAI quote template extraction failed."
        const details = {
          failure_type: "openai_http_error",
          http_status: response.status,
          openai_response_body: result,
          model_name: ANALYSIS_MODEL,
          extracted_text_length: extractedText.length,
          cleaned_text_preview: cleanedText.slice(0, 1000),
        }

        console.error("[analyse-uploaded-quote] OpenAI quote template extraction failed", details)

        return failAnalysis({
          supabase,
          id: example.id,
          userId: user.id,
          stage,
          errorMessage: message,
          status: response.status,
          debugTextPreview: extractedText,
          extractedTextLength: extractedText.length,
          cleanedTextPreview: cleanedText,
          details,
        })
      }

      const outputText = getOutputText(result)
      if (!outputText) {
        const details = {
          failure_type: "missing_model_output",
          http_status: response.status,
          openai_response_body: result,
          model_name: ANALYSIS_MODEL,
          extracted_text_length: extractedText.length,
          cleaned_text_preview: cleanedText.slice(0, 1000),
        }

        return failAnalysis({
          supabase,
          id: example.id,
          userId: user.id,
          stage,
          errorMessage: "OpenAI did not return strict quote template JSON.",
          status: 502,
          debugTextPreview: extractedText,
          extractedTextLength: extractedText.length,
          cleanedTextPreview: cleanedText,
          details,
        })
      }

      let templateAnalysis: any
      try {
        templateAnalysis = JSON.parse(outputText)
      } catch (error) {
        const details = {
          failure_type: "json_parse_failed",
          http_status: response.status,
          model_name: ANALYSIS_MODEL,
          model_output_preview: outputText.slice(0, 1000),
          extracted_text_length: extractedText.length,
          cleaned_text_preview: cleanedText.slice(0, 1000),
        }

        console.error("[analyse-uploaded-quote] strict quote template JSON parse failed", details)

        return failAnalysis({
          supabase,
          id: example.id,
          userId: user.id,
          stage,
          errorMessage: `json_parse_failed: ${error instanceof Error ? error.message : "Could not parse strict quote template JSON."}`,
          status: 502,
          debugTextPreview: extractedText,
          extractedTextLength: extractedText.length,
          cleanedTextPreview: cleanedText,
          details,
        })
      }

      if (!hasPopulatedTemplateAnalysis(templateAnalysis)) {
        const schemaIssues = getTemplateSchemaIssues(templateAnalysis)
        const details = {
          failure_type: "schema_validation_failed",
          missing_or_invalid_fields: schemaIssues,
          model_name: ANALYSIS_MODEL,
          extracted_text_length: extractedText.length,
          cleaned_text_preview: cleanedText.slice(0, 1000),
          model_output_preview: outputText.slice(0, 1000),
        }

        console.error("[analyse-uploaded-quote] strict quote template schema validation failed", details)

        return failAnalysis({
          supabase,
          id: example.id,
          userId: user.id,
          stage,
          errorMessage: `schema_validation_failed: ${schemaIssues.join("; ") || "OpenAI returned an incomplete strict quote template."}`,
          status: 502,
          debugTextPreview: extractedText,
          extractedTextLength: extractedText.length,
          cleanedTextPreview: cleanedText,
          details,
        })
      }

      const cleanedTemplateAnalysis = {
        ...cleanupTemplateAnalysis(templateAnalysis),
        extracted_text_length: extractedText.length,
        cleaned_text_preview: cleanedText.slice(0, 500),
      }

      stage = "database_update"
      const { error: updateError } = await supabase
        .from("uploaded_quote_examples")
        .update({
          document_type: documentType,
          extracted_text: extractedText,
          analysis_summary: cleanedTemplateAnalysis,
          tone_analysis: "Strict quote template preview ready for review.",
          extracted_exclusions: cleanedTemplateAnalysis.standard_exclusions,
          suggested_rules: {
            document_type: documentType,
            strict_template_schema: true,
            extracted_text_length: extractedText.length,
            cleaned_text_preview: cleanedText.slice(0, 500),
            pricing_rules: cleanedTemplateAnalysis.pricing_rules,
            estimate_wording: cleanedTemplateAnalysis.estimate_wording,
            ai_prompt_rules: cleanedTemplateAnalysis.ai_prompt_rules,
          },
          ai_analysis_status: "completed",
        })
        .eq("id", example.id)
        .eq("user_id", user.id)

      if (updateError) {
        return failAnalysis({
          supabase,
          id: example.id,
          userId: user.id,
          stage,
          errorMessage: `Could not save strict quote template preview: ${updateError.message}`,
          status: 500,
          debugTextPreview: extractedText,
          extractedTextLength: extractedText.length,
          cleanedTextPreview: cleanedText,
        })
      }

      return NextResponse.json({ analysis: cleanedTemplateAnalysis, template_created: false })
    }

    stage = "openai_analysis"
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        input: [
          {
            role: "system",
            content: `You analyse uploaded Knowledge Base documents for a NZ gardening and property maintenance quote-writing app.

Source document type: ${documentType}
${getDocumentTypeInstruction(documentType)}

Your job is to extract practical reusable business knowledge, not generic descriptions.

Return only JSON matching the schema. Be specific. Prefer exact phrases from the quote where possible. Do not invent details that are not supported by the document text.

If the source document is a Quote Template upload, convert one-off customer/job details into reusable variables before returning template wording:
- Use {client_name} for customer names.
- Use {site_address} for property or site addresses.
- Use {quote_date} for quote dates.
- Use {expiry_date} for expiry/valid-until dates.
- Use {frequency} for maintenance frequency or cadence.
- Use {price_or_estimate_range} for one-off quoted prices, totals, or estimate ranges.
- Use {quote_reference} for quote numbers or references.
Do not hardcode names, addresses, dates, quote numbers, or one-off prices in reusable template outputs unless they are explicitly standard defaults.

The View Analysis UI will display these exact headings, so populate the matching schema fields as practical bullet points:
- "Reusable wording found" = reusable_customer_wording
- "Pricing rules detected" = pricing_rules_detected
- "Default exclusions/conditions" = exclusions_and_conditions
- "Common line items" = common_line_items
- "Trade vocabulary" = trade_vocabulary_terms
- "Suggested quote templates" = quote_template_suggestions
- "Rules to apply to future AI quote drafts" = ai_prompt_rules

Do not return generic phrases like "professional and straightforward" unless they are supported by exact wording from the quote.

For reusable_customer_wording:
- Extract customer-facing phrases that could be reused in future quotes.
- Prefer exact wording from the document.
- Include exact phrases such as "Blow down and tidy work areas", "This is an estimate not a fixed quote due to the amount of variables involved in these kinds of jobs", and "Not included in quote only as reference" when present.
- Do not summarise these as tone. Capture the reusable sentence or phrase.

For pricing_rules_detected:
- Extract rules implied by the quote layout and pricing treatment.
- Look for estimate ranges, separate waste lines, optional extras, $0.00 optional labour, deposits, GST wording, variables, and assumptions.
- Use practical rule language.
- Examples: "One-off property tidy quotes can use labour estimate ranges", "Greenwaste is listed separately", "Hardfill/general waste is listed separately", "Optional labour can be shown as $0.00 when excluded from total", "GST is included in total".

For common_line_items:
- Extract reusable quote line item labels exactly or near-exactly.
- Examples: Labour, Greenwaste, General Waste / hardfill, Optional Labour.

For exclusions_and_conditions and repeated_exclusions:
- Extract exact exclusions, conditions, assumptions, estimate caveats, disposal caveats, access conditions, and optional-extra conditions where possible.

For trade_vocabulary_terms:
- Include plants, materials, waste types, tools, timber, aggregates, service phrases, pricing phrases, and quote layout terms.
- Include terms like greenwaste, hardfill, general waste, blow down, property tidy, garden tidy, mulch, bark, soil, compost, timber, sleepers, pavers, aggregate, gravel, scoria, topsoil, pruning, hedge trim, weed spray if present or strongly implied by the quote.

For quote_template_suggestions:
- Suggest reusable template types based on this quote only.
- Examples: "One-off property tidy estimate", "Optional extra section", "Waste disposal separated by type".

For ai_prompt_rules:
- Write rules that can be injected into future voice quote extraction.
- These must be operational instructions for future draft generation.
- Examples: "For property tidy work, use estimate wording instead of fixed-price wording", "Separate greenwaste from general waste/hardfill", "Keep optional extras outside the total unless the user says they are included", "Include blow down/tidy work areas when the transcript mentions a tidy or clean-up".
- For Quote Template uploads, include a rule to replace customer-specific values with variables such as {client_name}, {site_address}, {quote_date}, {expiry_date}, {frequency}, and {price_or_estimate_range}.

For tone_analysis:
- Write one concise but specific sentence describing the quote style, pricing caveats, and customer wording style.
- Avoid generic phrases like "professional and straightforward" unless tied to specific observed wording.

For suggested_reusable_template_wording:
- Include short snippets that could be copied into future quote sections.

For pricing_layout:
- Summarise the pricing layout specifically: estimate vs fixed, line item grouping, waste separation, optional extras, totals, GST if present.

For common_materials_plants_tools:
- Include only concrete materials, plants, waste categories, tools, and service actions found or strongly implied.`,
          },
          {
            role: "user",
            content: `Analyse this uploaded ${documentType} document text. The text was extracted from a PDF and cleaned for common extraction issues. It may still have imperfect line breaks or missing spaces, so infer headings and clauses carefully from context. Focus on reusable template wording, variables, standard inclusions, exclusions/conditions, site-specific notes, and pricing/frequency variables for Quote Template uploads.\n\nCleaned text:\n${cleanedText.slice(0, 24000)}\n\nRaw extracted text preview for debugging/context:\n${extractedText.slice(0, 1500)}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "uploaded_quote_example_analysis",
            strict: true,
            schema: analysisSchema,
          },
        },
      }),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        typeof result?.error?.message === "string" ? result.error.message : "OpenAI knowledge analysis failed."

      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage,
        errorMessage: message,
        status: response.status,
        debugTextPreview: extractedText,
        extractedTextLength: extractedText.length,
        cleanedTextPreview: cleanedText,
      })
    }

    const outputText = getOutputText(result)
    if (!outputText) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage,
        errorMessage: "OpenAI did not return knowledge analysis JSON.",
        status: 502,
        debugTextPreview: extractedText,
        extractedTextLength: extractedText.length,
        cleanedTextPreview: cleanedText,
      })
    }

    let analysis: any
    try {
      analysis = JSON.parse(outputText)
    } catch (error) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage: "openai_analysis",
        errorMessage: error instanceof Error ? error.message : "Could not parse OpenAI knowledge analysis JSON.",
        status: 502,
        debugTextPreview: extractedText,
        extractedTextLength: extractedText.length,
        cleanedTextPreview: cleanedText,
      })
    }

    if (!hasPopulatedAnalysisSummary(analysis)) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage,
        errorMessage: "OpenAI returned an incomplete knowledge analysis.",
        status: 502,
        debugTextPreview: extractedText,
        extractedTextLength: extractedText.length,
        cleanedTextPreview: cleanedText,
      })
    }

    const suggestedRules = {
      document_type: documentType,
      extracted_text_length: extractedText.length,
      cleaned_text_preview: cleanedText.slice(0, 500),
      concise_pricing_rules: joinSpecific(analysis.pricing_rules_detected, analysis.pricing_layout),
      concise_prompt_rules: joinSpecific(analysis.ai_prompt_rules, "No prompt rules detected."),
      concise_template_suggestions: joinSpecific(
        analysis.quote_template_suggestions,
        "No reusable quote template suggestions detected.",
      ),
      common_sections: analysis.common_sections,
      pricing_layout: analysis.pricing_layout,
      common_materials_plants_tools: analysis.common_materials_plants_tools,
      suggested_reusable_template_wording: analysis.suggested_reusable_template_wording,
      trade_vocabulary_terms: analysis.trade_vocabulary_terms,
      reusable_customer_wording: analysis.reusable_customer_wording,
      pricing_rules_detected: analysis.pricing_rules_detected,
      common_line_items: analysis.common_line_items,
      quote_template_suggestions: analysis.quote_template_suggestions,
      ai_prompt_rules: analysis.ai_prompt_rules,
    }

    stage = "database_update"
    const { error: updateError } = await supabase
      .from("uploaded_quote_examples")
      .update({
        document_type: documentType,
        extracted_text: extractedText,
        analysis_summary: {
          ...analysis,
          document_type: documentType,
          extracted_text_length: extractedText.length,
          cleaned_text_preview: cleanedText.slice(0, 500),
        },
        tone_analysis: analysis.tone_analysis,
        extracted_exclusions: analysis.exclusions_and_conditions,
        suggested_rules: suggestedRules,
        ai_analysis_status: "completed",
      })
      .eq("id", example.id)
      .eq("user_id", user.id)

    if (updateError) {
      return failAnalysis({
        supabase,
        id: example.id,
        userId: user.id,
        stage,
        errorMessage: `Could not save knowledge analysis: ${updateError.message}`,
        status: 500,
        debugTextPreview: extractedText,
        extractedTextLength: extractedText.length,
        cleanedTextPreview: cleanedText,
      })
    }

    return NextResponse.json({ analysis: { ...analysis, document_type: documentType }, template_created: false })
  } catch (error) {
    logAnalysisDebug({
      fileName: example.file_name,
      fileType,
      extractedText,
      documentType,
      failedStage: stage,
    })

    return failAnalysis({
      supabase,
      id: example.id,
      userId: user.id,
      stage,
      errorMessage: error instanceof Error ? error.message : "Unexpected knowledge analysis error.",
      status: 500,
      debugTextPreview: extractedText,
      extractedTextLength: extractedText.length,
      cleanedTextPreview: cleanedText,
    })
  }
}
