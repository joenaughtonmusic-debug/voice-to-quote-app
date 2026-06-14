import { NextResponse } from "next/server"
import { z } from "zod"
import { extractAddressDetails, formatAddressForQuote, type AddressExtractionResult } from "@/lib/address-extraction"
import { extractClientNameFromTranscript } from "@/lib/client-name-extraction"
import {
  calculatePlantingQuote,
  extractPlantCalculatorRequestsFromText,
  type PlantCalculatorRequest,
  type PlantCalculatorResult,
} from "@/lib/calculators/planting"
import { isTruePlantCatalogItem } from "@/lib/plant-item-classification"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "@/lib/plants"
import { parseJsonWithRepair } from "@/lib/quote-json-repair"
import { isPrimaryTrade, type PrimaryTrade } from "@/lib/trade-profile"
import { hasPlantingCalculatorIntent } from "@/lib/trades/planting/intent"
import { quoteOptionsFromPlantCalculatorResults } from "@/lib/trades/planting/quote-options"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const QUOTE_MODEL = process.env.OPENAI_QUOTE_MODEL ?? "gpt-4o-mini"
const QUOTE_EXTRACTION_TIMEOUT_MS = 45000

type QuoteSpecialist =
  | "maintenance"
  | "one_off_tidy"
  | "landscaping"
  | "decking"
  | "planting"
  | "hedge_trimming"
  | "electrical"
  | "building"
  | "plumbing"
  | "painting"
  | "cleaning"
  | "arborist"
  | "general"

type LeadDetails = {
  client_name: string | null
  site_address: string | null
  suburb_locality: string | null
  address: AddressExtractionResult
  confidence: "high" | "medium" | "low"
  missing_fields: string[]
}

type QuoteClassification = { specialist: QuoteSpecialist; reason: string }

type QuoteExtractionContext = {
  transcript: string
  templateContext: unknown[]
  knowledgeItemContext: unknown[]
  primaryTrade: PrimaryTrade
  leadDetails: LeadDetails
  classification: QuoteClassification
  specialistInstructions: string
}

type QuoteExtractionAttempt = {
  quote: z.infer<typeof processedQuoteSchema>
  elapsedMs: number
  promptLength: number
  responseLength: number
  reliabilityMetric: "first_pass_success" | "repaired_success" | "retry_success"
}

const classificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    specialist: {
      type: "string",
      enum: [
        "maintenance",
        "one_off_tidy",
        "landscaping",
        "decking",
        "planting",
        "hedge_trimming",
        "electrical",
        "building",
        "plumbing",
        "painting",
        "cleaning",
        "arborist",
        "general",
      ],
    },
    reason: { type: "string" },
  },
  required: ["specialist", "reason"],
}

const quoteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    client_name: { type: "string" },
    site_address: { type: "string" },
    quote_title: { type: "string" },
    job_type: { type: "string" },
    selected_template_id: { type: "string" },
    selected_template_name: { type: "string" },
    template_match_confidence: { type: "string" },
    learned_rules_applied: { type: "array", items: { type: "string" } },
    primary_quote: {
      type: "object",
      additionalProperties: false,
      properties: {
        quote_title: { type: "string" },
        job_type: { type: "string" },
        scope: { type: "array", items: { type: "string" } },
        cadence: { type: "string" },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["quote_title", "job_type", "scope", "cadence", "notes"],
    },
    optional_quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quote_title: { type: "string" },
          job_type: { type: "string" },
          scope: { type: "array", items: { type: "string" } },
          cadence: { type: "string" },
          notes: { type: "array", items: { type: "string" } },
        },
        required: ["quote_title", "job_type", "scope", "cadence", "notes"],
      },
    },
    customer_scope: { type: "array", items: { type: "string" } },
    internal_notes: { type: "array", items: { type: "string" } },
    labour_allowance: { type: "string" },
    materials: { type: "array", items: { type: "string" } },
    greenwaste: { type: "string" },
    exclusions: { type: "array", items: { type: "string" } },
    follow_up_tasks: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
    confidence_warnings: { type: "array", items: { type: "string" } },
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item_code: { type: "string" },
          item_name: { type: "string" },
          item_type: { type: "string" },
          description: { type: "string" },
          quantity: { type: ["string", "null"] },
          unit: { type: "string" },
          rate: { type: ["string", "null"] },
          knowledge_base_rate: { type: ["string", "null"] },
          override_rate: { type: ["string", "null"] },
          final_rate_used: { type: ["string", "null"] },
          total: { type: ["string", "null"] },
          match_confidence: { type: "string" },
          match_reason: { type: "string" },
          needs_review: { type: "boolean" },
          warning: { type: "string" },
        },
        required: [
          "item_code",
          "item_name",
          "item_type",
          "description",
          "quantity",
          "unit",
          "rate",
          "knowledge_base_rate",
          "override_rate",
          "final_rate_used",
          "total",
          "match_confidence",
          "match_reason",
          "needs_review",
          "warning",
        ],
      },
    },
  },
  required: [
    "client_name",
    "site_address",
    "quote_title",
    "job_type",
    "selected_template_id",
    "selected_template_name",
    "template_match_confidence",
    "learned_rules_applied",
    "primary_quote",
    "optional_quotes",
    "customer_scope",
    "internal_notes",
    "labour_allowance",
    "materials",
    "greenwaste",
    "exclusions",
    "follow_up_tasks",
    "missing_information",
    "confidence_warnings",
    "line_items",
  ],
}

const quoteLineItemSchema = z.object({
  source_item_id: z.string().optional(),
  source_system: z.string().optional(),
  item_code: z.string(),
  item_name: z.string(),
  item_type: z.string(),
  description: z.string(),
  quantity: z.string().nullable(),
  unit: z.string(),
  rate: z.string().nullable(),
  knowledge_base_rate: z.string().nullable(),
  override_rate: z.string().nullable(),
  final_rate_used: z.string().nullable(),
  total: z.string().nullable(),
  account_code: z.string().optional(),
  sales_account_code: z.string().optional(),
  tax_code: z.string().optional(),
  tax_type: z.string().optional(),
  gst_rate: z.number().nullable().optional(),
  match_confidence: z.string(),
  match_reason: z.string(),
  needs_review: z.boolean(),
  warning: z.string(),
})

const quoteOptionSchema = z.object({
  quote_title: z.string(),
  job_type: z.string(),
  scope: z.array(z.string()),
  cadence: z.string(),
  notes: z.array(z.string()),
})

const processedQuoteSchema = z.object({
  client_name: z.string(),
  site_address: z.string(),
  quote_title: z.string(),
  job_type: z.string(),
  selected_template_id: z.string(),
  selected_template_name: z.string(),
  template_match_confidence: z.string(),
  learned_rules_applied: z.array(z.string()),
  primary_quote: quoteOptionSchema,
  optional_quotes: z.array(quoteOptionSchema),
  customer_scope: z.array(z.string()),
  internal_notes: z.array(z.string()),
  labour_allowance: z.string(),
  materials: z.array(z.string()),
  greenwaste: z.string(),
  exclusions: z.array(z.string()),
  follow_up_tasks: z.array(z.string()),
  missing_information: z.array(z.string()),
  confidence_warnings: z.array(z.string()),
  line_items: z.array(quoteLineItemSchema),
})

class QuoteExtractionError extends Error {
  retryable: boolean
  stage: string
  details: Record<string, unknown>

  constructor(message: string, stage: string, retryable: boolean, details: Record<string, unknown> = {}) {
    super(message)
    this.name = "QuoteExtractionError"
    this.stage = stage
    this.retryable = retryable
    this.details = details
  }
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

function getErrorMessage(error: unknown, fallback = "OpenAI quote extraction failed.") {
  return error instanceof Error ? error.message : fallback
}

function getPrimaryTrade(value: unknown): PrimaryTrade {
  return isPrimaryTrade(value) ? value : "multi_trade"
}

function primaryTradeToSpecialist(primaryTrade: PrimaryTrade): QuoteSpecialist {
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

function primaryTradeInstruction(primaryTrade: PrimaryTrade) {
  if (primaryTrade === "multi_trade") {
    return "The user is configured as multi_trade. Classify from transcript/template evidence only."
  }

  return `The user's primary_trade setting is "${primaryTrade}". Use it as a strong signal. If the transcript is ambiguous, default to the matching trade. If the transcript/template clearly describes a different trade, use that clearer trade instead.`
}

function getStringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit)
}

function getTemplateContext(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const template = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
      const id = typeof template.id === "string" ? template.id.trim() : ""
      const templateName = typeof template.template_name === "string" ? template.template_name.trim() : ""
      const category = typeof template.category === "string" ? template.category.trim() : "custom"

      if (!id || !templateName) return null

      return {
        id,
        template_name: templateName,
        category,
        default_scope: getStringArray(template.default_scope),
        default_exclusions: getStringArray(template.default_exclusions),
        default_pricing_structure: getStringArray(template.default_pricing_structure),
        reusable_wording: getStringArray(template.reusable_wording),
        ai_prompt_rules: getStringArray(template.ai_prompt_rules),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function getKnowledgeItemContext(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const knowledgeItem = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
      const itemCode = typeof knowledgeItem.item_code === "string" ? knowledgeItem.item_code.trim() : ""
      const itemName = typeof knowledgeItem.item_name === "string" ? knowledgeItem.item_name.trim() : ""
      const sellPrice =
        knowledgeItem.sell_price === null || knowledgeItem.sell_price === undefined
          ? null
          : Number(knowledgeItem.sell_price)

      if (!itemName) return null

      return {
        source_item_id: typeof knowledgeItem.source_item_id === "string" ? knowledgeItem.source_item_id.trim() : "",
        source_system: typeof knowledgeItem.source_system === "string" ? knowledgeItem.source_system.trim() : "",
        item_code: itemCode,
        item_name: itemName,
        item_type: typeof knowledgeItem.item_type === "string" ? knowledgeItem.item_type.trim() : "other",
        category: typeof knowledgeItem.category === "string" ? knowledgeItem.category.trim() : "",
        description: typeof knowledgeItem.description === "string" ? knowledgeItem.description.trim() : "",
        aliases: getStringArray(knowledgeItem.aliases, 12),
        unit: typeof knowledgeItem.unit === "string" ? knowledgeItem.unit.trim() : "",
        sell_price: sellPrice !== null && Number.isFinite(sellPrice) ? sellPrice : null,
        account_code: typeof knowledgeItem.account_code === "string" ? knowledgeItem.account_code.trim() : "",
        sales_account_code: typeof knowledgeItem.sales_account_code === "string" ? knowledgeItem.sales_account_code.trim() : "",
        tax_code: typeof knowledgeItem.tax_code === "string" ? knowledgeItem.tax_code.trim() : "",
        tax_type: typeof knowledgeItem.tax_type === "string" ? knowledgeItem.tax_type.trim() : "",
        gst_rate: typeof knowledgeItem.gst_rate === "number" && Number.isFinite(knowledgeItem.gst_rate) ? knowledgeItem.gst_rate : null,
        plant_name: typeof knowledgeItem.plant_name === "string" ? knowledgeItem.plant_name.trim() : "",
        plant_size: typeof knowledgeItem.plant_size === "string" ? knowledgeItem.plant_size.trim() : "",
        pot_size: typeof knowledgeItem.pot_size === "string" ? knowledgeItem.pot_size.trim() : "",
        spacing_mm:
          typeof knowledgeItem.spacing_mm === "number" && Number.isFinite(knowledgeItem.spacing_mm)
            ? knowledgeItem.spacing_mm
            : null,
        supplier: typeof knowledgeItem.supplier === "string" ? knowledgeItem.supplier.trim() : "",
        stock_status: typeof knowledgeItem.stock_status === "string" ? knowledgeItem.stock_status.trim() : "",
        notes: typeof knowledgeItem.notes === "string" ? knowledgeItem.notes.trim() : "",
        raw_import:
          knowledgeItem.raw_import && typeof knowledgeItem.raw_import === "object"
            ? knowledgeItem.raw_import
            : null,
        pricing_role:
          knowledgeItem.pricing_role === "pricing_item" ||
          knowledgeItem.pricing_role === "service_description_item" ||
          knowledgeItem.pricing_role === "unknown"
            ? knowledgeItem.pricing_role
            : "unknown",
        pricing_signals: getStringArray(knowledgeItem.pricing_signals, 8),
      }
    })
    .filter(Boolean)
    .slice(0, 80)
}

const streetAddressPattern =
  String.raw`\d{1,5}[A-Za-z]?\s+(?:[A-Za-zāēīōūĀĒĪŌŪ'’-]+\s+){0,6}(?:Road|Rd|Street|St|Drive|Dr|Avenue|Ave|Lane|Ln|Crescent|Cres|Place|Pl|Way|Close|Court|Ct|Terrace|Tce|Parade|Esplanade|Highway|Hwy|View|Rise|Grove|Gardens|Square|Quay|Track|Loop|Mews|Point|Cove)\b(?:,\s*[A-Za-zāēīōūĀĒĪŌŪ'’ -]+)?`

const addressStopWordPattern =
  /\s*,?\s*\b(garden\s+tidy|maintenance|hedge\s+trimming|planting|landscaping|electrical|plumbing|green\s*waste|greenwaste|fertili[sz]er|sprays?|dog|access|wheelbarrow|power\s*points?|powerpoints?|downlights?|buxus|labou?r|hedge|materials?|internal\s+notes?|scope|quote|job|lighting|leds?|tps|cable|conduit|rcd|switchboard)\b.*$/i

function cleanExtractedName(value: string | undefined) {
  if (!value) return null

  const cleaned = value
    .replace(/\b(this|that|quote|job|small|big|new|quick|planting|maintenance|tidy|landscaping|decking|hedge|garden|service|one)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/'s$/i, "")

  if (!cleaned || cleaned.length < 2) return null

  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4)
  if (words.length === 0) return null

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

function cleanExtractedAddress(value: string | undefined) {
  if (!value) return null

  return value
    .replace(addressStopWordPattern, "")
    .replace(/[.,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function extractSuburbLocality(address: string | null, transcript: string) {
  if (address?.includes(",")) {
    const locality = address
      .split(",")
      .slice(1)
      .join(",")
      .replace(addressStopWordPattern, "")
      .trim()

    if (locality) return locality
  }

  const localityMatch = transcript.match(/\b(?:in|at|out\s+in|over\s+in)\s+([A-Z][A-Za-zāēīōūĀĒĪŌŪ'’ -]{2,40})(?:[.,]|\s+(?:for|with|to|and|the|where|who|that)\b|$)/)
  return localityMatch?.[1]?.trim() ?? null
}

function formatLeadSiteAddress(leadDetails: LeadDetails) {
  return formatAddressForQuote(leadDetails.address)
}

function getCorrectionsAppliedText(transcript: string) {
  const match = transcript.match(/Corrections applied:\n([\s\S]*?)(?:\n\nAdded notes:|$)/i)
  return match?.[1]?.trim() ?? ""
}

function getCorrectedValueFromCorrectionLine(line: string) {
  const match = line.match(/->\s*([^(]+)(?:\s*\(|$)/)
  return match?.[1]?.replace(addressStopWordPattern, "").trim().replace(/[.,\s]+$/g, "") ?? null
}

function looksLikeLocality(value: string) {
  return (
    !/\d/.test(value) &&
    value.length >= 3 &&
    value.length <= 60 &&
    /^[A-Za-zāēīōūĀĒĪŌŪ'’ -]+$/.test(value)
  )
}

function applyCorrectedAddressFacts(leadDetails: LeadDetails, transcript: string): LeadDetails {
  const correctionsText = getCorrectionsAppliedText(transcript)
  if (!correctionsText) return leadDetails

  const correctedValues = correctionsText
    .split("\n")
    .map((line) => getCorrectedValueFromCorrectionLine(line))
    .filter((value): value is string => Boolean(value))

  if (correctedValues.length === 0) return leadDetails

  let siteAddress = leadDetails.site_address
  let suburbLocality = leadDetails.suburb_locality

  for (const value of correctedValues) {
    const addressMatch = value.match(new RegExp(`^${streetAddressPattern}$`, "i"))
    if (addressMatch) {
      siteAddress = cleanExtractedAddress(addressMatch[0])
      continue
    }

    if (looksLikeLocality(value)) {
      suburbLocality = value
    }
  }

  const missingFields = [
    leadDetails.client_name ? "" : "client_name",
    siteAddress ? "" : "site_address",
  ].filter(Boolean)

  return {
    ...leadDetails,
    site_address: siteAddress,
    suburb_locality: suburbLocality,
    missing_fields: missingFields,
    confidence: leadDetails.client_name && siteAddress ? "high" : leadDetails.client_name || siteAddress ? "medium" : "low",
  }
}

function extractLeadDetails(transcript: string): LeadDetails {
  const addressDetails = extractAddressDetails(transcript)
  const addressGroup = `(${streetAddressPattern})`
  const nameGroup = `([A-Za-zāēīōūĀĒĪŌŪ'’.-]+(?:\\s+[A-Za-zāēīōūĀĒĪŌŪ'’.-]+){0,3})`
  const patterns = [
    new RegExp(String.raw`\b(?:quote\s+)?for\s+${nameGroup}\s+at\s+${addressGroup}`, "i"),
    new RegExp(String.raw`\bwent\s+to\s+${nameGroup}'?s?\s+place\s+at\s+${addressGroup}`, "i"),
    new RegExp(String.raw`\bI\s+went\s+and\s+saw\s+${nameGroup}\s+at\s+${addressGroup}`, "i"),
    new RegExp(String.raw`\b${nameGroup}\s+at\s+${addressGroup}`, "i"),
  ]

  let clientName: string | null = null
  let siteAddress: string | null = addressDetails.cleaned_address

  for (const pattern of patterns) {
    const match = transcript.match(pattern)
    if (!match) continue

    clientName = cleanExtractedName(match[1])
    if (clientName || siteAddress) break
  }

  if (!clientName) {
    clientName = extractClientNameFromTranscript(transcript)
  }

  if (!siteAddress) {
    siteAddress = addressDetails.cleaned_address
  }

  const suburbLocality = addressDetails.suburb ?? extractSuburbLocality(siteAddress, transcript)
  const missingFields = [
    clientName ? "" : "client_name",
    siteAddress ? "" : "site_address",
  ].filter(Boolean)
  const confidence = clientName && siteAddress ? "high" : clientName || siteAddress ? "medium" : "low"

  return {
    client_name: clientName,
    site_address: siteAddress,
    suburb_locality: suburbLocality,
    address: addressDetails,
    confidence,
    missing_fields: missingFields,
  }
}

function getFallbackTemplate(templateContext: unknown[], classification: QuoteClassification | null) {
  const specialist = classification?.specialist?.replace(/_/g, " ").toLowerCase() ?? ""
  const templates = templateContext
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null)

  return (
    templates.find((template) =>
      [template.template_name, template.category]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase()
        .includes(specialist),
    ) ??
    templates[0] ??
    null
  )
}

function fallbackQuote(
  transcript: string,
  leadDetails: LeadDetails,
  classification: QuoteClassification | null,
  errorMessage: string,
  templateContext: unknown[] = [],
) {
  const jobType = classification?.specialist ? classification.specialist.replace(/_/g, " ") : "General"
  const siteAddress = formatLeadSiteAddress(leadDetails)
  const fallbackTemplate = getFallbackTemplate(templateContext, classification)
  const fallbackTemplateName =
    typeof fallbackTemplate?.template_name === "string" ? fallbackTemplate.template_name : ""
  const fallbackTemplateId = typeof fallbackTemplate?.id === "string" ? fallbackTemplate.id : ""
  const missingInformation = [
    leadDetails.client_name ? "" : "Client name not captured",
    siteAddress ? "" : "Site address not captured",
    leadDetails.address.needs_address_confirmation ? "Please confirm site address" : "",
    `AI quote extraction failed: ${errorMessage}`,
  ].filter(Boolean)

  return {
    client_name: leadDetails.client_name ?? "Not captured",
    site_address: siteAddress ?? "Not captured",
    quote_title: "Draft quote needs review",
    job_type: jobType.charAt(0).toUpperCase() + jobType.slice(1),
    selected_template_id: fallbackTemplateId,
    selected_template_name: fallbackTemplateName,
    template_match_confidence: fallbackTemplateName ? "low" : "none",
    learned_rules_applied: [],
    primary_quote: {
      quote_title: "Draft quote needs review",
      job_type: jobType,
      scope: ["Review transcript and complete quote details."],
      cadence: "",
      notes: [],
    },
    optional_quotes: [],
    customer_scope: [],
    internal_notes: [
      `Partial quote fallback used. Reason: ${errorMessage}`,
      `Lead detail confidence: ${leadDetails.confidence}`,
      `Trade classification: ${classification?.specialist ?? "general"} (${classification?.reason ?? "No classification reason"})`,
      fallbackTemplateName ? `Fallback template context: ${fallbackTemplateName}` : "Fallback template context: none selected",
      `Address extraction:\n${JSON.stringify(leadDetails.address, null, 2)}`,
      `Transcript:\n${transcript}`,
    ],
    labour_allowance: "",
    materials: [],
    greenwaste: "",
    exclusions: [],
    follow_up_tasks: [],
    missing_information: missingInformation,
    confidence_warnings: [
      "AI quote extraction failed; partial draft created for manual review.",
      "Review transcript, trade classification, template fit, and line items before sending.",
      ...(leadDetails.address.needs_address_confirmation ? ["Please confirm site address"] : []),
      ...leadDetails.address.address_warnings,
    ],
    line_items: [],
  }
}

function hasLineItemQuantity(item: z.infer<typeof quoteLineItemSchema>) {
  return typeof item.quantity === "string" && item.quantity.trim().length > 0
}

function hasLineItemRate(item: z.infer<typeof quoteLineItemSchema>) {
  const rate = item.final_rate_used ?? item.rate ?? item.knowledge_base_rate ?? item.override_rate
  return typeof rate === "string" && rate.trim().length > 0
}

function transcriptHasPlantRequest(transcript: string) {
  return /\b((?:plant|install|supply\s*(?:&|and)?\s*plant|supply\s*(?:&|and)?\s*install)\s+\d+|planting|hedge\s+plant|hedge\s+plants|shrubs?|trees?|groundcovers?|metres?\s+of\s+[A-Z]?[A-Za-z]+|griselinia|ficus\s+tuffi|lomandra|buxus|pittosporum|flax)\b/i.test(
    transcript,
  )
}

function transcriptExplicitlyMentionsItem(transcript: string, item: z.infer<typeof quoteLineItemSchema>) {
  const transcriptText = normalisePlantText(transcript)
  const exactTerms = [item.item_code, item.item_name, item.description]
    .map(normalisePlantText)
    .filter((term) => term.length >= 4)

  return exactTerms.some((term) => transcriptText.includes(term))
}

function itemLooksLikeChemicalTreatment(item: z.infer<typeof quoteLineItemSchema>) {
  return /\b(chemical|spray|sprays|fertili[sz]er|weedkiller|herbicide|pesticide|fungicide|soap|treatment|mavrik|copper)\b/i.test(
    [item.item_code, item.item_name, item.item_type, item.description, item.match_reason].join(" "),
  )
}

function itemLooksLikePlantLine(item: z.infer<typeof quoteLineItemSchema>) {
  return /\b(plant|plants|hedge plant|shrub|tree|groundcover|griselinia|ficus|lomandra|buxus|pittosporum|flax)\b/i.test(
    [item.item_name, item.item_type, item.description, item.match_reason].join(" "),
  )
}

function enforcePlantCategoryMatching(quote: z.infer<typeof processedQuoteSchema>, transcript: string) {
  if (!transcriptHasPlantRequest(transcript)) return quote

  quote.line_items = quote.line_items.map((item) => {
    const isBadCategoryMatch =
      itemLooksLikeChemicalTreatment(item) &&
      itemLooksLikePlantLine(item) &&
      !transcriptExplicitlyMentionsItem(transcript, item)

    if (!isBadCategoryMatch) return item

    return {
      ...item,
      item_code: "",
      item_name: "Unmatched plant item",
      item_type: "plant",
      description: "Plant request from transcript; no confident plant library match found.",
      rate: null,
      knowledge_base_rate: null,
      final_rate_used: null,
      total: null,
      match_confidence: "none",
      match_reason:
        "Plant request detected, but the matched Knowledge Base item appears to be a chemical/spray/fertiliser/treatment product and was not explicitly mentioned. Left unmatched for review.",
      needs_review: true,
      warning: hasLineItemQuantity(item) ? "Rate missing" : "Quantity and rate missing",
    }
  })

  return quote
}

function transcriptMentionsHourlyLabour(transcript: string) {
  return /\b(hours?|hrs?|hourly|per\s+hour|full\s+day|half\s+day|people\s*(?:for|x|×)\s*\d+\s*days?|visit\s+duration|duration)\b/i.test(
    transcript,
  )
}

function knowledgeItemText(item: Record<string, unknown>) {
  return [
    item.item_code,
    item.item_name,
    item.item_type,
    item.category,
    item.description,
    item.unit,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
    ...(Array.isArray(item.pricing_signals) ? item.pricing_signals : []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase()
}

type LabourTradeContext =
  | "maintenance"
  | "landscaping"
  | "building"
  | "electrical"
  | "plumbing"
  | "painting"
  | "cleaning"
  | "arborist"
  | "generic"

function getLabourTradeContext(transcript: string, classification: QuoteClassification): LabourTradeContext {
  const text = `${classification.specialist} ${classification.reason} ${transcript}`.toLowerCase()

  if (/\b(electrical|power\s*points?|powerpoints?|downlights?|switchboard|tps|conduit|cable|rcd|lighting|led|certificate\s+of\s+compliance|coc)\b/.test(text)) {
    return "electrical"
  }

  if (/\b(plumbing|plumber|pipe|pipes|drain|drainage|tap|toilet|mixer|hot\s+water|wastewater|stormwater)\b/.test(text)) {
    return "plumbing"
  }

  if (
    classification.specialist === "planting" ||
    transcriptMentionsHedgePlanting(transcript) ||
    /\b(landscap|retaining|paving|pathways?|decking|deck|planting|hedge\s+planting|construction-style|excavat|basecourse|scoria|drainage\s+coil|geotextile|timber|concrete|pebbles?|weed\s*mat)\b/.test(text)
  ) {
    return "landscaping"
  }

  if (/\b(arborist|tree\s+removal|tree\s+work|stump|chipper|rigging|climbing)\b/.test(text)) {
    return "arborist"
  }

  if (/\b(building|builder|framing|cladding|posts?|bearers?|joists?)\b/.test(text)) {
    return "building"
  }

  if (/\b(maintenance|garden\s+maintenance|monthly|two-monthly|fortnightly|recurring|regular\s+service|visit\s+duration)\b/.test(text)) {
    return "maintenance"
  }

  if (/\b(painting|paint|primer|topcoat|undercoat|prep)\b/.test(text)) return "painting"
  if (/\b(cleaning|clean|wash|sanitise|sanitize)\b/.test(text)) return "cleaning"

  return "generic"
}

function labourTradePattern(trade: LabourTradeContext) {
  switch (trade) {
    case "landscaping":
      return /\b(landscap(?:e|ing)?|landscape\s*labou?r|landscaping\s*labou?r|construction\s*labou?r|hardscape|retaining|paving|planting|decking|arborist|tree)\b/i
    case "maintenance":
      return /\b(garden\s+maintenance|maintenance\s*labou?r|garden\s*labou?r|gardening\s*labou?r|labou?rhrs?|hourly\s*labou?r|labou?r\s*hours?)\b/i
    case "building":
      return /\b(build(?:er|ing)?\s*labou?r|construction\s*labou?r|carpentry\s*labou?r|decking\s*labou?r)\b/i
    case "electrical":
      return /\b(electrical\s*labou?r|electrician|sparky|call\s*out)\b/i
    case "plumbing":
      return /\b(plumbing\s*labou?r|plumber|drainlayer|call\s*out)\b/i
    case "painting":
      return /\b(painting\s*labou?r|painter)\b/i
    case "cleaning":
      return /\b(cleaning\s*labou?r|cleaner)\b/i
    case "arborist":
      return /\b(arborist\s*labou?r|tree\s*labou?r|landscap(?:e|ing)?\s*labou?r|construction\s*labou?r|climber|grounds?man|crew)\b/i
    case "generic":
      return /\b(hourly\s+labou?r|labou?r\s+hours?|labou?rhrs?|labou?r)\b/i
  }
}

function itemHasLabourType(item: Record<string, unknown>, trade: LabourTradeContext) {
  if (trade === "generic") return false
  return labourTradePattern(trade).test(knowledgeItemText(item))
}

function itemHasAnySpecificLabourType(item: Record<string, unknown>) {
  const text = knowledgeItemText(item)
  return [
    "maintenance",
    "landscaping",
    "building",
    "electrical",
    "plumbing",
    "painting",
    "cleaning",
    "arborist",
  ].some((trade) => labourTradePattern(trade as LabourTradeContext).test(text))
}

function exactLabourAliasMatchScore(item: Record<string, unknown>, transcript: string) {
  const text = transcript.toLowerCase()
  const terms = [
    item.item_code,
    item.item_name,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
  ].filter((value): value is string => typeof value === "string" && /\blabou?r|hours?|hrs?|electrician|plumber|painter|cleaner|arborist|landscap/i.test(value))

  return terms.some((term) => text.includes(term.toLowerCase())) ? 100 : 0
}

function labourItemScore(
  item: Record<string, unknown>,
  transcript: string,
  labourTrade: LabourTradeContext,
  tradeSpecificLabourExists: boolean,
) {
  const text = knowledgeItemText(item)
  const itemType = typeof item.item_type === "string" ? item.item_type.toLowerCase() : ""
  if (itemType !== "labour" && !/\blabou?r\b/i.test(text)) return Number.NEGATIVE_INFINITY

  const hasTargetTrade = itemHasLabourType(item, labourTrade)
  const hasDifferentTrade = labourTrade !== "generic" && itemHasAnySpecificLabourType(item) && !hasTargetTrade
  const genericLabour = !itemHasAnySpecificLabourType(item)
  const categoryMatches = labourTrade !== "generic" && labourTradePattern(labourTrade).test(String(item.category ?? ""))
  const hourlySignals = hasHourlyLabourSignals(item)

  return (
    exactLabourAliasMatchScore(item, transcript) +
    (hasTargetTrade ? 50 : 0) +
    (hasTargetTrade ? 25 : 0) +
    (categoryMatches ? 10 : 0) +
    (hourlySignals ? 8 : 0) +
    (typeof item.sell_price === "number" ? 4 : 0) +
    (hasDifferentTrade ? -50 : 0) +
    (genericLabour && tradeSpecificLabourExists ? -25 : 0)
  )
}

function hasHourlyLabourSignals(item: Record<string, unknown>) {
  const text = knowledgeItemText(item)
  const itemType = typeof item.item_type === "string" ? item.item_type.toLowerCase() : ""
  const unit = typeof item.unit === "string" ? item.unit.toLowerCase() : ""

  return (
    itemType === "labour" &&
    (/\b(labou?r\s*(hours?|hrs?)|hourly\s+labou?r|labou?r\s+amount|labou?rhrs?|hours?)\b/i.test(text) ||
      /\b(hr|hrs|hour|hours)\b/i.test(unit))
  )
}

function hasLabourSignals(item: z.infer<typeof quoteLineItemSchema>) {
  const text = [item.item_code, item.item_name, item.description, item.match_reason].join(" ").toLowerCase()
  return item.item_type.toLowerCase() === "labour" || /\blabou?r\b/i.test(text)
}

function hasBroadLabourSignals(item: z.infer<typeof quoteLineItemSchema>) {
  const text = [item.item_code, item.item_name, item.description, item.match_reason].join(" ").toLowerCase()
  return (
    item.item_type.toLowerCase() === "labour" &&
    !/\b(labou?r\s*(hours?|hrs?)|hourly\s+labou?r|labou?r\s+amount|labou?rhrs?|hours?)\b/i.test(text)
  )
}

function findBestLabourItem(
  knowledgeItemContext: unknown[],
  transcript: string,
  classification: QuoteClassification,
) {
  const labourTrade = getLabourTradeContext(transcript, classification)
  const labourItems = knowledgeItemContext
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null)
    .filter((item) => {
      const text = knowledgeItemText(item)
      const itemType = typeof item.item_type === "string" ? item.item_type.toLowerCase() : ""
      return itemType === "labour" || /\blabou?r\b/i.test(text)
    })

  const tradeSpecificLabourExists = labourTrade !== "generic" && labourItems.some((item) => itemHasLabourType(item, labourTrade))

  return labourItems
    .map((item) => ({
      item,
      score: labourItemScore(item, transcript, labourTrade, tradeSpecificLabourExists),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)[0]?.item
}

function preferTradeAwareLabourLineItems(
  quote: z.infer<typeof processedQuoteSchema>,
  transcript: string,
  knowledgeItemContext: unknown[],
  classification: QuoteClassification,
) {
  const hasHourlyContext = transcriptMentionsHourlyLabour(transcript)
  const labourTrade = getLabourTradeContext(transcript, classification)
  if (!hasHourlyContext && labourTrade === "generic") return quote

  const bestLabourItem = findBestLabourItem(knowledgeItemContext, transcript, classification)
  if (!bestLabourItem) return quote

  const bestRate =
    bestLabourItem.sell_price === null || bestLabourItem.sell_price === undefined
      ? null
      : String(bestLabourItem.sell_price)
  const bestItemCode = typeof bestLabourItem.item_code === "string" ? bestLabourItem.item_code : ""
  const bestItemName = typeof bestLabourItem.item_name === "string" ? bestLabourItem.item_name : ""
  const bestUnit = typeof bestLabourItem.unit === "string" ? bestLabourItem.unit : ""

  quote.line_items = quote.line_items.map((item) => {
    if (!hasLabourSignals(item)) return item
    if (!hasBroadLabourSignals(item) && item.item_code === bestItemCode && item.item_name === bestItemName) return item

    const hasOverride = typeof item.override_rate === "string" && item.override_rate.trim().length > 0
    const nextKnowledgeBaseRate = bestRate
    const nextOverrideRate = hasOverride ? item.override_rate : null
    const nextFinalRate = hasOverride ? item.override_rate : bestRate
    const nextItem = {
      ...item,
      item_code: bestItemCode,
      item_name: bestItemName || item.item_name,
      unit: bestUnit || item.unit || "hours",
      knowledge_base_rate: nextKnowledgeBaseRate,
      override_rate: nextOverrideRate,
      final_rate_used: nextFinalRate,
      rate: nextFinalRate,
      match_confidence: item.match_confidence === "none" ? "medium" : item.match_confidence,
      match_reason: `${item.match_reason}${item.match_reason ? " " : ""}Trade-aware labour context detected (${labourTrade}); preferred the best matching labour pricing item over a broad or mismatched labour item.`,
    }

    return {
      ...nextItem,
      total: calculateLineItemTotal(nextItem) ?? nextItem.total,
    }
  })

  return quote
}

function knowledgeItemMetadata(item: Record<string, unknown> | undefined) {
  if (!item) return {}

  return {
    source_item_id: typeof item.source_item_id === "string" ? item.source_item_id : "",
    source_system: typeof item.source_system === "string" ? item.source_system : "",
    item_code: typeof item.item_code === "string" ? item.item_code : "",
    account_code: typeof item.account_code === "string" ? item.account_code : "",
    sales_account_code: typeof item.sales_account_code === "string" ? item.sales_account_code : "",
    tax_code: typeof item.tax_code === "string" ? item.tax_code : "",
    tax_type: typeof item.tax_type === "string" ? item.tax_type : "",
    gst_rate: typeof item.gst_rate === "number" && Number.isFinite(item.gst_rate) ? item.gst_rate : null,
  }
}

function normaliseCodeCandidate(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

function shouldReplaceLineItemCode(lineItem: z.infer<typeof quoteLineItemSchema>, sourceItemCode: string | undefined) {
  const sourceCode = sourceItemCode?.trim()
  if (!sourceCode) return false

  const current = normaliseCodeCandidate(lineItem.item_code)
  if (!current) return true

  return current === normaliseCodeCandidate(lineItem.item_name) || current === normaliseCodeCandidate(lineItem.description)
}

function lineItemMetadataSource(
  lineItem: z.infer<typeof quoteLineItemSchema>,
  knowledgeItemContext: unknown[],
) {
  const items = knowledgeItemContext
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null)

  const itemCode = lineItem.item_code.trim().toLowerCase()
  if (itemCode) {
    const byCode = items.find((item) => typeof item.item_code === "string" && item.item_code.trim().toLowerCase() === itemCode)
    if (byCode) return byCode
  }

  const itemName = lineItem.item_name.trim().toLowerCase()
  if (!itemName) return null

  return items.find((item) => typeof item.item_name === "string" && item.item_name.trim().toLowerCase() === itemName) ?? null
}

function attachMatchedLineItemMetadata(
  quote: z.infer<typeof processedQuoteSchema>,
  knowledgeItemContext: unknown[],
) {
  quote.line_items = quote.line_items.map((lineItem) => {
    const source = lineItemMetadataSource(lineItem, knowledgeItemContext)
    if (!source) return lineItem

    const metadata = knowledgeItemMetadata(source)
    return {
      ...lineItem,
      source_item_id: lineItem.source_item_id || metadata.source_item_id,
      source_system: lineItem.source_system || metadata.source_system,
      item_code: shouldReplaceLineItemCode(lineItem, metadata.item_code) ? metadata.item_code || lineItem.item_code : lineItem.item_code,
      account_code: lineItem.account_code || metadata.account_code,
      sales_account_code: lineItem.sales_account_code || metadata.sales_account_code,
      tax_code: lineItem.tax_code || metadata.tax_code,
      tax_type: lineItem.tax_type || metadata.tax_type,
      gst_rate: lineItem.gst_rate ?? metadata.gst_rate,
    }
  })

  return quote
}

function normalizeLineItemWarnings(quote: z.infer<typeof processedQuoteSchema>) {
  quote.line_items = quote.line_items.map((item) => {
    const quantityExists = hasLineItemQuantity(item)
    const rateExists = hasLineItemRate(item)
    const warning = item.warning.trim()
    const calculatedTotal = calculateLineItemTotal(item)

    if (!quantityExists && !rateExists) {
      const itemText = [item.item_code, item.item_name, item.description, item.item_type, item.match_reason].join(" ")
      const shouldReportBoth = /\bgreen\s*waste|greenwaste|fertili[sz]er|spray|weedkiller|herbicide|chemical\b/i.test(
        itemText,
      )
      return {
        ...item,
        needs_review: true,
        warning: shouldReportBoth ? "Quantity and rate missing" : "Quantity missing",
      }
    }

    if (!quantityExists) {
      return {
        ...item,
        needs_review: true,
        warning: "Quantity missing",
      }
    }

    if (!rateExists) {
      return {
        ...item,
        needs_review: true,
        warning: "Rate missing",
      }
    }

    const itemWithTotal = calculatedTotal ? { ...item, total: calculatedTotal } : item

    if (/quantity\s+missing/i.test(warning) || /rate\s+missing/i.test(warning)) {
      return {
        ...itemWithTotal,
        warning: "",
      }
    }

    return itemWithTotal
  })

  return quote
}

function itemLooksLikeGreenwaste(item: z.infer<typeof quoteLineItemSchema>) {
  return /\bgreen\s*waste|greenwaste\b/i.test([item.item_code, item.item_name, item.description, item.match_reason].join(" "))
}

function transcriptHasGreenwasteUncertainty(transcript: string) {
  return /\b(one\s+or\s+two\s+bags?|usually\s+one\s+or\s+two\s+bags?|green\s*waste\s+volume\s+unknown|greenwaste\s+volume\s+unknown|standard\s+green\s*waste\s+included|standard\s+greenwaste\s+included)\b/i.test(
    transcript,
  )
}

function preserveGreenwasteUncertainty(quote: z.infer<typeof processedQuoteSchema>, transcript: string) {
  if (!transcriptHasGreenwasteUncertainty(transcript)) return quote

  quote.line_items = quote.line_items.map((item) => {
    if (!itemLooksLikeGreenwaste(item)) return item

    return {
      ...item,
      quantity: null,
      total: null,
      needs_review: true,
      warning: "Quantity missing",
      match_reason: `${item.match_reason}${item.match_reason ? " " : ""}Transcript gave uncertain greenwaste quantity, so no exact quantity was forced.`,
    }
  })

  if (!quote.confidence_warnings.some((warning) => /green\s*waste|greenwaste/i.test(warning))) {
    quote.confidence_warnings.push("Greenwaste quantity is uncertain; review before pricing.")
  }

  return quote
}

function appendUniqueMissingInfo(quote: z.infer<typeof processedQuoteSchema>, message: string) {
  if (!quote.missing_information.some((item) => item.toLowerCase() === message.toLowerCase())) {
    quote.missing_information.push(message)
  }
}

function missingInfoForLineItem(item: z.infer<typeof quoteLineItemSchema>) {
  if (!item.needs_review) return null

  const text = [item.item_code, item.item_name, item.description, item.item_type, item.match_reason].join(" ").toLowerCase()
  const warning = item.warning.toLowerCase()
  const quantityMissing = warning.includes("quantity")
  const rateMissing = warning.includes("rate")

  if (!quantityMissing && !rateMissing) return null

  const suffix = quantityMissing && rateMissing ? "quantity/rate" : quantityMissing ? "quantity" : "rate"

  if (/\bgreen\s*waste|greenwaste\b/.test(text)) return `greenwaste ${suffix}`
  if (/\bfertili[sz]er\b/.test(text)) return `fertiliser ${suffix}`
  if (/\bspray|weedkiller|herbicide|chemical\b/.test(text)) return `spray ${suffix}`
  if (/\blabou?r\b/.test(text)) return quantityMissing ? "labour quantity/hours" : "labour rate"

  const label =
    item.item_name.trim() ||
    item.description.trim() ||
    (item.item_type.trim() ? item.item_type.trim() : "line item")

  return `${label} ${suffix}`
}

function surfaceLineItemMissingInformation(quote: z.infer<typeof processedQuoteSchema>) {
  quote.missing_information = Array.isArray(quote.missing_information) ? quote.missing_information : []

  for (const item of quote.line_items) {
    const message = missingInfoForLineItem(item)
    if (message) appendUniqueMissingInfo(quote, message)
  }

  return quote
}

function removeCapturedLeadMissingInformation(quote: z.infer<typeof processedQuoteSchema>, leadDetails: LeadDetails) {
  quote.missing_information = Array.isArray(quote.missing_information) ? quote.missing_information : []
  quote.confidence_warnings = Array.isArray(quote.confidence_warnings) ? quote.confidence_warnings : []

  if (leadDetails.client_name) {
    quote.missing_information = quote.missing_information.filter((item) => !/^client\s+name\s+not\s+captured$/i.test(item.trim()))
    quote.confidence_warnings = quote.confidence_warnings.filter((item) => !/^client\s+name\s+not\s+captured$/i.test(item.trim()))
  }

  if (leadDetails.site_address) {
    quote.missing_information = quote.missing_information.filter((item) => !/^site\s+address\s+not\s+captured$/i.test(item.trim()))
    quote.confidence_warnings = quote.confidence_warnings.filter((item) => !/^site\s+address\s+not\s+captured$/i.test(item.trim()))
  }

  return quote
}

function applyAddressReviewDetails(quote: z.infer<typeof processedQuoteSchema>, leadDetails: LeadDetails) {
  quote.internal_notes = Array.isArray(quote.internal_notes) ? quote.internal_notes : []
  quote.confidence_warnings = Array.isArray(quote.confidence_warnings) ? quote.confidence_warnings : []
  quote.missing_information = Array.isArray(quote.missing_information) ? quote.missing_information : []

  const address = leadDetails.address
  const note = [
    "Address extraction:",
    `raw_address_candidate: ${address.raw_address_candidate ?? "Not captured"}`,
    `cleaned_address: ${address.cleaned_address ?? "Not captured"}`,
    `street_number: ${address.street_number ?? "Not captured"}`,
    `street_name: ${address.street_name ?? "Not captured"}`,
    `suburb: ${address.suburb ?? "Not captured"}`,
    `city_region: ${address.city_region ?? "Not captured"}`,
    `confidence: ${address.confidence}`,
    `needs_address_confirmation: ${address.needs_address_confirmation}`,
    address.address_warnings.length ? `address_warnings: ${address.address_warnings.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  if (!quote.internal_notes.some((item) => item.includes("Address extraction:"))) {
    quote.internal_notes.push(note)
  }

  for (const warning of address.address_warnings) {
    if (!quote.internal_notes.some((item) => item.includes(warning))) {
      quote.internal_notes.push(`Address warning: ${warning}`)
    }
  }

  if (address.needs_address_confirmation) {
    appendUniqueMissingInfo(quote, "Please confirm site address")
    if (!quote.confidence_warnings.some((warning) => /confirm site address/i.test(warning))) {
      quote.confidence_warnings.push("Please confirm site address")
    }
  }

  return quote
}

type PlantLibraryItem = {
  source_item_id: string
  source_system: string
  item_code: string
  item_name: string
  category: string
  description: string
  aliases: string[]
  sell_price: number | null
  account_code: string
  sales_account_code: string
  tax_code: string
  tax_type: string
  gst_rate: number | null
  plant_name: string
  plant_size: string
  pot_size: string
  spacing_mm: number | null
  supplier: string
  stock_status: string
  notes: string
  raw_import: unknown
}

function getPlantLibraryItems(knowledgeItemContext: unknown[]): PlantLibraryItem[] {
  return knowledgeItemContext
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null && item.item_type === "plant")
    .filter((item) =>
      isTruePlantCatalogItem({
        explicitType: typeof item.item_type === "string" ? item.item_type : "",
        itemCode: typeof item.item_code === "string" ? item.item_code : "",
        itemName: typeof item.item_name === "string" ? item.item_name : "",
        plantName: typeof item.plant_name === "string" ? item.plant_name : "",
        plantType:
          typeof item.plant_size === "string"
            ? item.plant_size
            : typeof item.pot_size === "string"
              ? item.pot_size
              : "",
        description: typeof item.description === "string" ? item.description : "",
        category: typeof item.category === "string" ? item.category : "",
        supplier: typeof item.supplier === "string" ? item.supplier : "",
        notes: typeof item.notes === "string" ? item.notes : "",
      }),
    )
    .map((item) => ({
      source_item_id: typeof item.source_item_id === "string" ? item.source_item_id : "",
      source_system: typeof item.source_system === "string" ? item.source_system : "",
      item_code: typeof item.item_code === "string" ? item.item_code : "",
      item_name: typeof item.item_name === "string" ? item.item_name : "",
      category: typeof item.category === "string" ? item.category : "",
      description: typeof item.description === "string" ? item.description : "",
      aliases: getStringArray(item.aliases, 20),
      sell_price: typeof item.sell_price === "number" && Number.isFinite(item.sell_price) ? item.sell_price : null,
      account_code: typeof item.account_code === "string" ? item.account_code : "",
      sales_account_code: typeof item.sales_account_code === "string" ? item.sales_account_code : "",
      tax_code: typeof item.tax_code === "string" ? item.tax_code : "",
      tax_type: typeof item.tax_type === "string" ? item.tax_type : "",
      gst_rate: typeof item.gst_rate === "number" && Number.isFinite(item.gst_rate) ? item.gst_rate : null,
      plant_name:
        typeof item.plant_name === "string" && item.plant_name.trim()
          ? item.plant_name.trim()
          : typeof item.item_name === "string"
            ? item.item_name.replace(/\b\d+(?:\.\d+)?\s*(?:l|m|mm|cm)\b/gi, "").trim()
            : "",
      plant_size: typeof item.plant_size === "string" ? item.plant_size : "",
      pot_size: typeof item.pot_size === "string" ? item.pot_size : "",
      spacing_mm: typeof item.spacing_mm === "number" && Number.isFinite(item.spacing_mm) ? item.spacing_mm : null,
      supplier: typeof item.supplier === "string" ? item.supplier : "",
      stock_status: typeof item.stock_status === "string" ? item.stock_status : "",
      notes: typeof item.notes === "string" ? item.notes : "",
      raw_import: item.raw_import && typeof item.raw_import === "object" ? item.raw_import : null,
    }))
}

function normalisePlantText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9āēīōū\s.]/gi, " ").replace(/\s+/g, " ").trim()
}

function plantSearchTerms(item: PlantLibraryItem) {
  return [item.plant_name, item.item_name, ...item.aliases]
    .map(normalisePlantText)
    .filter((term) => term.length >= 3)
}

function findMentionedPlantItems(transcript: string, plantItems: PlantLibraryItem[]) {
  const text = normalisePlantText(transcript)
  return plantItems.filter((item) => plantSearchTerms(item).some((term) => text.includes(term)))
}

function plantItemsToKnowledgeRows(plantItems: PlantLibraryItem[]): KnowledgePlantRow[] {
  return plantItems.map((item) => ({
    item_type: "plant",
    id: item.source_item_id,
    source_system: item.source_system,
    item_code: item.item_code,
    item_name: item.item_name,
    description: item.description,
    aliases: item.aliases,
    category: item.category,
    sell_price: item.sell_price,
    account_code: item.account_code,
    sales_account_code: item.sales_account_code,
    tax_code: item.tax_code,
    tax_type: item.tax_type,
    gst_rate: item.gst_rate,
    source_category: item.supplier,
    raw_import: {
      plant_name: item.plant_name,
      plant_size: item.plant_size,
      pot_size: item.pot_size,
      spacing_mm: item.spacing_mm,
      supplier: item.supplier,
      stock_status: item.stock_status,
      raw_import: item.raw_import,
    },
  }))
}

function formatPlantCalculatorResult(result: PlantCalculatorResult) {
  return JSON.stringify(
    {
      plant_name: result.plant_name,
      plant_count: result.plant_count,
      quantity_source: result.quantity_source,
      length_m: result.length_m,
      spacing_mm: result.spacing_mm,
      spacing_source: result.spacing_source,
      formula: result.formula,
      library_match: result.library_match
        ? {
            plant_name: result.library_match.plant_name,
            match_confidence: result.library_match.match_confidence,
            confidence_score: result.library_match.confidence_score,
            default_spacing_mm: result.library_match.default_spacing_mm,
          }
        : null,
      warnings: result.warnings,
      options: result.options.map((option) => ({
        item_code: option.item_code,
        plant_name: option.plant_name,
        plant_size: option.plant_size,
        pot_size: option.pot_size,
        plant_count: option.plant_count,
        unit_price: option.unit_price,
        total_price: option.total_price,
        warnings: option.warnings,
      })),
    },
    null,
    2,
  )
}

function formatPlantCalculatorTraceRequest(request: PlantCalculatorRequest) {
  return {
    area_label: request.area_label ?? request.row_label ?? null,
    plant_name: request.plant_name ?? null,
    spoken_quantity: request.spoken_quantity ?? null,
    length_m: request.length_m ?? null,
    spoken_spacing_mm: request.spoken_spacing_mm ?? null,
    requestedSizes: request.requested_option_sizes ?? [],
    source_text: request.source_text ?? "",
  }
}

function debugPlantOptionSizeValues(option: {
  plant_name?: string
  plant_size?: string
  pot_size?: string
  item_name?: string
  aliases?: string[]
}) {
  return [option.plant_size, option.pot_size, option.item_name, option.plant_name, ...(option.aliases ?? [])].filter(Boolean)
}

function formatPlantCalculatorTraceMatch(match: ReturnType<typeof matchPlantRowsFromLibrary>) {
  return {
    plant_name: match.plant_name,
    match_confidence: match.match_confidence,
    confidence_score: match.confidence_score,
    default_spacing_mm: match.default_spacing_mm,
    options: (match.options ?? []).map((option) => ({
      item_code: option.item_code,
      item_name: option.item_name,
      plant_name: option.plant_name,
      plant_size: option.plant_size,
      pot_size: option.pot_size,
      aliases: option.aliases,
      available_size_values: debugPlantOptionSizeValues(option),
      sell_price: option.sell_price,
      supplier: option.supplier,
      stock_status: option.stock_status,
      raw_import: option.raw_import,
    })),
  }
}

function debugFicusTuffiPlantRecords(plantItems: PlantLibraryItem[]) {
  return plantItems
    .filter((item) => /ficus|tuffi|tuffy/i.test([item.item_name, item.plant_name, ...item.aliases].join(" ")))
    .map((item) => ({
      item_name: item.item_name,
      raw_import: item.raw_import,
      aliases: item.aliases,
      category: item.category,
      item_code: item.item_code,
      plant_name: item.plant_name,
      plant_size: item.plant_size,
      pot_size: item.pot_size,
      sell_price: item.sell_price,
      stock_status: item.stock_status,
    }))
}

function extractSpacingMm(transcript: string) {
  const match = transcript.match(/\bat\s+(\d+(?:\.\d+)?)\s*(mm|m|metres?|meters?)\b/i)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const unit = match[2].toLowerCase()
  return unit === "mm" ? Math.round(value) : Math.round(value * 1000)
}

function extractPlantLengthRows(transcript: string) {
  const rows: Array<{ label: string; length_m: number; plant_text: string }> = []
  const pattern =
    /\b(?:(lower|upper|front|back|side|left|right)\s+(?:row|hedge|area)\s*)?(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+(?:of|for|row\s+of|length\s+of)?\s*([A-Za-z][A-Za-z\s.'-]{2,60}?)(?:[.,]|\s+at\s+|\s+hedge\b|$)/gi

  for (const match of transcript.matchAll(pattern)) {
    const length = Number(match[2])
    if (!Number.isFinite(length)) continue
    rows.push({
      label: match[1] ? `${match[1]} hedge` : "Planting row",
      length_m: length,
      plant_text: match[3].trim(),
    })
  }

  return rows
}

function extractPlantQuantity(transcript: string) {
  const match = transcript.match(
    /\b(?:plant|install|supply\s*(?:&|and)?\s*plant|supply\s*(?:&|and)?\s*install|supply\s*\/\s*install)\s+(\d+)\s+([A-Za-z][A-Za-z\s.'-]{2,60}?)(?:\s+plants?\b|\s+at\b|[.,\n]|$)/i,
  )
  if (!match) return null
  const quantity = Number(match[1])
  if (!Number.isFinite(quantity)) return null
  return { quantity, plant_text: match[2].replace(/\bplants?\b.*$/i, "").trim() }
}

function getPlantQuantityRequestsFromLineItems(quote: z.infer<typeof processedQuoteSchema>): PlantCalculatorRequest[] {
  const requests: PlantCalculatorRequest[] = []

  for (const item of quote.line_items) {
    if (item.item_type.toLowerCase() !== "plant" || !hasLineItemQuantity(item)) continue

    const quantity = numberFromLineItemValue(item.quantity)
    if (quantity === null || quantity <= 0) continue

    const plantName =
      [item.item_name, item.description].find((value) =>
        /\b(ficus|griselinia|buxus|pittosporum|lomandra|flax|plants?)\b/i.test(value),
      ) ||
      item.item_name ||
      item.description
    const cleanPlantName = plantName
      .replace(/\b\d+(?:\.\d+)?\s*(?:l|m|mm|cm|pb\s*\d+)\b/gi, "")
      .replace(/\bplants?\b.*$/i, "")
      .trim()

    if (!cleanPlantName) continue

    requests.push({
      plant_name: cleanPlantName,
      spoken_quantity: quantity,
      source_text: `Matched plant line item quantity: ${item.item_name}`,
    })
  }

  return requests
}

function normalisePlantRequestName(value: string | undefined) {
  return normalisePlantText(value ?? "")
    .replace(/\bplants?\b/g, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:l|m|mm|cm|pb\s*\d+)\b/g, "")
    .trim()
}

function mergePlantCalculatorRequests(
  extractedRequests: PlantCalculatorRequest[],
  fallbackRequests: PlantCalculatorRequest[],
) {
  const merged = [...extractedRequests]

  for (const fallback of fallbackRequests) {
    const fallbackName = normalisePlantRequestName(fallback.plant_name)
    const existingIndex = merged.findIndex((request) => {
      const requestName = normalisePlantRequestName(request.plant_name)
      return requestName && fallbackName && (requestName.includes(fallbackName) || fallbackName.includes(requestName))
    })

    if (existingIndex >= 0) {
      const existing = merged[existingIndex]
      const shouldUseFallbackQuantity = existing.spoken_quantity == null && existing.length_m == null
      merged[existingIndex] = {
        ...existing,
        spoken_quantity: shouldUseFallbackQuantity ? fallback.spoken_quantity : existing.spoken_quantity,
        source_text: existing.source_text || fallback.source_text,
      }
    } else {
      merged.push(fallback)
    }
  }

  return merged
}

function extractRequestedPlantOptionSizes(transcript: string) {
  if (!/\b(options?|price\s+options?|option\s+pricing)\b/i.test(transcript)) return []
  const sizes = Array.from(transcript.matchAll(/\b(\d+(?:\.\d+)?\s*m|\d+(?:\.\d+)?\s*l|pb\s*\d+)\b/gi)).map((match) =>
    match[1].replace(/\s+/g, "").toLowerCase(),
  )
  return Array.from(new Set(sizes))
}

function getPlantOptionBaseName(quantityRequest: ReturnType<typeof extractPlantQuantity>, rows: ReturnType<typeof extractPlantLengthRows>) {
  return (
    quantityRequest?.plant_text ||
    rows.map((row) => row.plant_text).find(Boolean) ||
    "Plant option"
  )
}

function plantItemMatchesText(item: PlantLibraryItem, text: string) {
  const normalizedText = normalisePlantText(text)
  return plantSearchTerms(item).some((term) => normalizedText.includes(term) || term.includes(normalizedText))
}

function plantItemMatchesSize(item: PlantLibraryItem, size: string) {
  const text = normalisePlantText([item.item_name, item.plant_size, item.pot_size, ...item.aliases].join("")).replace(/\s+/g, "")
  return text.includes(size.toLowerCase().replace(/\s+/g, ""))
}

function money(value: number | null) {
  return value == null ? "Not priced" : `$${value.toFixed(2)}`
}

function removeKnownQuantitySpacingWarnings(quote: z.infer<typeof processedQuoteSchema>) {
  quote.missing_information = quote.missing_information.filter(
    (item) => !/\b(plant\s+spacing|spacing\s+required|spacing.*plant\s+quantity)\b/i.test(item),
  )
  quote.confidence_warnings = quote.confidence_warnings.filter(
    (item) => !/\b(missing\s+plant\s+spacing|spacing\s+required|spacing.*plant\s+quantity)\b/i.test(item),
  )
}

function hasConfidentPlantCalculatorMatch(result: PlantCalculatorResult) {
  return result.library_match?.match_confidence === "high" || result.library_match?.match_confidence === "medium"
}

function hasPricedPlantCalculatorOptions(result: PlantCalculatorResult) {
  return result.option_groups.some((option) => option.unit_sell_price !== null && option.plant_total !== null)
}

function normalizedPlantReference(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9āēīōū]/gi, "")
}

function calculatorPlantNames(calculatorResults: PlantCalculatorResult[]) {
  return Array.from(
    new Set(
      calculatorResults
        .flatMap((result) => [
          result.plant_name,
          result.library_match?.plant_name,
          ...result.option_groups.map((option) => option.plant_name),
          ...(result.library_match?.options ?? []).map((option) => option.plant_name),
        ])
        .filter((value): value is string => Boolean(value))
        .map(normalizedPlantReference)
        .filter((value) => value.length >= 4),
    ),
  )
}

function itemLooksLikeCalculatorSupersededPlantOption(
  item: z.infer<typeof quoteLineItemSchema>,
  plantNames: string[],
) {
  const text = [item.item_name, item.item_type, item.description, item.match_reason, item.warning].join(" ")
  const normalizedText = normalizedPlantReference(text)
  const itemType = item.item_type.toLowerCase()
  const looksLikeNamedPlantOption = /\b(griselinia|ficus|tuffi|lomandra|buxus|pittosporum|flax)\b/i.test(text)
  const looksLikeGenericPlantFallback = /\b(unmatched\s+plant|plant\s+option|plant\s+library|hedge\s+plant)\b/i.test(text)
  const matchesCalculatorPlant = plantNames.some((plantName) => normalizedText.includes(plantName))
  return itemType === "plant" || looksLikeGenericPlantFallback || matchesCalculatorPlant || (item.match_confidence === "none" && looksLikeNamedPlantOption)
}

function removeSupersededPlantOptionWarnings(
  quote: z.infer<typeof processedQuoteSchema>,
  calculatorResults: PlantCalculatorResult[],
) {
  const hasConfidentResult = calculatorResults.some(hasConfidentPlantCalculatorMatch)
  if (!hasConfidentResult) return quote

  const hasPricedOptions = calculatorResults.some(hasPricedPlantCalculatorOptions)
  const hasPlantCounts = calculatorResults.some((result) => result.plant_count !== null)
  const plantNames = calculatorPlantNames(calculatorResults)
  quote.line_items = quote.line_items.filter((item) => !itemLooksLikeCalculatorSupersededPlantOption(item, plantNames))

  quote.missing_information = quote.missing_information.filter((item) => {
    const text = item.toLowerCase()
    const normalizedText = normalizedPlantReference(item)
    const matchesCalculatorPlant = plantNames.some((plantName) => normalizedText.includes(plantName))
    if (/\bplant\s+library\s+match\b/.test(text)) return false
    if (/\bplant\s+option\s+pricing\b/.test(text)) return !hasPricedOptions
    if (hasPlantCounts && matchesCalculatorPlant && /\b(quantity|count|plants?)\b/.test(text)) return false
    if (/\bficus|tuffi|griselinia|lomandra|buxus|pittosporum|plant\b/.test(text) && /\brate|pricing|price\b/.test(text)) {
      return !hasPricedOptions
    }
    return true
  })

  quote.confidence_warnings = quote.confidence_warnings.filter((warning) => {
    const text = warning.toLowerCase()
    const normalizedText = normalizedPlantReference(warning)
    const matchesCalculatorPlant = plantNames.some((plantName) => normalizedText.includes(plantName))
    if (/no confident plant library match/.test(text)) return false
    if (/\bplant\s+option\s+pricing\b/.test(text)) return !hasPricedOptions
    if (hasPlantCounts && matchesCalculatorPlant && /\b(quantity|count|plants?)\b/.test(text)) return false
    if (/\bficus|tuffi|griselinia|lomandra|buxus|pittosporum|plant\b/.test(text) && /\brate|pricing|price\b/.test(text)) {
      return !hasPricedOptions
    }
    return true
  })

  return quote
}

function applyPlantingCalculator(
  quote: z.infer<typeof processedQuoteSchema>,
  transcript: string,
  knowledgeItemContext: unknown[],
) {
  if (!hasPlantingCalculatorIntent(transcript)) return quote

  const plantItems = getPlantLibraryItems(knowledgeItemContext)
  const ficusDebugRecords = debugFicusTuffiPlantRecords(plantItems)
  if (/ficus|tuffi|tuffy/i.test(transcript) || ficusDebugRecords.length > 0) {
    console.log("plant-library Ficus Tuffi records", ficusDebugRecords)
  }
  const calculatorRequests = mergePlantCalculatorRequests(
    extractPlantCalculatorRequestsFromText(transcript),
    getPlantQuantityRequestsFromLineItems(quote),
  )
  const rows = extractPlantLengthRows(transcript)
  const quantityRequest = extractPlantQuantity(transcript)
  if (plantItems.length === 0 && !rows.length && !quantityRequest && calculatorRequests.length === 0) return quote

  const mentionedItems = findMentionedPlantItems(transcript, plantItems)
  const optionSizes = extractRequestedPlantOptionSizes(transcript)
  const spokenSpacingMm = extractSpacingMm(transcript)
  const plantRows = plantItemsToKnowledgeRows(plantItems)
  const calculatorResults = calculatorRequests.map((request) => {
    const libraryMatch = matchPlantRowsFromLibrary(plantRows, request.plant_name ?? "")
    const calculatorInput = {
      ...request,
      plant_library_match: libraryMatch,
    }
    const result = calculatePlantingQuote(calculatorInput)
    console.log("plant-calculator trace", {
      extractedPlantCalculatorRequest: formatPlantCalculatorTraceRequest(request),
      requestedSizes: request.requested_option_sizes ?? [],
      matchedPlantLibraryRecords: formatPlantCalculatorTraceMatch(libraryMatch),
      optionGenerationInput: {
        requestedSizes: calculatorInput.requested_option_sizes ?? [],
        option_count: libraryMatch.options?.length ?? 0,
        options: (libraryMatch.options ?? []).map((option) => ({
          item_code: option.item_code,
          item_name: option.item_name,
          plant_name: option.plant_name,
          plant_size: option.plant_size,
          pot_size: option.pot_size,
          aliases: option.aliases,
          available_size_values: debugPlantOptionSizeValues(option),
          sell_price: option.sell_price,
          raw_import: option.raw_import,
        })),
      },
      optionGenerationOutput: {
        plant_count: result.plant_count,
        option_groups: result.option_groups.map((option) => ({
          option_label: option.option_label,
          option_name: option.option_name,
          plant_count: option.plant_count,
          unit_sell_price: option.unit_sell_price,
          plant_total: option.plant_total,
          supplier: option.supplier,
          stock_status: option.stock_status,
        })),
        warnings: result.warnings.map((warning) => warning.message),
      },
    })
    return result
  })
  const hasAuthoritativeCalculatorResult = calculatorResults.some(hasConfidentPlantCalculatorMatch)
  const hasCalculatorPlantCount = calculatorResults.some((result) => result.plant_count !== null)
  const primaryCalculatorResult = calculatorResults[0]
  const selectedItems = mentionedItems
  const primaryItem = selectedItems[0]
  const defaultSpacingMm = primaryItem?.spacing_mm ?? primaryCalculatorResult?.library_match?.default_spacing_mm ?? null
  const spacingMm = spokenSpacingMm ?? defaultSpacingMm
  const hasKnownPlantQuantity = Boolean(quantityRequest)
  const warnings: string[] = []
  const calculatorLines = ["Planting Calculator"]
  const optionItems =
    optionSizes.length > 0
      ? optionSizes
          .map((size) => selectedItems.find((item) => plantItemMatchesSize(item, size)))
          .filter((item): item is PlantLibraryItem => Boolean(item))
      : primaryItem
        ? [primaryItem]
        : []

  if (!spacingMm && rows.length > 0) {
    warnings.push("Spacing required to calculate plant quantity")
    appendUniqueMissingInfo(quote, "Spacing required to calculate plant quantity")
  }

  if (rows.length === 0 && !quantityRequest && !hasCalculatorPlantCount) {
    warnings.push("Missing planting length or plant quantity.")
    appendUniqueMissingInfo(quote, "planting length or plant quantity")
  }

  if (hasKnownPlantQuantity) {
    removeKnownQuantitySpacingWarnings(quote)
  }

  if (!hasAuthoritativeCalculatorResult && selectedItems.length === 0 && (rows.length > 0 || quantityRequest) && optionSizes.length === 0) {
    const plantDescription =
      quantityRequest?.plant_text ||
      rows.map((row) => row.plant_text).find(Boolean) ||
      "Plant request"
    warnings.push("No confident plant library match found.")
    appendUniqueMissingInfo(quote, "plant library match")
    quote.line_items = quote.line_items.filter((item) => {
      const text = [item.item_name, item.description, item.item_type, item.match_reason].join(" ")
      return !/\bplants?\b/i.test(text)
    })
    quote.line_items.push({
      item_code: "",
      item_name: "Unmatched plant item",
      item_type: "plant",
      description: plantDescription,
      quantity: quantityRequest ? String(quantityRequest.quantity) : null,
      unit: "each",
      rate: null,
      knowledge_base_rate: null,
      override_rate: null,
      final_rate_used: null,
      total: null,
      match_confidence: "none",
      match_reason: "Plant request detected but no exact alias/name/botanical/common-name match was found in the Plant Library.",
      needs_review: true,
      warning: quantityRequest ? "Rate missing" : "Quantity and rate missing",
    })
  }

  const totalPlantCount =
    calculatorResults.length > 0 && calculatorResults.every((result) => result.plant_count !== null)
      ? calculatorResults.reduce((total, result) => total + (result.plant_count ?? 0), 0)
      : quantityRequest?.quantity ?? null

  if (calculatorResults.length > 0) {
    ;(quote as typeof quote & { plant_calculator_results: PlantCalculatorResult[] }).plant_calculator_results =
      calculatorResults
    ;(quote as typeof quote & { quote_options: ReturnType<typeof quoteOptionsFromPlantCalculatorResults> }).quote_options =
      quoteOptionsFromPlantCalculatorResults(calculatorResults)
  }

  for (const result of calculatorResults) {
    calculatorLines.push(
      `row/area: ${result.area_label ?? "Planting row"} | length: ${result.length_m ?? "Not captured"}m | spacing: ${result.spacing_mm ? `${result.spacing_mm}mm` : "Not captured"} | plant count formula: ${result.formula ?? "Not calculated"} | plant count: ${result.plant_count ?? "Not calculated"}`,
    )
  }

  if (quantityRequest && calculatorResults.every((result) => result.quantity_source !== "spoken_quantity")) {
    calculatorLines.push(`row/area: Plant quantity | plant count: ${quantityRequest.quantity} | source: spoken quantity`)

    if (spokenSpacingMm) {
      calculatorLines.push(`spacing: ${spokenSpacingMm}mm | source: spoken spacing | note: informational only because plant quantity was supplied`)
    } else if (defaultSpacingMm) {
      calculatorLines.push(`suggested spacing: ${defaultSpacingMm}mm | source: Plant Library | note: informational only because plant quantity was supplied`)
    } else {
      calculatorLines.push("spacing: Not captured | note: not required because plant quantity was supplied")
    }
  }

  const optionSummaryLines: string[] = []
  if (!hasAuthoritativeCalculatorResult && optionSizes.length > 0 && optionItems.length === 0 && (rows.length > 0 || quantityRequest)) {
    const baseName = getPlantOptionBaseName(quantityRequest, rows)
    quote.line_items = quote.line_items.filter((item) => {
      const text = [item.item_name, item.description, item.item_type, item.match_reason].join(" ")
      return !/\bplants?\b/i.test(text)
    })

    optionSizes.forEach((size, index) => {
      const optionName = `${baseName} ${size.toUpperCase()}`
      calculatorLines.push(
        `selected plant option: ${optionName} | unit price: Not priced | plant count: ${totalPlantCount ?? "Not captured"} | total price: Not priced | warning: no confident Plant Library match`,
      )
      optionSummaryLines.push(`Option ${index + 1}: ${optionName} - price needs review`)
      quote.line_items.push({
        item_code: "",
        item_name: optionName,
        item_type: "plant",
        description: optionName,
        quantity: totalPlantCount == null ? null : String(totalPlantCount),
        unit: "each",
        rate: null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: null,
        total: null,
        match_confidence: "none",
        match_reason: "Plant price option requested but no matching Plant Library item was found for this option.",
        needs_review: true,
        warning: totalPlantCount == null ? "Quantity and rate missing" : "Rate missing",
      })
    })

    warnings.push("No confident Plant Library match found for requested plant price options.")
    appendUniqueMissingInfo(quote, "plant option pricing")
  }

  if (!hasAuthoritativeCalculatorResult) {
    optionItems.forEach((item, index) => {
      const unitPrice = item.sell_price
      const total = totalPlantCount != null && unitPrice != null ? totalPlantCount * unitPrice : null
      const optionName = [item.plant_name || item.item_name, item.plant_size || item.pot_size].filter(Boolean).join(" ")
      calculatorLines.push(
        `selected plant option: ${optionName} | unit price: ${money(unitPrice)} | plant count: ${totalPlantCount ?? "Not captured"} | total price: ${money(total)} | supplier: ${item.supplier || "Not captured"} | stock: ${item.stock_status || "Not captured"}`,
      )
      optionSummaryLines.push(`Option ${index + 1}: ${optionName}${total != null ? ` - plants total ${money(total)}` : ""}`)

      quote.line_items = quote.line_items.filter((lineItem) => {
        const text = [lineItem.item_name, lineItem.description, lineItem.item_type, lineItem.match_reason].join(" ")
        const isGenericPlantLine = /\bplants?\b/i.test(text) && !plantItemMatchesText(item, text)
        return !isGenericPlantLine
      })

      quote.line_items.push({
        item_code: item.item_code,
        item_name: optionName,
        item_type: "plant",
        description: optionName,
        quantity: totalPlantCount == null ? null : String(totalPlantCount),
        unit: "each",
        rate: unitPrice == null ? null : String(unitPrice),
        knowledge_base_rate: unitPrice == null ? null : String(unitPrice),
        override_rate: null,
        final_rate_used: unitPrice == null ? null : String(unitPrice),
        total: total == null ? null : total.toFixed(2),
        match_confidence: item.item_name ? "high" : "medium",
        match_reason: "Matched from Plant Library and calculated by Planting Calculator.",
        needs_review: totalPlantCount == null || unitPrice == null,
        warning: totalPlantCount == null ? "Quantity missing" : unitPrice == null ? "Rate missing" : "",
      })
    })
  }

  if (hasAuthoritativeCalculatorResult) {
    removeSupersededPlantOptionWarnings(quote, calculatorResults)
  }

  if (warnings.length > 0) calculatorLines.push(`warnings: ${warnings.join("; ")}`)

  if (!quote.internal_notes.some((note) => note.startsWith("Planting Calculator"))) {
    quote.internal_notes.push(calculatorLines.join("\n"))
  }

  for (const warning of warnings) {
    if (!quote.confidence_warnings.includes(warning)) quote.confidence_warnings.push(warning)
  }

  return quote
}

function numberFromLineItemValue(value: string | null) {
  if (!value) return null
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function calculateLineItemTotal(item: z.infer<typeof quoteLineItemSchema>) {
  const quantity = numberFromLineItemValue(item.quantity)
  const rateSource = item.final_rate_used ?? item.rate ?? item.override_rate ?? item.knowledge_base_rate
  const rate = numberFromLineItemValue(rateSource)

  if (quantity === null || rate === null) return null

  const total = quantity * rate
  const prefix = typeof rateSource === "string" && rateSource.includes("$") ? "$" : ""
  return `${prefix}${total.toFixed(2)}`
}

function itemLooksLikeLumpSumDefaultCandidate(item: z.infer<typeof quoteLineItemSchema>) {
  const text = [item.item_name, item.item_type, item.description, item.match_reason].join(" ")
  return /\b(chipper|stump\s+grinder|grinder|skip|petrol|fuel|machinery|machine|hire|equipment|tool|ladder|waste|general\s+waste|hardfill)\b/i.test(
    text,
  )
}

function transcriptHasOneUnitForItem(transcript: string, item: z.infer<typeof quoteLineItemSchema>) {
  const terms = [item.item_name, item.description]
    .flatMap((value) => value.split(/[\/|,]/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .slice(0, 4)

  return terms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const itemPattern = new RegExp(
      `\\b(?:hire\\s+)?(?:one|1|a|an)\\s+(?:[^.]{0,30})?\\b${escaped}\\b|\\b${escaped}\\b(?:[^.]{0,30})?\\b(?:for|at\\s+a\\s+cost\\s+of|costing|is)\\s+\\$?\\d`,
      "i",
    )
    return itemPattern.test(transcript)
  })
}

function getSpokenLumpSumForItem(transcript: string, item: z.infer<typeof quoteLineItemSchema>) {
  const terms = [item.item_name, item.description]
    .flatMap((value) => value.split(/[\/|,]/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .slice(0, 4)

  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
      new RegExp(`\\b${escaped}\\b[^.\\n]{0,80}?\\b(?:for|at\\s+a\\s+cost\\s+of|costing|is|total(?:s)?(?:\\s+of)?)\\s+\\$?(\\d+(?:\\.\\d{1,2})?)`, "i"),
      new RegExp(`\\b(?:hire\\s+)?(?:one|1|a|an)\\s+${escaped}\\b[^.\\n]{0,80}?\\$?(\\d+(?:\\.\\d{1,2})?)`, "i"),
      new RegExp(`\\$?(\\d+(?:\\.\\d{1,2})?)\\s+total[^.\\n]{0,40}?\\b${escaped}\\b`, "i"),
    ]

    for (const pattern of patterns) {
      const match = transcript.match(pattern)
      if (match?.[1]) return match[1]
    }
  }

  return null
}

function applyLumpSumQuantityDefaults(quote: z.infer<typeof processedQuoteSchema>, transcript: string) {
  quote.line_items = quote.line_items.map((item) => {
    if (hasLineItemQuantity(item) || !itemLooksLikeLumpSumDefaultCandidate(item)) return item

    const spokenLumpSum = getSpokenLumpSumForItem(transcript, item)
    const existingRate = item.override_rate ?? item.final_rate_used ?? item.rate ?? item.knowledge_base_rate
    const rate = spokenLumpSum ?? existingRate
    const rateNumber = typeof rate === "string" ? numberFromLineItemValue(rate) : null
    const shouldDefaultQuantity = Boolean(rate) && (Boolean(spokenLumpSum) || transcriptHasOneUnitForItem(transcript, item))

    if (!shouldDefaultQuantity) return item

    const nextItem = {
      ...item,
      quantity: "1",
      rate: rate ? String(rate) : item.rate,
      override_rate: spokenLumpSum ? String(spokenLumpSum) : item.override_rate,
      final_rate_used: rate ? String(rate) : item.final_rate_used,
      total: rateNumber === null ? item.total : `$${rateNumber.toFixed(2)}`,
      needs_review: item.match_confidence === "none" || item.match_confidence === "low",
      warning: item.match_confidence === "none" || item.match_confidence === "low" ? item.warning : "",
      match_reason: `${item.match_reason}${item.match_reason ? " " : ""}Lump-sum/equipment wording indicates quantity 1 and a spoken or matched total price.`,
    }

    return {
      ...nextItem,
      total: calculateLineItemTotal(nextItem) ?? nextItem.total,
    }
  })

  return quote
}

function lineItemCompletenessScore(item: z.infer<typeof quoteLineItemSchema>) {
  return (
    (hasLineItemQuantity(item) ? 3 : 0) +
    (hasLineItemRate(item) ? 3 : 0) +
    (item.total ? 2 : 0) +
    (!item.needs_review ? 2 : 0) +
    (item.item_code ? 1 : 0)
  )
}

function normaliseLineItemDedupeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\bweed\s*mat\b/g, "weedmat")
    .replace(/\bgreen\s*waste\b/g, "greenwaste")
    .replace(/[^a-z0-9āēīōū]/gi, "")
    .replace(/s$/i, "")
}

function materialDedupeName(item: z.infer<typeof quoteLineItemSchema>) {
  const text = [item.item_name, item.description].join(" ").toLowerCase()
  if (/\bweed\s*mat\b/.test(text)) return "weedmat"
  if (/\bdrainage\s+coil\b/.test(text)) return "drainagecoil"
  if (/\bsuper\s+strength\s+concrete\b/.test(text)) return "superstrengthconcrete"
  if (/\bconcrete\b/.test(text)) return "concrete"
  if (/\bscoria\b/.test(text)) return "scoria"
  if (/\bpebbles?\b/.test(text)) return "pebble"
  if (/\bgeotextile\b/.test(text)) return "geotextile"
  if (/\bbasecourse\b/.test(text)) return "basecourse"
  if (/\baggregate|metal\b/.test(text)) return "aggregate"
  return normaliseLineItemDedupeText(item.item_code || item.item_name || item.description)
}

function lineItemDedupeKey(item: z.infer<typeof quoteLineItemSchema>) {
  const isLabour = hasLabourSignals(item)
  if (isLabour) {
    return `labour:${normalisePlantText(item.item_code || item.item_name || item.description)}`
  }

  const isPlant = item.item_type.toLowerCase() === "plant" || /\bplants?\b/i.test([item.item_name, item.description].join(" "))
  if (isPlant) {
    return `plant:${normalisePlantText(item.item_code || item.item_name || item.description)}`
  }

  const isMaterial = /\b(material|timber|posts?|concrete|drainage\s+coil|scoria|pebbles?|weed\s*mat|weedmat|geotextile|basecourse|aggregate)\b/i.test(
    [item.item_type, item.item_name, item.description].join(" "),
  )
  if (isMaterial) {
    return `material:${materialDedupeName(item)}`
  }

  return ""
}

function dedupeLineItems(quote: z.infer<typeof processedQuoteSchema>) {
  const bestByKey = new Map<string, z.infer<typeof quoteLineItemSchema>>()
  const passthrough: z.infer<typeof quoteLineItemSchema>[] = []

  for (const item of quote.line_items) {
    const key = lineItemDedupeKey(item)
    if (!key) {
      passthrough.push(item)
      continue
    }

    const current = bestByKey.get(key)
    if (!current || lineItemCompletenessScore(item) > lineItemCompletenessScore(current)) {
      bestByKey.set(key, item)
    }
  }

  quote.line_items = [...passthrough, ...Array.from(bestByKey.values())]
  return quote
}

function transcriptMentionsWasteOrDisposal(transcript: string) {
  return /\b(green\s*waste|greenwaste|waste|skip|disposal|dispose|remove\s+material|remove\s+materials|old\s+timber|rubbish|dump|tip|hardfill|general\s+waste)\b/i.test(
    transcript,
  )
}

function pruneUnmentionedGreenwasteLineItems(quote: z.infer<typeof processedQuoteSchema>, transcript: string) {
  if (transcriptMentionsWasteOrDisposal(transcript)) return quote

  quote.line_items = quote.line_items.filter((item) => !itemLooksLikeGreenwaste(item))
  quote.greenwaste = ""
  quote.missing_information = quote.missing_information.filter((item) => !/\bgreen\s*waste|greenwaste|waste\b/i.test(item))
  quote.confidence_warnings = quote.confidence_warnings.filter((item) => !/\bgreen\s*waste|greenwaste|waste\b/i.test(item))
  return quote
}

function textIncludesLineItem(quote: z.infer<typeof processedQuoteSchema>, text: string) {
  const target = text.toLowerCase()
  return quote.line_items.some((item) =>
    [item.item_name, item.description, item.match_reason]
      .join(" ")
      .toLowerCase()
      .includes(target),
  )
}

function extractQuantityNearMaterial(transcript: string, material: string) {
  const escaped = material.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const beforeMatch = transcript.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s+(?:(lengths?|pieces?|bags?|cubes?|m3|m²|m2)\\s+(?:of\\s+)?)?${escaped}\\b`, "i"))
  if (beforeMatch?.[1]) return beforeMatch[2] ? `${beforeMatch[1]} ${beforeMatch[2]}` : beforeMatch[1]

  const afterMatch = transcript.match(new RegExp(`\\b${escaped}\\b\\s+(?:x\\s*)?(\\d+(?:\\.\\d+)?)\\b`, "i"))
  if (afterMatch?.[1]) return afterMatch[1]

  return null
}

function extractLandscapingMaterialMentions(transcript: string) {
  const materialPatterns = [
    /\b\d{2,4}\s*x\s*\d{2,4}\s*(?:h\d\s*)?(?:rough\s+sawn\s*)?(?:retaining\s*)?(?:posts?|timber|sleepers?|rails?)\b/gi,
    /\b(?:super\s+strength\s+)?concrete\b/gi,
    /\bdrainage\s+coil\b/gi,
    /\bscoria\b/gi,
    /\b\d{2,4}\s*x\s*\d{2,4}\s*posts?\b/gi,
    /\bpebbles?\b/gi,
    /\bweed\s*mat\b/gi,
    /\bgarden\s+mix\b/gi,
    /\bmulch\b/gi,
    /\bhardfill\b/gi,
    /\bold\s+soil\b/gi,
    /\bgeotextile\b/gi,
    /\bbasecourse\b/gi,
    /\b(?:gap\s*)?\d+\s*(?:metal|aggregate)\b/gi,
  ]
  const materials = new Map<string, { material: string; quantity: string | null }>()

  for (const pattern of materialPatterns) {
    for (const match of transcript.matchAll(pattern)) {
      const material = match[0].replace(/\s+/g, " ").trim()
      const key = material.toLowerCase()
      if (!materials.has(key)) {
        materials.set(key, { material, quantity: extractQuantityNearMaterial(transcript, material) })
      }
    }
  }

  return Array.from(materials.values())
}

function preserveLandscapingMaterialLineItems(
  quote: z.infer<typeof processedQuoteSchema>,
  transcript: string,
  classification: QuoteClassification,
) {
  if (classification.specialist !== "landscaping") return quote

  const materialMentions = extractLandscapingMaterialMentions(transcript)

  for (const { material, quantity } of materialMentions) {
    if (!quantity) continue
    quote.line_items = quote.line_items.map((item) => {
      const itemText = [item.item_name, item.description, item.match_reason].join(" ")
      if (!new RegExp(`\\b${material.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(itemText)) return item
      if (hasLineItemQuantity(item)) return item

      return {
        ...item,
        quantity,
        unit: item.unit || unitFromQuantity(quantity),
        warning: hasLineItemRate(item) ? "" : "Rate missing",
      }
    })

    quote.missing_information = quote.missing_information.filter(
      (item) => !(new RegExp(`\\b${material.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(item) && /\bquantity\b/i.test(item)),
    )
    quote.confidence_warnings = quote.confidence_warnings.filter(
      (item) => !(new RegExp(`\\b${material.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(item) && /\bquantity\b/i.test(item)),
    )
  }

  const missingMaterials = materialMentions.filter(
    ({ material }) => !textIncludesLineItem(quote, material),
  )

  if (missingMaterials.length === 0) return quote

  quote.line_items = [
    ...quote.line_items,
    ...missingMaterials.map(({ material, quantity }) => ({
      item_code: "",
      item_name: material,
      item_type: "material",
      description: material,
      quantity,
      unit: unitFromQuantity(quantity),
      rate: null,
      knowledge_base_rate: null,
      override_rate: null,
      final_rate_used: null,
      total: null,
      match_confidence: "low",
      match_reason: "Explicit landscaping material mentioned in transcript; no confident priced Knowledge Base match found.",
      needs_review: true,
      warning: quantity ? "Rate missing" : "Quantity missing",
    })),
  ]

  return quote
}

function unitFromQuantity(quantity: string | null) {
  if (!quantity) return ""
  const match = quantity.match(/\b(lengths?|pieces?|bags?|cubes?|m3|m²|m2|hours?|hrs?)\b/i)
  return match?.[1]?.toLowerCase() ?? ""
}

type LabourDayPeopleAllowance = {
  label: string
  days: number
  people: number
  hours: number
}

function extractLabourDayPeopleAllowances(transcript: string): LabourDayPeopleAllowance[] {
  const allowances: LabourDayPeopleAllowance[] = []
  const pattern = /\blabou?r\s+for\s+([^:\n.]+):\s*(?:assume|allow|allowing)?\s*(\d+(?:\.\d+)?)\s*days?\s*,?\s*(\d+(?:\.\d+)?)\s*people\b/gi

  for (const match of transcript.matchAll(pattern)) {
    const days = Number(match[2])
    const people = Number(match[3])
    if (!Number.isFinite(days) || !Number.isFinite(people) || days <= 0 || people <= 0) continue

    const label = (match[1] ?? "labour")
      .replace(/\s+/g, " ")
      .replace(/[.:;\s]+$/g, "")
      .trim()
    allowances.push({
      label: label || "labour",
      days,
      people,
      hours: days * people * 8,
    })
  }

  return allowances
}

function applyDeterministicLabourAllowances(
  quote: z.infer<typeof processedQuoteSchema>,
  transcript: string,
  knowledgeItemContext: unknown[],
  classification: QuoteClassification,
) {
  const allowances = extractLabourDayPeopleAllowances(transcript)
  if (allowances.length === 0) return quote

  const totalHours = allowances.reduce((sum, allowance) => sum + allowance.hours, 0)
  const bestLabourItem = findBestLabourItem(knowledgeItemContext, transcript, classification)
  const bestItemCode = typeof bestLabourItem?.item_code === "string" ? bestLabourItem.item_code : ""
  const bestItemName = typeof bestLabourItem?.item_name === "string" ? bestLabourItem.item_name : "Labour"
  const bestUnitRaw = typeof bestLabourItem?.unit === "string" && bestLabourItem.unit.trim() ? bestLabourItem.unit.trim() : ""
  const bestUnit = /\b(days?|day\s*rate|daily)\b/i.test(bestUnitRaw) ? bestUnitRaw : "hours"
  const bestRate =
    bestLabourItem?.sell_price === null || bestLabourItem?.sell_price === undefined
      ? null
      : String(bestLabourItem.sell_price)

  quote.line_items = quote.line_items.filter((item) => {
    if (!hasLabourSignals(item)) return true
    return false
  })

  const totalPersonDays = allowances.reduce((sum, allowance) => sum + allowance.days * allowance.people, 0)
  const useDayRateQuantity = /\b(days?|day\s*rate|daily)\b/i.test(bestUnit)
  const quantity = useDayRateQuantity ? `${totalPersonDays} days` : `${totalHours} hours`
  const labourLineItem = {
    item_code: bestItemCode,
    item_name: bestItemName,
    item_type: "labour",
    description: allowances.map((allowance) => `${allowance.label}: ${allowance.days} days x ${allowance.people} people x 8 hours`).join("; "),
    quantity,
    unit: bestUnit,
    rate: bestRate,
    knowledge_base_rate: bestRate,
    override_rate: null,
    final_rate_used: bestRate,
    total: null,
    match_confidence: bestLabourItem ? ("high" as const) : ("low" as const),
    match_reason: "Deterministic labour allowance calculated from spoken days, people, and 8-hour day rule.",
    needs_review: bestRate === null,
    warning: bestRate === null ? "Rate missing" : "",
  }

  quote.line_items.push({
    ...labourLineItem,
    total: calculateLineItemTotal(labourLineItem) ?? labourLineItem.total,
  })

  quote.missing_information = quote.missing_information.filter(
    (item) => !/\blabou?r\b/i.test(item) || !/\b(quantity|hours?)\b/i.test(item),
  )
  quote.confidence_warnings = quote.confidence_warnings.filter(
    (item) => !/\blabou?r\b/i.test(item) || !/\b(quantity|hours?)\b/i.test(item),
  )

  const allowanceLines = allowances.map(
    (allowance) => `${allowance.label}: ${allowance.days} days x ${allowance.people} people x 8 hours = ${allowance.hours} hours`,
  )
  const labourAllowance = [...allowanceLines, `Total planting labour: ${totalHours} hours`].join("\n")
  quote.labour_allowance = quote.labour_allowance
    ? `${quote.labour_allowance}\n${labourAllowance}`
    : labourAllowance
  quote.internal_notes = Array.isArray(quote.internal_notes) ? quote.internal_notes : []
  if (!quote.internal_notes.some((note) => note.includes("Deterministic labour calculation:"))) {
    quote.internal_notes.push(`Deterministic labour calculation:\n${labourAllowance}`)
  }

  return quote
}

function transcriptMentionsRecurringWork(transcript: string) {
  return /\b(ongoing|maintenance|maintenance\s+visits?|monthly|recurring|regular|regular\s+service|fortnightly|weekly|two[-\s]?monthly|3[-\s]?monthly|three[-\s]?monthly|every\s+\d+\s+weeks?|per\s+month)\b/i.test(
    transcript,
  )
}

function transcriptMentionsHedgePlanting(transcript: string) {
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

function transcriptMentionsHedgeTrimming(transcript: string) {
  if (transcriptMentionsHedgePlanting(transcript)) return false
  return /\b(hedge\s+trimming|trim\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|cut\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|hedge\s+reduction|reduce\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|shape\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|prune\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|lower\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|top\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge|maintain\s+(?:the\s+)?(?:[\w\s.'-]{0,30})?hedge)\b/i.test(
    transcript,
  )
}

function normalizeClassificationSpecificOutput(
  quote: z.infer<typeof processedQuoteSchema>,
  transcript: string,
  classification: QuoteClassification,
) {
  if (transcriptMentionsHedgePlanting(transcript)) {
    quote.job_type = "Hedge Planting"
    quote.quote_title = "Hedge Planting Quote"
    quote.primary_quote = {
      ...quote.primary_quote,
      quote_title: "Hedge Planting Quote",
      job_type: "Hedge Planting",
    }
  }

  const explicitJobTypeBySpecialist: Partial<Record<QuoteSpecialist, string>> = {
    electrical: "Electrical",
    building: "Building",
    plumbing: "Plumbing",
    painting: "Painting",
    cleaning: "Cleaning",
    arborist: "Arborist",
  }
  const explicitJobType = explicitJobTypeBySpecialist[classification.specialist]

  if (explicitJobType) {
    quote.job_type = explicitJobType
    quote.primary_quote = {
      ...quote.primary_quote,
      job_type: explicitJobType,
    }
  }

  const selectedTemplateName = quote.selected_template_name.toLowerCase()
  const selectedTemplateLooksLikeOngoingMaintenance =
    /\bongoing\b/.test(selectedTemplateName) ||
    /\bmaintenance\b/.test(selectedTemplateName) ||
    /\bgarden\s+maintenance\b/.test(selectedTemplateName)

  if (
    (classification.specialist === "hedge_trimming" || transcriptMentionsHedgeTrimming(transcript)) &&
    !transcriptMentionsRecurringWork(transcript) &&
    selectedTemplateLooksLikeOngoingMaintenance
  ) {
    quote.selected_template_id = ""
    quote.selected_template_name = ""
    quote.template_match_confidence = "none"
    quote.learned_rules_applied = quote.learned_rules_applied.filter(
      (rule) => !/ongoing|maintenance|monthly|recurring/i.test(rule),
    )
  }

  return quote
}

function isQuoteSpecialist(value: unknown): value is QuoteSpecialist {
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

function getSharedUniversalExtractionInstructions() {
  return `Shared universal extraction:
- Client name, site address, template matching, JMS item matching, spoken rate overrides, missing quantity/rate rules, customer/internal separation, and fallback behaviour are handled by universal rules.
- Trade-specific extractors should only prioritise details from their own trade and must still return the universal ProcessedQuote schema.
- Do not blend unrelated trade assumptions into the selected extractor. Preserve cross-trade details only when clearly spoken.`
}

function getLandscapingExtractorInstructions() {
  return `Landscaping specialist extractor:
- Key fields to extract: site area, measurements/dimensions, levels/falls, access, excavation depth, stages, construction sequence, labour/crew durations, materials, disposal, machinery/equipment, drainage, finish level, and optional extras.
- Common line item types: labour stages, excavation/site preparation, aggregate/basecourse, soil/mulch, timber/edging/retaining materials, concrete, pavers/stone, drainage products, membranes/geotextile, machine/equipment hire, delivery, greenwaste/general waste, and reinstatement/cleanup.
- Important technical terms: retaining, H4/H5 timber, posts, rails, sleepers, concrete grade/type, drainage coil, scoria, GAP/basecourse, geotextile, compacting, excavation, set-out, falls, haunching, backfill, topsoil, mulch, edging, paving, and reinstatement.
- Customer-facing scope priorities: describe the finished outcome, major stages, included preparation/installation/cleanup, visible materials, and any options or assumptions in plain NZ trade wording.
- Internal calculation priorities: preserve every measurement and dimension exactly as spoken, including units; preserve labour stages, stage durations, material lists, construction sequence, timber sizes, concrete types, fasteners, aggregates, membranes, drainage products, and product names exactly as spoken.
- Do not summarise labour-heavy or material-heavy work. Create separate detailed scope entries and line_items for distinct stages/material groups.
- Preserve each distinct material as its own line item, even when no price is found. Do not collapse materials into one generic "Materials" line.
- Confidence warning triggers: missing measurements, unclear material quantities, unclear disposal, unclear access/machine needs, unclear drainage/falls, uncertain structural details, consent/engineering uncertainty, unknown finish specification, or rate/quantity gaps.
- Put missing quantities, dimensions, specifications, and pricing into missing_information rather than inventing them.`
}

function getDeckingExtractorInstructions() {
  return `Decking specialist extractor:
- Preserve every deck measurement, dimension, level, span, timber size, board type, framing member, pile/post detail, concrete type, fastener, fixing, and finish exactly as spoken.
- Preserve demolition, excavation, foundations, framing, decking, stairs, balustrade, finishing, and cleanup as separate stages in construction order.
- Preserve labour stages and stage durations. Do not compress material-heavy or labour-heavy details.
- Put unclear structural details, quantities, consent requirements, and pricing into missing_information or confidence_warnings.`
}

function getPlantingExtractorInstructions() {
  return `Planting specialist extractor:
- Preserve plant names, cultivars, quantities, pot sizes, grades, spacing, locations, soil preparation, compost, fertiliser, mulch, staking, irrigation, and aftercare exactly as spoken.
- Separate plants, soil products, amendments, mulch, labour, delivery, and greenwaste into useful materials/line items.
- Preserve planting sequence and site-specific plant cautions. Do not invent quantities, spacing, or plant substitutions.`
}

function getHedgeTrimmingExtractorInstructions() {
  return `Hedge trimming specialist extractor:
- Preserve hedge species, locations, lengths, heights, target heights, widths, access constraints, trimming sides/tops, reduction instructions, and greenwaste details exactly as spoken.
- Distinguish routine trimming from major reduction or restoration work.
- Preserve frequency, visit duration, equipment/access needs, and disposal allowances.
- Keep plant-name uncertainty in confidence_warnings rather than silently changing it.`
}

function getGardeningMaintenanceExtractorInstructions() {
  return `Maintenance specialist extractor:
- Key fields to extract: frequency/cadence, visit duration, crew size, seasonality, site areas, access, recurring tasks, periodic tasks, greenwaste allowance, sprays/fertiliser, customer priorities, and first-visit/setup tidy scope.
- Common line item types: recurring labour per visit, greenwaste, sprays/chemicals, fertiliser/soil products, mulch/top-up materials, hedge/lawn/garden maintenance tasks, equipment allowances, travel/vehicle fees, and optional one-off tidy/setup work.
- Important technical terms: mowing, edges, weeding, pruning, trimming, deadheading, hedges, greenwaste, spraying, fertiliser, mulch, seasonal pruning, irrigation check, plant health, and visit frequency terms such as weekly/fortnightly/monthly/two-monthly/quarterly.
- Customer-facing scope priorities: clearly separate what is included every visit from periodic/as-required work, state frequency/visit allowance where captured, and describe customer-visible outcomes without overpromising.
- Internal calculation priorities: recurring cadence, hours per visit, people per visit, greenwaste allowance, chemical/fertiliser assumptions, seasonal extras, and whether pricing is per visit/month/period.
- Preserve what happens every visit versus periodically or only when required.
- Keep recurring work in primary_quote and separate one-off setup/tidy work as an optional quote when appropriate.
- Confidence warning triggers: missing frequency, missing visit duration, unclear property size/areas, unclear greenwaste inclusion, unclear spray/fertiliser products, uncertain recurring price basis, or first-visit effort not scoped.
- Do not invent frequency, visit duration, chemical/product names, or recurring prices.`
}

function getOneOffTidyExtractorInstructions() {
  return `One-off tidy specialist extractor:
- Focus on overgrowth, tidy/clearance scope, estimate wording, greenwaste allowance, access constraints, site conditions, uncertainty, and risk factors.
- Preserve cautions about plants or areas that must not be removed or disturbed.
- Use estimate/range wording when the transcript describes variable or uncertain effort.
- Keep optional extras and ongoing maintenance separate from the immediate one-off tidy.
- Do not turn uncertain site conditions into fixed quantities or fixed-price claims.`
}

function getElectricalExtractorInstructions() {
  return `Electrical specialist extractor:
- Key fields to extract: electrical task type, locations/rooms, quantities, fitting/device types, cable/conduit details, switchboard/RCD work, access, testing, certification, supply/install responsibility, make/model/product names, and outage/access constraints.
- Common line item types: labour/call-out, power points/sockets, switches, downlights/LED fittings, cable/TPS, conduit/trunking, switchboard/RCD components, testing/fault finding, certificate of compliance/CoC, travel, and consumables.
- Important technical terms: power point, powerpoint, socket, switch, downlight, LED, TPS, conduit, cable, RCD, MCB, switchboard, circuit, isolation, testing, fault finding, certificate of compliance, CoC, supply and install, and replacement.
- Customer-facing scope priorities: describe what will be installed/replaced/tested, where, and whether certification/testing is included when stated.
- Internal calculation priorities: count of fittings/devices, cable/conduit runs or lengths, labour/call-out allowance, switchboard/compliance requirements, access constraints, and whether materials are supplied by customer or contractor.
- Preserve electrical scope, locations, quantities, and product names exactly as spoken.
- Confidence warning triggers: unclear device quantities, unclear circuit/switchboard details, uncertain certification requirement, access limitations, missing product specs, customer-supplied materials uncertainty, or missing rates/quantities.
- Put missing circuit details, access constraints, compliance requirements, quantities, rates, and certificate requirements into missing_information rather than inventing them.
- Use plain trade wording and do not turn uncertain electrical details into fixed claims.`
}

function getBuildingExtractorInstructions() {
  return `Building specialist extractor:
- Key fields to extract: scope area, demolition/removal, repairs/alterations, framing, linings, cladding, fixings, waterproofing, insulation, finishing, measurements, product specs, access, site protection, sequencing, inspections, and consent/compliance notes.
- Common line item types: labour stages, demolition, framing timber, sheet/lining materials, cladding/weatherboards, fixings/fasteners, waterproofing/flashing, insulation, subcontractors, access/scaffold, disposal, delivery, cleanup, and compliance/inspection allowances.
- Important technical terms: framing, nogs, studs, joists, rafters, lintel, cladding, flashing, gib/plasterboard, ply, fixings, waterproofing, bracing, insulation, consent, inspection, PS/producer statement, and site protection.
- Customer-facing scope priorities: explain the building outcome, included preparation/removal/installation/finishing, exclusions/assumptions, and any known compliance or access requirements.
- Internal calculation priorities: preserve measurements, quantities, product names, timber sizes, sheet sizes, staged labour, inspection/consent notes, access equipment, and construction sequence.
- Separate labour, materials, disposal, subcontractor, access equipment, and compliance items where stated.
- Confidence warning triggers: missing dimensions, unclear structural specification, uncertain consent/inspection need, missing product/finish spec, hidden damage risk, access constraints, unclear disposal, or missing rates/quantities.
- Put unclear dimensions, consent requirements, structural details, rates, and exclusions into missing_information rather than inventing them.`
}

function getPlumbingExtractorInstructions() {
  return `Plumbing specialist extractor:
- Key fields to extract: fixture/appliance, location, pipe size/material, fittings/valves/traps, water/waste/gas/drainage scope, leak/blockage details, hot water unit details, pump details, excavation/reinstatement, testing, compliance/certification, and access constraints.
- Common line item types: call-out/labour, fixtures/taps/toilets/mixers, pipe/fittings/valves, traps, drains, hot water components, pumps, gas/water/waste materials, excavation, reinstatement, disposal, testing, compliance/certification, and travel.
- Important technical terms: copper, PEX, PVC, waste pipe, drain, trap, valve, mixer, tapware, toilet, cistern, hot water cylinder, califont, pump, pressure, leak, blockage, backflow, gas fitting, testing, and certification.
- Customer-facing scope priorities: describe the repair/install/investigation outcome, included fixtures/materials, reinstatement assumptions, and whether testing/compliance is included when stated.
- Internal calculation priorities: preserve pipe sizes/materials, fixture counts, labour/call-out allowance, excavation depth/length, reinstatement needs, testing/compliance requirements, and supplied-by-customer assumptions.
- Distinguish investigation, repair, replacement, installation, testing, drainage, and compliance/certification work.
- Confidence warning triggers: unclear fixture specification, unknown pipe size/material, unclear leak/blockage cause, hidden access risk, uncertain reinstatement, missing compliance requirements, missing quantities, or missing rates.
- Put missing fixture specifications, pipe sizes, pressure/drainage details, access constraints, rates, and compliance requirements into missing_information.`
}

function getPaintingExtractorInstructions() {
  return `Painting specialist extractor:
- Key fields to extract: interior/exterior, areas/rooms, surface/substrate, preparation level, number of coats, paint system/product, colours, access, repairs, protection/masking, and cleanup.
- Common line item types: labour, paint/materials, preparation/repairs, primer/undercoat/topcoat, access/scaffold, masking/protection, cleanup, and optional extras.
- Important technical terms: sanding, scraping, filling, spot prime, undercoat, topcoat, enamel, stain, sealer, plaster, weatherboard, substrate, masking, cutting in, and coats.
- Customer-facing scope priorities: surfaces included, preparation included, number of coats/product assumptions when known, and exclusions.
- Internal calculation priorities: surface areas, coat count, preparation intensity, access/scaffold, product/colour selections, and rates.
- Confidence warning triggers: missing areas, unclear surface condition, missing colours/product, unknown coat count, access uncertainty, weather constraints, or missing rates.`
}

function getCleaningExtractorInstructions() {
  return `Cleaning specialist extractor:
- Key fields to extract: cleaning type, property/room count, surfaces, frequency, duration, access, equipment, chemicals/consumables, waste, special treatments, and client priorities.
- Common line item types: labour, consumables, equipment, travel, waste, special treatments, exterior wash, and optional extras.
- Important technical terms: deep clean, regular clean, builders clean, end-of-tenancy, sanitise, degrease, pressure wash, windows, carpets, oven, bathrooms, kitchens, and consumables.
- Customer-facing scope priorities: areas included, service level, visible outcomes, add-ons, and exclusions.
- Internal calculation priorities: visit duration, room/area counts, access, equipment/chemical needs, frequency, and rates.
- Confidence warning triggers: missing room/area count, unclear service level, unclear frequency, access limitations, special product needs, or missing rates.`
}

function getArboristExtractorInstructions() {
  return `Arborist specialist extractor:
- Key fields to extract: species, tree count, height/spread, location, access, hazards, power lines, neighbouring/property risks, pruning/removal/reduction scope, stump details, waste/chipping, equipment, and permits/consents.
- Common line item types: crew/labour, climbing/rigging, chipper, stump grinder, disposal/chipping, traffic/site management, equipment hire, permits, and cleanup.
- Important technical terms: crown lift, crown reduction, deadwood, fell/remove, sectional dismantle, rigging, chipper, stump grind, canopy, limb/branch, drop zone, power lines, and protected tree.
- Customer-facing scope priorities: tree work outcome, included waste/chipping/cleanup, access assumptions, and exclusions.
- Internal calculation priorities: tree dimensions, crew/equipment, hazard/access complexity, disposal volume, stump details, permits/traffic management, and rates.
- Confidence warning triggers: unknown species/size, unclear access/hazards, power line/property risk, consent/protected tree uncertainty, disposal assumptions, or missing rates.`
}

function getGeneralFallbackExtractorInstructions() {
  return `General specialist extractor:
- Preserve all specific scope, materials, labour, durations, measurements, cautions, pricing, and sequence stated in the transcript.
- Do not invent or over-summarise details.`
}

function getSpecialistInstructions(specialist: QuoteSpecialist) {
  switch (specialist) {
    case "landscaping":
      return getLandscapingExtractorInstructions()
    case "decking":
      return getDeckingExtractorInstructions()
    case "planting":
      return getPlantingExtractorInstructions()
    case "hedge_trimming":
      return getHedgeTrimmingExtractorInstructions()
    case "maintenance":
      return getGardeningMaintenanceExtractorInstructions()
    case "one_off_tidy":
      return getOneOffTidyExtractorInstructions()
    case "electrical":
      return getElectricalExtractorInstructions()
    case "building":
      return getBuildingExtractorInstructions()
    case "plumbing":
      return getPlumbingExtractorInstructions()
    case "painting":
      return getPaintingExtractorInstructions()
    case "cleaning":
      return getCleaningExtractorInstructions()
    case "arborist":
      return getArboristExtractorInstructions()
    case "general":
      return getGeneralFallbackExtractorInstructions()
  }
}

function classifyElectricalByKeywords(transcript: string): QuoteClassification | null {
  const electricalIndicators = [
    /\belectrical\s+job\b/i,
    /\belectrical\b/i,
    /\belectrician\b/i,
    /\bsparky\b/i,
    /\bsockets?\b/i,
    /\bpower\s*points?\b/i,
    /\bpowerpoints?\b/i,
    /\bdownlights?\b/i,
    /\bswitchboards?\b/i,
    /\btps\b/i,
    /\bconduit\b/i,
    /\bcables?\b/i,
    /\brcds?\b/i,
    /\bcertificate\s+of\s+compliance\b/i,
    /\bcoc\b/i,
    /\blighting\b/i,
    /\bleds?\b/i,
    /\bfault\s+finding\b/i,
    /\btesting\b/i,
    /\binstallation\b/i,
  ]
  const matches = electricalIndicators
    .map((pattern) => transcript.match(pattern)?.[0])
    .filter((match): match is string => Boolean(match))

  const hasStrongElectricalPhrase = /\b(electrical\s+job|certificate\s+of\s+compliance|switchboard|power\s*points?|powerpoints?|downlights?|tps\s+cable)\b/i.test(
    transcript,
  )

  if (matches.length < 2 && !hasStrongElectricalPhrase) return null

  return {
    specialist: "electrical",
    reason: `High confidence electrical classification from multiple indicators: ${Array.from(new Set(matches)).join(", ")}.`,
  }
}

async function classifyTranscript(transcript: string, primaryTrade: PrimaryTrade): Promise<QuoteClassification> {
  const electricalClassification = classifyElectricalByKeywords(transcript)
  if (electricalClassification) return electricalClassification
  if (transcriptMentionsHedgePlanting(transcript)) {
    return {
      specialist: "planting",
      reason: "Hedge planting classification from plant species/planting language plus hedge length/options, with no trimming/reduction verbs.",
    }
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: QUOTE_MODEL,
      input: [
        {
          role: "system",
          content: `Classify this NZ trade quote transcript into exactly one specialist:
- maintenance: recurring garden/property maintenance, regular visits, recurring service.
- one_off_tidy: one-off tidy, overgrowth clearance, garden cleanup, variable tidy effort.
- landscaping: landscape construction, earthworks, paving, retaining, drainage, concrete, multi-stage outdoor construction.
- decking: decks, timber deck framing, piles, boards, stairs, balustrades.
- planting: planting plans/jobs focused on plants, hedge planting, plant supply/install, pot sizes, spacing, soil preparation, or plant price/size options.
- hedge_trimming: cutting, trimming, reducing, shaping, pruning, lowering, topping, or maintaining an existing hedge.
- electrical: electrical work, power points/powerpoints, downlights, switchboards, TPS, conduit, cable, RCDs, certificate of compliance/CoC, lighting, LEDs, fault finding, testing, electrical installation, or electrical upgrades.
- building: building, carpentry, framing, cladding, linings, repairs, alterations, fixings, consent/inspection-driven building work.
- plumbing: plumbing, drainage, pipework, hot water, fixtures, taps, toilets, valves, leaks, pumps, gas/water/waste connections.
- painting: interior/exterior painting, prep, priming, sanding, filling, paint systems, coats, colours, staining.
- cleaning: one-off or recurring cleaning, deep clean, end-of-tenancy, builders clean, exterior wash, surfaces, rooms, consumables.
- arborist: tree pruning/removal/reduction, chipping, stump grinding, climbing, canopy, branches, arborist hazards/permits.
- general: none of the above clearly dominates.

Electrical routing rule:
- If multiple electrical indicators are present, classify as electrical with high confidence in the reason.
- Treat "power point" and "powerpoint" as electrical indicators.

Hedge routing rule:
- If the transcript mentions a plant species plus hedge length and options/sizes/supply/install/planting, classify as planting.
- Only classify as hedge_trimming when the work is cutting, trimming, reducing, shaping, pruning, lowering, topping, or maintaining an existing hedge.

Primary trade setting:
- ${primaryTradeInstruction(primaryTrade)}

Choose the dominant primary quote intent. Return only the classification schema.`,
        },
        { role: "user", content: transcript },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quote_specialist_classification",
          strict: true,
          schema: classificationSchema,
        },
      },
    }),
  })

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof result?.error?.message === "string" ? result.error.message : "Quote classification failed."
    throw new Error(message)
  }

  const outputText = getOutputText(result)
  if (!outputText) throw new Error("OpenAI did not return quote classification JSON.")

  const classification = JSON.parse(outputText)
  if (!isQuoteSpecialist(classification?.specialist)) {
    throw new Error("OpenAI returned an invalid quote specialist classification.")
  }

  const classified = classification as QuoteClassification
  if (classified.specialist === "general" && primaryTrade !== "multi_trade") {
    return {
      specialist: primaryTradeToSpecialist(primaryTrade),
      reason: `Transcript was ambiguous/general, so primary_trade "${primaryTrade}" was used as the default signal. Original classification reason: ${classified.reason}`,
    }
  }

  return classified
}

function estimateTokensFromChars(charCount: number) {
  return Math.ceil(charCount / 4)
}

function slimKnowledgeItemContextForPrompt(knowledgeItemContext: unknown[]) {
  return knowledgeItemContext
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null)
    .filter((item) => String(item.item_type ?? "").toLowerCase() !== "plant")
    .slice(0, 24)
    .map((item) => ({
      item_code: typeof item.item_code === "string" ? item.item_code : "",
      item_name: typeof item.item_name === "string" ? item.item_name : "",
      item_type: typeof item.item_type === "string" ? item.item_type : "other",
      unit: typeof item.unit === "string" ? item.unit : "",
      sell_price: typeof item.sell_price === "number" && Number.isFinite(item.sell_price) ? item.sell_price : null,
      aliases: getStringArray(item.aliases, 4),
    }))
    .filter((item) => item.item_name || item.item_code)
}

function deterministicPlantRequestsForPrompt(transcript: string) {
  return extractPlantCalculatorRequestsFromText(transcript).map((request) => ({
    areaLabel: request.area_label ?? request.row_label ?? null,
    plantName: request.plant_name ?? null,
    hedgeLengthM: request.length_m ?? null,
    quantity: request.spoken_quantity ?? null,
    spacingMm: request.spoken_spacing_mm ?? null,
    requestedSizes: request.requested_option_sizes ?? [],
  }))
}

function promptSizeStats(systemContent: string, userContent: string, knowledgeContextText: string, requestBody: string) {
  return {
    system_prompt_chars: systemContent.length,
    system_prompt_tokens_estimate: estimateTokensFromChars(systemContent.length),
    user_prompt_chars: userContent.length,
    user_prompt_tokens_estimate: estimateTokensFromChars(userContent.length),
    knowledge_context_chars: knowledgeContextText.length,
    knowledge_context_tokens_estimate: estimateTokensFromChars(knowledgeContextText.length),
    total_prompt_chars: systemContent.length + userContent.length,
    total_prompt_tokens_estimate: estimateTokensFromChars(systemContent.length + userContent.length),
    total_request_chars: requestBody.length,
    total_request_tokens_estimate: estimateTokensFromChars(requestBody.length),
  }
}

function buildQuoteExtractionPayload(context: QuoteExtractionContext, attempt = 1) {
  const {
    transcript,
    templateContext,
    knowledgeItemContext,
    primaryTrade,
    leadDetails,
    classification,
    specialistInstructions,
  } = context
  {
  const slimKnowledgeItemContext = slimKnowledgeItemContextForPrompt(knowledgeItemContext)
  const slimKnowledgeContextText = JSON.stringify(slimKnowledgeItemContext, null, 2)
  const deterministicPlantRequests = deterministicPlantRequestsForPrompt(transcript)
  const slimSystemContent = `You extract quote facts for a NZ trade quote draft. Return only structured JSON matching the schema.

Your job:
- Extract only facts from the transcript: client name, site address, job type, customer scope, internal notes, materials mentioned, labour mentioned, exclusions, follow-up tasks, missing information, confidence warnings, and optional quote intents.
- Preserve stated plant names, planting lengths, spoken quantities, spoken spacing, requested plant sizes, and relevant notes.
- Do not calculate plant counts, plant prices, plant option totals, labour totals, JMS item codes, Knowledge Base matches, or pricing totals.
- Do not use Plant Library records. They are intentionally omitted from this prompt. Deterministic backend services run Plant Library matching and Planting Calculator after JSON parsing.
- Do not rely on full JMS/Knowledge Base matching. A tiny item summary may be provided only as wording context. Deterministic post-processing performs matching, pricing, and totals.
- If information is missing, put it in missing_information. If uncertain, put it in confidence_warnings.
- For line_items, include only explicit spoken labour/material/waste/equipment/plant facts. Use empty item_code unless the transcript explicitly says a code. Set rates/totals null unless explicitly spoken.
- Use plain NZ trade wording. Do not invent details.

Lead details:
- A deterministic pre-pass has already extracted known client/site facts. Use those known facts.
- If client_name is missing, set client_name to "Not captured" and add "Client name not captured" to missing_information.
- If site_address is missing, set site_address to "Not captured" and add "Site address not captured" to missing_information.
- If address confirmation is needed, add "Please confirm site address" to confidence_warnings.

Specialist routing:
- Primary trade setting: ${primaryTrade}. ${primaryTradeInstruction(primaryTrade)}
- This transcript was classified as "${classification.specialist}" because: ${classification.reason}
- Follow the selected specialist extractor priorities below while still returning the universal ProcessedQuote schema.

${getSharedUniversalExtractionInstructions()}

${specialistInstructions}

Templates:
- Use template context only when clearly relevant. Never copy old customer names, addresses, dates, or one-off prices.
- If no template fits, leave template fields empty and confidence "none".

Multiple quote intents:
- Put the immediate/main job in primary_quote and secondary options in optional_quotes.
- If multiple quote options are present, add "Multiple quote options detected" to confidence_warnings.`
  const retryInstruction =
    attempt > 1
      ? "\n\nRetry instruction:\nThe previous extraction did not produce valid structured JSON. Return only valid JSON matching the schema. Do not include markdown, comments, prose, or trailing commas."
      : ""
  const slimUserContent = `Extract quote facts using the ${classification.specialist} specialist extractor.

Known lead details:
${JSON.stringify(leadDetails, null, 2)}

Transcript:
${transcript}

Deterministic plant requests already found from transcript:
${JSON.stringify(deterministicPlantRequests, null, 2)}

Quote template context:
${JSON.stringify(templateContext, null, 2)}

Slim JMS/Knowledge item summaries for wording only. Full Knowledge Base and Plant Library records are intentionally omitted from the model prompt:
${slimKnowledgeContextText}${retryInstruction}`
  const slimBody = JSON.stringify({
    model: QUOTE_MODEL,
    input: [
      { role: "system", content: slimSystemContent },
      { role: "user", content: slimUserContent },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "quote_draft_extraction",
        strict: true,
        schema: quoteSchema,
      },
    },
  })

  return {
    body: slimBody,
    promptLength: slimSystemContent.length + slimUserContent.length,
    promptStats: promptSizeStats(slimSystemContent, slimUserContent, slimKnowledgeContextText, slimBody),
  }
  }

  const systemContent = `You extract quote drafts for NZ gardening and property maintenance businesses. Use plain NZ trade wording. Do not invent details. If information is missing, put it in missing_information. If a line item or value is uncertain, put the concern in confidence_warnings and set needs_review true with a clear match_reason. Return only structured JSON matching the schema.

Lead detail handling:
- A deterministic pre-pass has already extracted known client/site facts.
- Use these known facts for client_name, site_address, suburb/locality, and address confidence.
- The lead details include address.raw_address_candidate, address.cleaned_address, street_number, street_name, suburb, city_region, confidence, address_warnings, and needs_address_confirmation.
- Use address.cleaned_address for customer details, site_address, quote output, and internal context.
- If transcript corrections determine a high-confidence corrected suburb, street, or locality, use the corrected value consistently throughout customer details, site address, and quote output.
- If address.needs_address_confirmation is true, keep the extracted address but add "Please confirm site address" to confidence_warnings/internal_notes.
- Address values must stop before service/job/material words such as labour, greenwaste, green waste, bags, average, usually, monthly, maintenance, tidy, garden tidy, hedge, hedge trimming, planting, landscaping, electrical, plumbing, fertiliser/fertilizer, spray, note, internal note, dog, access, wheelbarrow, power points, downlights, Buxus, hedge, and materials.
- Do not re-derive or replace known facts unless the transcript very clearly contradicts them.
- If client_name is missing, set client_name to "Not captured", add "Client name not captured" to missing_information, and continue.
- If site_address is missing, set site_address to "Not captured", add "Site address not captured" to missing_information, and continue.
- Never fail or refuse quote extraction because client or address details are missing.

Specialist routing:
- Primary trade setting: ${primaryTrade}. ${primaryTradeInstruction(primaryTrade)}
- This transcript was classified as "${classification.specialist}" because: ${classification.reason}
- Follow the selected specialist extractor instructions below while still returning the universal ProcessedQuote schema.
- The specialist classification affects extraction priorities only. Preserve other clearly stated quote opportunities in optional_quotes.
- Use shared universal logic for lead details, template matching, JMS line-item matching, spoken overrides, missing info, customer/internal separation, and fallback assumptions.
- Keep trade-specific interpretation isolated to the selected specialist extractor.

${getSharedUniversalExtractionInstructions()}

${specialistInstructions}

Template-driven quoting:
- You may receive quote_templates belonging to the authenticated user. Use them as reusable business knowledge, not as facts about the current customer/site.
- If the transcript explicitly mentions a template name, category, or phrase such as "use the three-monthly maintenance template", choose the best matching template as the base.
- If no template is clearly mentioned, suggest/use the closest relevant template only when it genuinely fits the transcript. Do not force a template.
- For hedge_trimming jobs, do not select an ongoing garden maintenance template unless the transcript explicitly mentions ongoing, maintenance, monthly, recurring, regular, fortnightly, weekly, or similar recurring service language.
- If no template fits, return empty selected_template_id, empty selected_template_name, template_match_confidence "none", and an empty learned_rules_applied array.
- When using a template, use relevant template wording, exclusions, pricing rules, line item structure, and future AI prompt rules.
- Preserve every site-specific note, caution, plant instruction, access issue, frequency, and customer request from the transcript.
- Never hardcode old client names, addresses, dates, quote references, or one-off prices from templates.
- Replace template variables like {client_name}, {site_address}, {quote_date}, {expiry_date}, {frequency}, and {price_or_estimate_range} with transcript details where available.
- If a template variable is needed but missing from the transcript, add the variable/detail to missing_information.
- Return selected_template_id, selected_template_name, template_match_confidence ("high", "medium", "low", or "none"), and learned_rules_applied as practical bullet points explaining exactly which template rules/wording were used.

Knowledge Base JMS line-item matching:
- You may receive concise knowledge_items belonging to the authenticated user.
- Match spoken services/materials/equipment/waste to knowledge_items using item_code, item_name, item_type, aliases, and unit.
- Distinguish universal pricing items from service/description items.
- Pricing items are used for quantity x rate calculations. Signals include item_type labour/material/waste/equipment/plant/chemical/vehicle, calculable units such as hour/hr/m/m2/m3/bag/each/day/visit, available sell_price, aliases that sound like rates/materials/waste/hire, and transcript language containing quantity, rate, per hour, per metre, per bag, each, or per visit.
- Service/description items are broad quote/service descriptions. Signals include long descriptive names, broad service wording, missing/unclear units, no clear quantity/rate use, or an item that describes a whole service rather than a calculable line item.
- Prefer a pricing item over a broad service/description item when the transcript includes an explicit quantity, unit, or rate.
- Trade-aware labour matching: for landscaping, retaining, decking, paving, planting, tree removal, arborist, or construction-style landscape work, prefer labour items whose name, aliases, category, description, item_type, or unit indicate landscaping labour, landscape labour, or construction labour over generic labour items. For maintenance, prefer maintenance/gardening/hourly labour items. Future electrical/plumbing/painting/cleaning quotes should prefer matching trade labour items when available.
- Labour item scoring priorities: exact labour alias/name/code match is strongest; then trade-specific labour type match; then trade classification/category match; penalise mismatched labour types and generic labour when a trade-specific labour item exists.
- When the transcript mentions hours, hourly rate, per hour, full day, half day, people/day labour calculations, or visit duration, prefer specific hourly labour pricing items over broad labour/service items. Strong universal signals include aliases/codes/names/units like labour hours, hourly labour, labour amount, LabourHrs-style wording, hours, hr, or hourly. Avoid broad generic labour/service items unless no specific hourly item is available.
- Use knowledge_items sell_price as knowledge_base_rate only when the match is confident. Never use or infer a buy/cost price.
- If a knowledge_item has null sell_price, it can still be matched, but knowledge_base_rate must be null. Do not fill the rate from anywhere except explicit spoken override language.
- Detect explicit rate override language in the transcript, such as "$85 per hour", "at $90 per hour", "charge out rate is $95", "use $120 per visit", "$26.50 per bag", "at 12 dollars each". Put the spoken rate in override_rate.
- final_rate_used is override_rate when an explicit spoken override exists; otherwise it is knowledge_base_rate for a confident pricing-item match; otherwise null.
- rate must mirror final_rate_used for backwards display compatibility.
- Store knowledge_base_rate, override_rate, and final_rate_used separately on every line item.
- Never invent an item_code. For unmatched items, item_code must be an empty string.
- For a confident match, copy item_code, item_name, item_type, and unit exactly from the matched knowledge_item.
- Universal labour hour calculations:
  - Half day means 4 hours for 1 person.
  - Full day means 8 hours for 1 person.
  - Labour hours = people x days x 8.
  - If the transcript says "2 people for 1 day", labour quantity is "16" hours.
  - If the transcript says "2 people for 4 days", labour quantity is "64" hours.
  - If the transcript says "2 people for 5 days", labour quantity is "80" hours.
  - If the transcript explicitly provides total hours, use the spoken total hours instead of recalculating.
  - Do not collapse multi-person labour into single-person hours.
  - Put the computed total labour hours in the labour line_item quantity when the matched unit is hours/hr, and explain the calculation in match_reason.
- If a knowledge_item is confidently matched, the transcript does not provide a rate, and knowledge_base_rate is available, use knowledge_base_rate as final_rate_used. Set needs_review false when quantity and context are clear.
- Only set needs_review true for a confidently matched, priced item when quantity, unit, item context, or spoken intent is unclear.
- Calculate total from quantity multiplied by final_rate_used when both are clear.
- If quantity exists and rate/final_rate_used exists, always calculate total = quantity x rate.
- Examples: 4 bags x 26.50 = 106.00; 2 bags x 26.50 = 53.00.
- Lump-sum pricing: if the transcript says "at a cost of $X", "costing $X", "$X total", "for $X", or similar total-cost wording and no separate quantity is stated, treat it as quantity "1", final_rate_used "$X", rate "$X", total "$X", and choose item_type expense/material/waste/equipment/labour as appropriate. Put "$X" in override_rate when the value was spoken.
- If quantity is missing but final_rate_used is known, create the matched line item with quantity null, total null, needs_review true, and warning "Quantity missing".
- If quantity exists but final_rate_used is missing, create the matched line item with rate null, final_rate_used null, total null, needs_review true, and warning "Rate missing".
- If quantity exists, never use warning "Quantity missing".
- If quantity is missing, use warning "Quantity missing".
- If quantity exists but rate/final_rate_used is missing, use warning "Rate missing".
- If no confident match exists, create an unmatched line item using the spoken description, set item_code empty, match_confidence "none" or "low", explain why in match_reason, and set needs_review true.
- Keep greenwaste, materials, equipment, labour, chemicals, plant items, vehicle fees, and waste matching general; do not rely on or hardcode any specific user's item codes.
    - Plant Calculator boundary: for planting or hedge transcripts, extract plant requirements only: plant name, spoken quantity, hedge/row length, spoken spacing, requested option sizes, supplier/stock notes if spoken, and any uncertainty. Do not calculate plant counts, plant totals, or plant option prices.
    - Plant Library support: knowledge_items with item_type "plant" may include plant_name, plant_size, pot_size, spacing_mm, supplier, stock_status, notes, aliases, and sell_price from uploaded plant price lists. Use this context only to identify likely plant items/options; deterministic Plant Calculator post-processing applies spacing, counts, prices, and totals.
    - Planting quantity vs spacing: if the transcript supplies a plant quantity, such as "Plant 24 Griselinia", "Plant 18 Lomandra", or "Install 12 Ficus Tuffi", quantity is known and spacing is not required for pricing. Preserve it as extracted data and do not calculate an alternative quantity.
    - If plant quantity is known and spacing is spoken, preserve that spacing as operational/internal context. If spacing is not spoken, do not invent spacing.
    - If the transcript supplies planting length instead of quantity, such as "11m Griselinia hedge" or "25m Ficus Tuffi hedge", extract the length and plant name. Do not calculate plant quantity; deterministic Plant Calculator post-processing will use spoken spacing or Plant Library spacing. If spacing is missing from the transcript, do not invent it.
    - Do not add planting length, plant quantity, or spacing requirements unless the job is planting/hedge planting or the transcript mentions planting, plants, hedge row, shrubs, trees, plant names, or plant quantities. Do not require planting information for retaining walls, decking, pebble areas, pathways, drainage, fencing, tree removal, or general landscaping when no plants are mentioned.
    - If the user asks for plant price options, extract requested option sizes and plant names only. Do not calculate option totals or inject customer-facing option wording. Deterministic Plant Calculator post-processing will generate quote-ready option groups. If Plant Library matching is missing, leave pricing fields needing review.
- Category-aware plant matching: if the extracted item is a plant, hedge plant, shrub, tree, or groundcover, do not match chemicals, sprays, fertilisers, plant treatments, soaps, pesticides, herbicides, or fungicides unless that exact product was explicitly mentioned.
- The word "plant" alone is not enough to match products such as "Plant Soap". Prefer exact aliases, exact names, botanical names, and common plant names. If no good plant match exists, create an unmatched plant line item with needs_review true rather than matching an incorrect chemical/treatment product.
- Hire/equipment defaults: for phrases such as "hire a wood chipper", "need to hire one stump grinder", "ladder hire", "equipment hire", or "tool hire", match the best general equipment/hire knowledge_item. If the transcript implies one hire item and knowledge_base_rate is available, quantity is "1", final_rate_used is knowledge_base_rate, and needs_review is false unless the hire duration/unit or item identity is unclear.
- Examples: "4 hours labour at $85 per hour" should match the best labour pricing item, quantity "4", override_rate "$85", final_rate_used "$85"; "1.5 bags greenwaste at $26.50 per bag" should match the best waste/greenwaste pricing item; "skip at a cost of $690" should create quantity "1", override_rate "$690", final_rate_used "$690", total "$690"; "petrol for $39" should create quantity "1", final_rate_used "$39", total "$39"; "wood chipper for a day" should match the best equipment pricing item if present and use knowledge_base_rate when no spoken rate is provided; "need to hire one stump grinder" should use quantity "1" and the matched knowledge_base_rate.
- Do not add greenwaste/waste line_items unless the transcript mentions greenwaste, waste, skip, disposal, remove material, dispose, old timber, rubbish, dump/tip, hardfill, or general waste.
- Greenwaste uncertainty: if the transcript says "one or two bags", "usually one or two bags", "greenwaste volume unknown", "green waste volume unknown", or "standard greenwaste included", do not force one exact quantity. Mark the greenwaste line item needs_review true and flag the quantity as missing/uncertain.
- Missing information summary: if any line item has needs_review true with warning "Quantity missing", "Rate missing", or "Quantity and rate missing", add a concise matching item to missing_information, such as labour quantity/hours, greenwaste quantity, fertiliser quantity/rate, or spray quantity/rate.
- Return every pricing-related spoken item in line_items using the universal structured JMS line-item schema.

Location corrections:
- The transcript may include a "Corrections applied" section. Use corrected NZ place names from that section for site_address and internal context.
- Preserve raw_transcript outside this API; do not copy misheard place names back into the quote if a correction is supplied.
- Keep correction details in internal_notes when useful, not in customer-facing scope unless the location itself belongs in the customer/site details.

Gardening transcription corrections and cautions:
- Speech-to-text often mishears plant names. Treat "flecks" as likely "flax" when the context is garden plants. Preserve the plant caution in the quote text, and add a confidence warning noting the transcript said "flecks" but likely means flax.
- Treat grislynia / griselinia / grisalinea variants as likely Griselinia.
- Treat ficus tuffy / ficus tuffi / tuffy as likely Ficus Tuffi when the context is hedging.
- Treat buxus and box hedge as the same likely plant/hedge reference.
- Treat pittosporum variants as likely Pittosporum.
- If a phrase sounds like a plant name, preserve it in scope/notes and add a confidence warning instead of silently changing it.
- If the transcript says not to remove a plant, keep it as an internal/site caution and include it customer-facing when appropriate. Example: "do not remove any flecks" should become "Do not remove any flax" with a confidence warning.

Multiple quote intent handling:
- Detect when one transcript contains more than one quote opportunity.
- Put the main immediate job in primary_quote.
- Put secondary or recurring options in optional_quotes.
- If there is more than one quote option, include "Multiple quote options detected" in confidence_warnings.
- For a transcript with an initial garden tidy and ongoing two-monthly maintenance, make the initial tidy the primary_quote and the two-monthly maintenance an optional quote.

Keep customer_scope focused on the primary quote, but mention important site cautions like "Do not remove flax" when customer-visible.`
  const retryInstruction =
    attempt > 1
      ? "\n\nRetry instruction:\nThe previous extraction did not produce valid structured JSON. Return only valid JSON matching the schema. Do not include markdown, comments, prose, or trailing commas."
      : ""
  const userContent = `Extract a quote draft using the ${classification.specialist} specialist extractor.\n\nPrimary trade setting:\n${primaryTrade}\n\nKnown lead details from deterministic pre-pass:\n${JSON.stringify(leadDetails, null, 2)}\n\nTranscript:\n${transcript}\n\nAuthenticated user's concise quote template context:\n${JSON.stringify(templateContext, null, 2)}\n\nAuthenticated user's concise JMS knowledge item context:\n${JSON.stringify(knowledgeItemContext, null, 2)}${retryInstruction}`

  return {
    body: JSON.stringify({
      model: QUOTE_MODEL,
      input: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quote_draft_extraction",
          strict: true,
          schema: quoteSchema,
        },
      },
    }),
    promptLength: systemContent.length + userContent.length,
  }
}

function logQuoteExtractionFailure(error: QuoteExtractionError, attempt: number) {
  console.log("process-quote extraction failure", {
    attempt,
    stage: error.stage,
    retryable: error.retryable,
    message: error.message,
    ...error.details,
  })
}

async function runQuoteExtractionAttempt(
  context: QuoteExtractionContext,
  attempt: number,
): Promise<QuoteExtractionAttempt> {
  const startedAt = Date.now()
  const { body, promptLength, promptStats } = buildQuoteExtractionPayload(context, attempt)
  let response: Response

  console.log("process-quote prompt size", {
    attempt,
    model: QUOTE_MODEL,
    ...promptStats,
  })

  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(QUOTE_EXTRACTION_TIMEOUT_MS),
    })
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError"
    throw new QuoteExtractionError(isTimeout ? "OpenAI quote extraction timed out." : "OpenAI quote extraction request failed.", isTimeout ? "timeout" : "network_request", isTimeout, {
      model: QUOTE_MODEL,
      prompt_length: promptLength,
      response_length: null,
      transcript_length: context.transcript.length,
      timeout_ms: QUOTE_EXTRACTION_TIMEOUT_MS,
      timeout_error: isTimeout,
      parse_failure_reason: isTimeout ? "request timed out before response body was received" : null,
      error_message: error instanceof Error ? error.message : String(error),
      extraction_time_ms: Date.now() - startedAt,
    })
  }

  const responseBody = await response.text()
  const responseParse = responseBody
    ? parseJsonWithRepair(responseBody)
    : { parsed: null, repaired: false, repairedText: "", errorMessage: "empty response body" }
  const result = responseParse.parsed
  if (responseBody && result === null) {
    console.log("process-quote raw OpenAI response parse failure", {
      model: QUOTE_MODEL,
      prompt_length: promptLength,
      response_length: responseBody.length,
      parser_error: responseParse.errorMessage,
      raw_openai_response: responseBody,
    })
    throw new QuoteExtractionError("OpenAI response body was not valid JSON.", "openai_response_json_parse", true, {
      openai_status: response.status,
      model: QUOTE_MODEL,
      prompt_length: promptLength,
      response_length: responseBody.length,
      transcript_length: context.transcript.length,
      json_parse_error: responseParse.errorMessage,
      parse_failure_reason: responseParse.errorMessage,
      original_response: responseBody,
      original_response_preview: responseBody.slice(0, 2000),
      repaired_response_preview: responseParse.repairedText.slice(0, 2000),
      reliability_metric: "failed",
      extraction_time_ms: Date.now() - startedAt,
    })
  }

  if (responseParse.repaired) {
    console.log("process-quote repaired OpenAI response envelope JSON", {
      attempt,
      model: QUOTE_MODEL,
      original_response: responseBody.slice(0, 2000),
      repaired_response: responseParse.repairedText.slice(0, 2000),
      reliability_metric: "repaired_success",
    })
  }

  if (!response.ok) {
    const responseObject = result && typeof result === "object" ? (result as Record<string, any>) : {}
    const message =
      typeof responseObject?.error?.message === "string"
        ? responseObject.error.message
        : "OpenAI quote extraction failed."

    throw new QuoteExtractionError(message, "openai_analysis", false, {
      openai_status: response.status,
      model: QUOTE_MODEL,
      prompt_length: promptLength,
      response_length: responseBody.length,
      transcript_length: context.transcript.length,
      response_body: responseObject,
      extraction_time_ms: Date.now() - startedAt,
    })
  }

  const outputText = getOutputText(result)
  if (!outputText) {
    const directValidation = processedQuoteSchema.safeParse(result)
    if (directValidation.success) {
      console.log("process-quote recovered direct quote JSON from OpenAI response body", {
        attempt,
        model: QUOTE_MODEL,
        prompt_length: promptLength,
        response_length: responseBody.length,
        repaired: responseParse.repaired,
        reliability_metric: responseParse.repaired ? "repaired_success" : "first_pass_success",
      })

      return {
        quote: directValidation.data,
        elapsedMs: Date.now() - startedAt,
        promptLength,
        responseLength: responseBody.length,
        reliabilityMetric: attempt > 1 ? "retry_success" : responseParse.repaired ? "repaired_success" : "first_pass_success",
      }
    }

    throw new QuoteExtractionError("OpenAI returned incomplete quote output.", "incomplete_output", true, {
      openai_status: response.status,
      model: QUOTE_MODEL,
      prompt_length: promptLength,
      response_length: responseBody.length,
      transcript_length: context.transcript.length,
      parse_failure_reason: "missing output_text in OpenAI response",
      response_body: result,
      extraction_time_ms: Date.now() - startedAt,
    })
  }

  const outputParse = parseJsonWithRepair(outputText)
  const parsedOutput = outputParse.parsed
  if (parsedOutput === null) {
    throw new QuoteExtractionError("OpenAI quote JSON parse failed.", "json_parse_failed", true, {
      openai_status: response.status,
      model: QUOTE_MODEL,
      prompt_length: promptLength,
      response_length: outputText.length,
      transcript_length: context.transcript.length,
      json_parse_error: outputParse.errorMessage,
      parse_failure_reason: outputParse.errorMessage,
      original_response: responseBody.slice(0, 2000),
      model_output_preview: outputText.slice(0, 2000),
      repaired_response_preview: outputParse.repairedText.slice(0, 2000),
      reliability_metric: "failed",
      extraction_time_ms: Date.now() - startedAt,
    })
  }

  if (outputParse.repaired) {
    console.log("process-quote repaired model output JSON", {
      attempt,
      model: QUOTE_MODEL,
      original_response: outputText.slice(0, 2000),
      repaired_response: outputParse.repairedText.slice(0, 2000),
      reliability_metric: "repaired_success",
    })
  }

  const validation = processedQuoteSchema.safeParse(parsedOutput)
  if (!validation.success) {
    throw new QuoteExtractionError("OpenAI quote schema validation failed.", "schema_validation_failed", true, {
      openai_status: response.status,
      model: QUOTE_MODEL,
      prompt_length: promptLength,
      response_length: outputText.length,
      transcript_length: context.transcript.length,
      parse_failure_reason: "output did not match ProcessedQuote schema",
      schema_validation_errors: validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      model_output_preview: outputText.slice(0, 1000),
      extraction_time_ms: Date.now() - startedAt,
    })
  }

  return {
    quote: validation.data,
    elapsedMs: Date.now() - startedAt,
    promptLength,
    responseLength: outputText.length,
    reliabilityMetric: attempt > 1 ? "retry_success" : responseParse.repaired || outputParse.repaired ? "repaired_success" : "first_pass_success",
  }
}

async function extractQuoteWithRetry(context: QuoteExtractionContext) {
  let lastError: QuoteExtractionError | null = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await runQuoteExtractionAttempt(context, attempt)
      console.log("process-quote extraction reliability", {
        attempt,
        model: QUOTE_MODEL,
        prompt_length: result.promptLength,
        response_length: result.responseLength,
        transcript_length: context.transcript.length,
        extraction_time_ms: result.elapsedMs,
        reliability_metric: result.reliabilityMetric,
        retry_result: attempt > 1 ? "retry succeeded" : "not retried",
      })
      return result
    } catch (error) {
      if (error instanceof QuoteExtractionError) {
        lastError = error
        logQuoteExtractionFailure(error, attempt)
        console.log("process-quote extraction reliability", {
          attempt,
          model: QUOTE_MODEL,
          transcript_length: context.transcript.length,
          reliability_metric: attempt === 1 && error.retryable ? "failed_retrying" : "failed",
          retry_result: attempt === 1 && error.retryable ? "retry scheduled" : "retry unavailable or failed",
          failed_stage: error.stage,
          error_message: error.message,
        })
        if (attempt === 1 && error.retryable) continue
        throw error
      }

      const wrapped = new QuoteExtractionError("Unexpected quote extraction error.", "unexpected_extraction_error", false, {
        model: QUOTE_MODEL,
        transcript_length: context.transcript.length,
        error_message: error instanceof Error ? error.message : String(error),
      })
      lastError = wrapped
      logQuoteExtractionFailure(wrapped, attempt)
      throw wrapped
    }
  }

  throw lastError ?? new QuoteExtractionError("Quote extraction failed.", "unknown", false)
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : ""
    const templateContext = getTemplateContext(body?.template_context)
    const knowledgeItemContext = getKnowledgeItemContext(body?.knowledge_item_context)
    const primaryTrade = getPrimaryTrade(body?.primary_trade)

    if (!transcript) {
      return NextResponse.json({ error: "Transcript text is required." }, { status: 400 })
    }

    const leadDetails = extractLeadDetails(transcript)
    console.log("process-quote lead details", {
      client_name: leadDetails.client_name,
      site_address: leadDetails.site_address,
      suburb_locality: leadDetails.suburb_locality,
      raw_address_candidate: leadDetails.address.raw_address_candidate,
      cleaned_address: leadDetails.address.cleaned_address,
      address_confidence: leadDetails.address.confidence,
      needs_address_confirmation: leadDetails.address.needs_address_confirmation,
      address_warnings: leadDetails.address.address_warnings,
      confidence: leadDetails.confidence,
      missing_fields: leadDetails.missing_fields,
      primary_trade: primaryTrade,
    })

    let classification: QuoteClassification = {
      specialist: primaryTradeToSpecialist(primaryTrade),
      reason:
        primaryTrade === "multi_trade"
          ? "Fallback classification used before quote extraction."
          : `Fallback classification from primary_trade "${primaryTrade}".`,
    }

    try {
      classification = await classifyTranscript(transcript, primaryTrade)
    } catch (error) {
      console.log("process-quote classification fallback", {
        error: getErrorMessage(error, "Unknown classification error"),
        primary_trade: primaryTrade,
      })
    }

    const specialistInstructions = getSpecialistInstructions(classification.specialist)
    const totalQuoteStartedAt = Date.now()
    const extractionContext: QuoteExtractionContext = {
      transcript,
      templateContext,
      knowledgeItemContext,
      primaryTrade,
      leadDetails,
      classification,
      specialistInstructions,
    }

    try {
      const extraction = await extractQuoteWithRetry(extractionContext)
      const quote = applyAddressReviewDetails(
        removeCapturedLeadMissingInformation(
          surfaceLineItemMissingInformation(
            normalizeClassificationSpecificOutput(
              dedupeLineItems(
                normalizeLineItemWarnings(
                  pruneUnmentionedGreenwasteLineItems(
                    applyLumpSumQuantityDefaults(
                      enforcePlantCategoryMatching(
                        applyPlantingCalculator(
                          preserveGreenwasteUncertainty(
                            applyDeterministicLabourAllowances(
                              preserveLandscapingMaterialLineItems(
                                preferTradeAwareLabourLineItems(extraction.quote, transcript, knowledgeItemContext, classification),
                                transcript,
                                classification,
                              ),
                              transcript,
                              knowledgeItemContext,
                              classification,
                            ),
                            transcript,
                          ),
                          transcript,
                          knowledgeItemContext,
                        ),
                        transcript,
                      ),
                      transcript,
                    ),
                    transcript,
                  ),
                ),
              ),
              transcript,
              classification,
            ),
          ),
          leadDetails,
        ),
        leadDetails,
      )
      quote.client_name = leadDetails.client_name ?? quote.client_name ?? "Not captured"
      quote.site_address = formatLeadSiteAddress(leadDetails) ?? quote.site_address ?? "Not captured"
      attachMatchedLineItemMetadata(quote, knowledgeItemContext)
      quote.missing_information = Array.isArray(quote.missing_information) ? quote.missing_information : []

      if (!leadDetails.client_name && !quote.missing_information.includes("Client name not captured")) {
        quote.missing_information.push("Client name not captured")
      }

      if (!leadDetails.site_address && !quote.missing_information.includes("Site address not captured")) {
        quote.missing_information.push("Site address not captured")
      }

      console.log("process-quote completed", {
        client_name: quote.client_name,
        site_address: quote.site_address,
        confidence: leadDetails.confidence,
        fallback_used: false,
        model: QUOTE_MODEL,
        prompt_length: extraction.promptLength,
        transcript_length: transcript.length,
        extraction_time_ms: extraction.elapsedMs,
        total_quote_generation_time_ms: Date.now() - totalQuoteStartedAt,
      })

      return NextResponse.json(quote)
    } catch (error) {
      const message = getErrorMessage(error)
      console.log("process-quote fallback used", {
        client_name: leadDetails.client_name,
        site_address: leadDetails.site_address,
        confidence: leadDetails.confidence,
        model: QUOTE_MODEL,
        transcript_length: transcript.length,
        error: message,
        total_quote_generation_time_ms: Date.now() - totalQuoteStartedAt,
      })

      console.log("process-quote extraction reliability", {
        model: QUOTE_MODEL,
        transcript_length: transcript.length,
        reliability_metric: "failed",
        retry_result: "fallback quote returned",
        error_message: message,
      })

      return NextResponse.json(fallbackQuote(transcript, leadDetails, classification, message, templateContext))
    }
  } catch {
    return NextResponse.json({ error: "Unexpected quote processing error." }, { status: 500 })
  }
}
