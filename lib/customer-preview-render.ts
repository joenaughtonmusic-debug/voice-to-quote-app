import { assembleCustomerQuote, type CustomerQuoteAssembly } from "./customer-quote-assembly"
import type { CustomerQuotePreview } from "./customer-quote-preview"
import type { ProcessedQuote } from "./processed-quote"
import type { SandboxRenderedTemplateSection } from "./template-preview-sandbox"
import type { SelectedQuoteTemplate } from "./template-renderer"

export type CustomerDraftPreviewMode = "standard" | "template"

export type CustomerDraftPreviewRenderInput = {
  processedQuote: ProcessedQuote
  customerPreview: CustomerQuotePreview
  mode?: CustomerDraftPreviewMode
  templateSections?: SandboxRenderedTemplateSection[]
  rawTranscript?: string | null
  selectedTemplate?: SelectedQuoteTemplate | null
}

export type CustomerDraftPreviewModel = {
  mode: CustomerDraftPreviewMode
  clientName: string
  siteAddress: string
  quoteTitle: string
  jobType: string
  scopeItems: string[]
  pricingLines: string[]
  labourLines: string[]
  materialLines: string[]
  plantLines: string[]
  exclusions: string[]
  templateSections: SandboxRenderedTemplateSection[]
  assembly: CustomerQuoteAssembly | null
}

export function buildCustomerDraftPreviewModel({
  processedQuote,
  customerPreview,
  mode = "standard",
  templateSections = [],
  rawTranscript,
  selectedTemplate,
}: CustomerDraftPreviewRenderInput): CustomerDraftPreviewModel {
  const fallbackQuoteTitle =
    processedQuote.quote_title || processedQuote.primary_quote.quote_title || processedQuote.job_type || "Quote"
  const scopeItems = customerPreview.scopeItems.length > 0
    ? customerPreview.scopeItems
    : [...processedQuote.customer_scope, ...processedQuote.primary_quote.scope, ...processedQuote.primary_quote.notes]
        .map((item) => item.trim())
        .filter(Boolean)
  const assembly = assembleCustomerQuote({
    quote: {
      ...processedQuote,
      customer_scope: scopeItems,
    },
    rawTranscript,
    selectedTemplate,
    pricingFacts: customerPreview.pricingFacts.map((fact) => ({
      id: fact.id,
      type: "fixed_price",
      amount: Number(fact.amountText.replace(/[^0-9.]+/g, "")),
      amount_min: null,
      amount_max: null,
      currency: "NZD",
      cadence: fact.cadenceText === "per visit" ? "per_visit" : null,
      label: "Price",
      inclusions: fact.inclusions,
      source_text: fact.amountText,
      confidence: "high",
    })),
  })

  return {
    mode,
    clientName: processedQuote.client_name || "Not captured",
    siteAddress: processedQuote.site_address || "Not captured",
    quoteTitle: assembly?.title || fallbackQuoteTitle,
    jobType: processedQuote.job_type,
    scopeItems,
    pricingLines: customerPreview.pricingFacts.flatMap((fact) => [
      fact.cadenceText ? `Price ${fact.cadenceText}: ${fact.amountText}` : `Price: ${fact.amountText}`,
      fact.inclusions.length > 0 ? `Includes ${fact.inclusions.join(", ")}` : "",
    ]).filter(Boolean),
    labourLines: customerPreview.labourLine
      ? [
          customerPreview.labourLine.label,
          customerPreview.labourLine.amount ?? "",
        ].filter(Boolean)
      : [],
    materialLines: customerPreview.materialLines.flatMap((line) => [line.label, line.detail ?? "", line.amount ?? ""]).filter(Boolean),
    plantLines: customerPreview.plantOptions.flatMap((option) => [
      `${option.label} - ${option.title}`,
      option.quantityText,
      option.subtotalText,
    ]),
    exclusions: processedQuote.exclusions.map((item) => item.trim()).filter(Boolean),
    templateSections,
    assembly,
  }
}

export function renderCustomerDraftPreviewText(model: CustomerDraftPreviewModel) {
  const body =
    model.assembly
      ? model.assembly.sections.flatMap((section) => [section.title, ...section.items])
      : model.mode === "template" && model.templateSections.length > 0
        ? model.templateSections.flatMap((section) => [section.sectionName, section.renderedText])
      : [
          "Scope",
          ...model.scopeItems,
          "Price",
          ...model.pricingLines,
          "Labour",
          ...model.labourLines,
          "Materials / removal",
          ...model.materialLines,
          "Plants",
          ...model.plantLines,
          "Excludes",
          ...(model.exclusions.length > 0 ? model.exclusions : ["No exclusions captured."]),
        ]

  return [
    "Prepared for",
    model.clientName,
    model.siteAddress,
    "Quote",
    model.quoteTitle,
    model.assembly ? "" : model.jobType,
    ...body,
  ]
    .filter(Boolean)
    .join("\n")
}
