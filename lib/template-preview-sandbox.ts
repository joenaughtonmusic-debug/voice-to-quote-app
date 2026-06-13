import type { QuoteTemplateLibraryItem, QuoteTemplateSectionDraft, TemplateImportPlaceholder } from "./template-import-learning"
import type { CustomerPreviewPricingFact } from "./customer-quote-preview"
import {
  quoteFactsForCategory,
  quoteFactsFromProcessedQuote,
  type QuoteFact,
  type QuoteFactCategory,
} from "./core/quote-facts"
import type { CustomerQuotePreview } from "./customer-quote-preview"
import type { ProcessedQuote } from "./processed-quote"

type TemplatePreviewPlaceholder = TemplateImportPlaceholder | "{{waste_scope}}"

export type SandboxRenderedTemplateSection = {
  id: string
  displayOrder: number
  sectionName: string
  category: string
  renderedText: string
  missingPlaceholders: string[]
}

const SAFE_PLACEHOLDERS: TemplatePreviewPlaceholder[] = [
  "{{customer_name}}",
  "{{site_address}}",
  "{{job_scope}}",
  "{{labour_scope}}",
  "{{materials_scope}}",
  "{{waste_scope}}",
  "{{plant_options}}",
  "{{exclusions}}",
  "{{terms}}",
]

const SAMPLE_TEMPLATE_QUOTE: Record<TemplatePreviewPlaceholder, string> = {
  "{{customer_name}}": "Alex Morgan",
  "{{site_address}}": "18 Sample Road, Mount Eden",
  "{{job_scope}}": [
    "Construct new timber deck to the nominated outdoor area.",
    "Set out deck area and confirm finished height on site.",
    "Install timber subframe and decking boards to completed structure.",
  ].join("\n"),
  "{{labour_scope}}": "Allow labour to construct deck structure and install decking boards.",
  "{{materials_scope}}": [
    "Timber subframe materials.",
    "Decking boards.",
    "Concrete / post mix.",
    "Fixings and hardware.",
  ].join("\n"),
  "{{waste_scope}}": "Remove offcuts and general construction waste from work area.",
  "{{plant_options}}": "No plant options in this sample quote.",
  "{{exclusions}}": [
    "Council consent, engineering, or design fees unless specifically stated.",
    "Electrical work unless specifically stated.",
    "Unexpected ground conditions or hidden obstructions.",
  ].join("\n"),
  "{{terms}}": "Quote is valid for 30 days. Final price may change if site conditions differ from the information provided.",
}

function placeholderFallbackForCategory(category: string | null | undefined): TemplatePreviewPlaceholder | null {
  if (category === "template_title") return null
  if (category === "job_scope") return "{{job_scope}}"
  if (category === "labour") return "{{labour_scope}}"
  if (category === "materials") return "{{materials_scope}}"
  if (category === "waste") return "{{waste_scope}}"
  if (category === "plants") return "{{plant_options}}"
  if (category === "exclusions") return "{{exclusions}}"
  if (category === "terms") return "{{terms}}"
  return null
}

function sectionTemplateText(section: QuoteTemplateSectionDraft) {
  const explicitText = section.template_text?.trim() || section.raw_text?.trim()
  if (explicitText) return explicitText

  const fallback = placeholderFallbackForCategory(String(section.section_category ?? ""))
  return fallback ?? ""
}

function sectionHasSafePlaceholder(value: string) {
  return SAFE_PLACEHOLDERS.some((placeholder) => value.includes(placeholder))
}

function quotePlaceholderValues(
  quote: ProcessedQuote,
  preview?: CustomerQuotePreview,
): Partial<Record<TemplatePreviewPlaceholder, string>> {
  const facts = quoteFactsFromProcessedQuote(quote)
  return {
    "{{customer_name}}": metadataFieldFact(facts, "client_name")?.description,
    "{{site_address}}": metadataFieldFact(facts, "site_address")?.description,
    "{{job_scope}}": joinedFactDescriptions(preferredFactsForCategory(facts, "job_scope")),
    "{{labour_scope}}": labourScopeFromPreview(preview) ?? joinedFactDescriptions(preferredFactsForCategory(facts, "labour")),
    "{{materials_scope}}":
      materialScopeFromPreview(preview, "materials") ?? joinedFactDescriptions(preferredFactsForCategory(facts, "materials")),
    "{{waste_scope}}": materialScopeFromPreview(preview, "waste") ?? joinedFactDescriptions(preferredFactsForCategory(facts, "waste")),
    "{{plant_options}}": plantOptionsFromPreview(preview) ?? joinedFactDescriptions(preferredFactsForCategory(facts, "plants")),
    "{{exclusions}}": joinedFactDescriptions(preferredFactsForCategory(facts, "exclusions")),
    "{{terms}}": undefined,
  }
}

function templateDefaultScope(template?: QuoteTemplateLibraryItem | null) {
  const content = template?.template_content
  const contentScope =
    content && typeof content === "object"
      ? stringParts([
          (content as Record<string, unknown>).reusable_customer_wording,
          (content as Record<string, unknown>).default_scope,
          (content as Record<string, unknown>).customer_scope,
        ])
      : []

  return [...contentScope, ...stringParts(template?.default_scope)]
}

function stringParts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(stringParts)
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  if (!value || typeof value !== "object") return []
  return Object.values(value as Record<string, unknown>).flatMap(stringParts)
}

function metadataFieldFact(facts: QuoteFact[], field: string) {
  return facts.find((fact) => fact.metadata?.field === field && fact.description.trim())
}

function preferredFactsForCategory(facts: QuoteFact[], category: QuoteFactCategory) {
  const categoryFacts = quoteFactsForCategory(facts, category)
  return categoryFacts
}

function joinedFactDescriptions(facts: QuoteFact[]) {
  const seen = new Set<string>()
  const values = facts
    .map((fact) => fact.description.trim())
    .filter((description) => {
      if (!description) return false
      const key = description.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return values.length > 0 ? values.join("\n") : undefined
}

function labourScopeFromPreview(preview: CustomerQuotePreview | undefined) {
  if (!preview?.labourLine) return undefined

  const amount = preview.labourLine.amount?.trim()
  return [`${preview.labourLine.label} allowance.`, amount].filter(Boolean).join("\n")
}

function plantOptionsFromPreview(preview: CustomerQuotePreview | undefined) {
  if (!preview || preview.plantOptions.length === 0) return undefined

  const seen = new Set<string>()
  const values = preview.plantOptions
    .map((option) => option.title.trim())
    .filter((title) => {
      if (!title) return false
      const key = title.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return values.length > 0 ? values.join("\n") : undefined
}

function materialScopeFromPreview(preview: CustomerQuotePreview | undefined, kind: "materials" | "waste") {
  if (!preview || preview.materialLines.length === 0) return undefined

  const values = preview.materialLines
    .filter((line) => (kind === "waste" ? isWasteMaterialLine(line.label) : !isWasteMaterialLine(line.label)))
    .map((line) => line.label.trim())
    .filter(Boolean)

  return values.length > 0 ? uniqueLines(values).join("\n") : undefined
}

function isWasteMaterialLine(value: string) {
  return /\bhardfill|soil\s+removal|spoil|waste|removal\b/i.test(value)
}

function uniqueLines(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function combineJobScopeText({
  quoteScope,
  sectionText,
  defaultScope,
}: {
  quoteScope?: string
  sectionText: string
  defaultScope: string[]
}) {
  return uniqueLines([
    ...(quoteScope ?? "").split(/\r?\n/),
    ...sectionText.split(/\r?\n/),
    ...defaultScope,
  ])
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}

function pricingSectionText(pricingFacts: CustomerPreviewPricingFact[]) {
  return pricingFacts
    .map((fact) =>
      [
        fact.cadenceText ? `Price ${fact.cadenceText}: ${fact.amountText}` : `Price: ${fact.amountText}`,
        fact.inclusions.length > 0 ? `Includes ${fact.inclusions.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n")
}

function renderSectionText(
  sourceText: string,
  values: Partial<Record<TemplatePreviewPlaceholder, string>>,
) {
  const missingPlaceholders: string[] = []
  let renderedText = sourceText

  for (const placeholder of SAFE_PLACEHOLDERS) {
    if (!renderedText.includes(placeholder)) continue

    const replacement = values[placeholder]?.trim()
    if (replacement) {
      renderedText = renderedText.split(placeholder).join(replacement)
    } else {
      renderedText = renderedText.split(placeholder).join("")
      missingPlaceholders.push(placeholder)
    }
  }

  return { renderedText: renderedText.trim(), missingPlaceholders }
}

export function renderTemplateSandboxSections(sections: QuoteTemplateSectionDraft[]): SandboxRenderedTemplateSection[] {
  return [...sections]
    .sort((a, b) => a.display_order - b.display_order)
    .map((section) => {
      const sourceText = sectionTemplateText(section)
      const rendered = renderSectionText(sourceText, SAMPLE_TEMPLATE_QUOTE)

      return {
        id: section.id,
        displayOrder: section.display_order,
        sectionName: section.section_name?.trim() || "Untitled section",
        category: String(section.section_category ?? "custom"),
        renderedText: rendered.renderedText,
        missingPlaceholders: rendered.missingPlaceholders,
      }
    })
}

export function renderTemplatePreviewSections(
  sections: QuoteTemplateSectionDraft[],
  quote: ProcessedQuote,
  preview: CustomerQuotePreview,
  selectedTemplate?: QuoteTemplateLibraryItem | null,
): SandboxRenderedTemplateSection[] {
  const values = quotePlaceholderValues(quote, preview)
  const defaultScope = templateDefaultScope(selectedTemplate)
  const hasPricingSection = sections.some((section) =>
    /\b(pricing|price|investment|total)\b/i.test(`${section.section_name ?? ""} ${section.section_category ?? ""} ${section.raw_text ?? ""} ${section.template_text ?? ""}`),
  )
  const customerPriceText = pricingSectionText(preview.pricingFacts)

  const renderedSections = [...sections]
    .filter((section) => section.customer_facing !== false)
    .sort((a, b) => a.display_order - b.display_order)
    .map((section) => {
      const rawSourceText = sectionTemplateText(section)
      const fallback = placeholderFallbackForCategory(String(section.section_category ?? ""))
      const isPlainJobScope =
        section.section_category === "job_scope" && rawSourceText.trim() && !sectionHasSafePlaceholder(rawSourceText)
      const sourceText =
        isPlainJobScope
          ? combineJobScopeText({
              quoteScope: values["{{job_scope}}"],
              sectionText: rawSourceText,
              defaultScope,
            })
          : sectionHasSafePlaceholder(rawSourceText) || !fallback || section.section_category === "terms" || section.section_category === "template_title"
          ? rawSourceText
          : fallback
      const rendered = renderSectionText(sourceText, values)
      const renderedText =
        section.section_category === "job_scope"
          ? combineJobScopeText({
              quoteScope: rendered.renderedText,
              sectionText: "",
              defaultScope,
            })
          : rendered.renderedText

      return {
        id: section.id,
        displayOrder: section.display_order,
        sectionName: section.section_name?.trim() || "Untitled section",
        category: String(section.section_category ?? "custom"),
        renderedText,
        missingPlaceholders: rendered.missingPlaceholders,
      }
    })

  if (!hasPricingSection && customerPriceText) {
    renderedSections.push({
      id: "pricing-facts",
      displayOrder: Number.MAX_SAFE_INTEGER,
      sectionName: "Price",
      category: "pricing",
      renderedText: customerPriceText,
      missingPlaceholders: [],
    })
  }

  return renderedSections
}
