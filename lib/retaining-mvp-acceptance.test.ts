import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { quoteFactsFromProcessedQuote } from "./core/quote-facts"
import { buildCustomerPreviewQuoteInput } from "./customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "./customer-preview-render"
import { buildCustomerQuotePreview } from "./customer-quote-preview"
import { normalizeFencingProcessedQuote } from "./fencing-processing"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import { buildRetainingProcessedQuote, normalizeRetainingProcessedQuote } from "./retaining-processing"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import { recommendTemplateForQuote, scoreTemplatesForQuote } from "./template-recommendation"
import { hasPlantingCalculatorIntent } from "./trades/planting/intent"
import { calculateRetaining, detectRetainingFromText } from "./trades/retaining"

const ACCEPTANCE_DOC = "docs/RETAINING_MVP_ACCEPTANCE.md"

const retainingTemplate: QuoteTemplateLibraryItem = {
  id: "retaining",
  template_name: "Retaining",
  category: "retaining",
  trade: "retaining",
  job_type: "retaining",
  document_type: "quote_template",
  common_line_items: ["Retaining wall labour", "H4 posts", "Fence reinstatement"],
  status: "active",
}

const otherTemplates: QuoteTemplateLibraryItem[] = [
  { id: "planting", template_name: "Planting", category: "planting", trade: "planting", job_type: "planting", document_type: "quote_template", common_line_items: ["Planting labour"], status: "active" },
  { id: "maintenance", template_name: "Ongoing Garden Maintenance", category: "maintenance", trade: "maintenance", job_type: "maintenance", document_type: "quote_template", common_line_items: ["Garden maintenance"], status: "active" },
  { id: "tidy", template_name: "One-Off Garden Tidy", category: "garden_tidy", trade: "maintenance", job_type: "garden_tidy", document_type: "quote_template", common_line_items: ["Garden tidy"], status: "active" },
  { id: "decking", template_name: "Decking", category: "decking", trade: "decking", job_type: "decking", document_type: "quote_template", common_line_items: ["Decking labour"], status: "active" },
]

function acceptanceTranscript() {
  const doc = readFileSync(ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Acceptance transcript must remain documented in docs/RETAINING_MVP_ACCEPTANCE.md")
  return match[1].trim()
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

function currentDeterministicRetainingQuote(transcript: string): ProcessedQuote {
  return buildRetainingProcessedQuote(transcript)
}

function currentRenderedDraft(transcript: string, quote: ProcessedQuote) {
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: transcript,
    selectedTemplate: retainingTemplate,
  })
  const preview = buildCustomerQuotePreview(previewInput)
  const model = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview: preview,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })
  return { model, renderedText: renderCustomerDraftPreviewText(model) }
}

test("retaining MVP extracts documented customer address dimensions materials scope access and exclusions", () => {
  const transcript = acceptanceTranscript()
  const address = extractAddressDetails(transcript)
  const quote = currentDeterministicRetainingQuote(transcript)
  const detection = detectRetainingFromText(transcript)
  const result = calculateRetaining(detection.request)
  const [section] = result.sections

  assert.equal(extractClientNameFromTranscript(transcript), "Mary")
  assert.equal(address.cleaned_address, "12 Hill Road")
  assert.equal(quote.job_type, "retaining")
  assert.equal(detection.is_retaining, true)
  assert.equal(section?.length_m, 12.4)
  assert.equal(section?.height_m, 1)
  assert.equal(result.wall_kind, "replacement_wall")
  assert.equal(includesText(transcript, "125x125 H4 posts"), true)
  assert.equal(includesText(transcript, "old fence"), true)
  assert.equal(includesText(transcript, "old retaining"), true)
  assert.equal(includesText(transcript, "standard paling fence"), true)
  assert.equal(includesText(transcript, "Access is reasonable"), true)
  assert.equal(includesText(transcript, "No planting included"), true)
})

test("retaining MVP recommends Retaining and not competing templates", () => {
  const quote = currentDeterministicRetainingQuote(acceptanceTranscript())
  const templates = [...otherTemplates, retainingTemplate]
  const facts = quoteFactsFromProcessedQuote(quote)
  const recommendation = recommendTemplateForQuote({ facts, templates, sectionsByTemplateId: {}, trade: quote.job_type, jobType: quote.job_type })
  const recommendedNames = scoreTemplatesForQuote({ facts, templates, sectionsByTemplateId: {}, trade: quote.job_type, jobType: quote.job_type })
    .filter((score) => score.score >= 7)
    .map((score) => score.templateName)

  assert.equal(recommendation?.templateName, "Retaining")
  assert.equal(recommendedNames.includes("Planting"), false)
  assert.equal(recommendedNames.includes("Ongoing Garden Maintenance"), false)
  assert.equal(recommendedNames.includes("One-Off Garden Tidy"), false)
  assert.equal(recommendedNames.includes("Decking"), false)
})

test("retaining normalisation corrects live landscaping or planting misclassification", () => {
  const transcript = acceptanceTranscript()
  const misclassifiedQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Mary",
    site_address: "12 Hill Road",
    quote_title: "Landscaping Quote",
    job_type: "landscaping",
    selected_template_id: "planting",
    selected_template_name: "Planting",
    template_match_confidence: "high",
    primary_quote: {
      quote_title: "Landscaping Quote",
      job_type: "landscaping",
      cadence: "",
      scope: ["Plant multiple high and spacing along planting area."],
      notes: [],
    },
    customer_scope: ["Plant multiple high and spacing along planting area."],
    materials: [],
    exclusions: [],
    missing_information: ["planting length or plant quantity"],
    confidence_warnings: ["Missing planting length or plant quantity."],
    line_items: [
      {
        item_code: "",
        item_name: "Camellia",
        item_type: "plant",
        description: "Camellia planting area",
        quantity: null,
        unit: "each",
        rate: null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: null,
        total: null,
        match_confidence: "low",
        match_reason: "Plant suggestion from stale extraction.",
        needs_review: true,
        warning: "Quantity and rate missing",
      },
    ],
    quote_options: [
      {
        id: "stale-plant-option",
        label: "Option 1",
        title: "Camellia",
        category: "planting",
        source: "plant_calculator",
        lineItems: [],
        subtotal: 0,
      },
    ],
    plant_calculator_results: [],
  }

  const normalized = normalizeRetainingProcessedQuote(misclassifiedQuote, transcript)

  assert.equal(hasPlantingCalculatorIntent(transcript), false)
  assert.equal(normalized.job_type, "retaining")
  assert.equal(normalized.primary_quote.job_type, "retaining")
  assert.equal(normalized.selected_template_name, "")
  assert.equal(normalized.quote_options?.some((option) => option.category === "planting"), false)
  assert.equal(normalized.plant_calculator_results?.length, 0)
  assert.equal(normalized.line_items.some((item) => /plant|camellia/i.test([item.item_name, item.description, item.item_type].join(" "))), false)
  assert.equal(normalized.missing_information.some((item) => /plant/i.test(item)), false)
  assert.equal(normalized.confidence_warnings.some((item) => /plant/i.test(item)), false)
})

test("retaining transcript remains retaining when fencing normalisation also runs", () => {
  const transcript = acceptanceTranscript()
  const misclassifiedQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Mary",
    site_address: "12 Hill Road",
    quote_title: "Landscaping Quote",
    job_type: "landscaping",
    primary_quote: {
      quote_title: "Landscaping Quote",
      job_type: "landscaping",
      cadence: "",
      scope: ["Replace timber retaining wall along the back boundary", "Attach new standard paling fence after retaining is complete"],
      notes: [],
    },
    customer_scope: ["Replace timber retaining wall along the back boundary"],
  }

  const normalized = normalizeFencingProcessedQuote(normalizeRetainingProcessedQuote(misclassifiedQuote, transcript), transcript)
  const { model, renderedText } = currentRenderedDraft(transcript, normalized)

  assert.equal(normalized.job_type, "retaining")
  assert.equal(normalized.primary_quote.job_type, "retaining")
  assert.ok(model.assembly, "Retaining transcript should render through retaining assembly")
  assert.equal(model.assembly?.title, "Retaining Wall Quote")
  assert.equal(includesText(renderedText, "Retaining Wall Scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Fence Scope"), false, renderedText)
})

test("retaining MVP renders customer-ready quote draft through QuoteDraft-equivalent path", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicRetainingQuote(transcript)
  const { model, renderedText } = currentRenderedDraft(transcript, quote)

  assert.ok(model.assembly, "Retaining draft should use customer quote assembly")
  assert.equal(includesText(renderedText, "Retaining Wall Quote"), true, renderedText)
  assert.equal(includesText(renderedText, "Retaining Wall Scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Replace timber retaining wall along the back boundary"), true, renderedText)
  assert.equal(includesText(renderedText, "Install new retaining wall"), true, renderedText)
  assert.equal(includesText(renderedText, "Remove old retaining"), true, renderedText)
  assert.equal(includesText(renderedText, "Fence Reinstatement"), true, renderedText)
  assert.equal(includesText(renderedText, "Remove old fence"), true, renderedText)
  assert.equal(includesText(renderedText, "Attach new standard paling fence after retaining is complete"), true, renderedText)
  assert.equal(includesText(renderedText, "Materials"), true, renderedText)
  assert.equal(includesText(renderedText, "125x125 H4 posts at 1 metre spacing"), true, renderedText)
  assert.equal(includesText(renderedText, "Standard paling fence"), true, renderedText)
  assert.equal(includesText(renderedText, "Access"), true, renderedText)
  assert.equal(includesText(renderedText, "Reasonable access conditions"), true, renderedText)
  assert.equal(includesText(renderedText, "Exclusions"), true, renderedText)
  assert.equal(includesText(renderedText, "Planting not included"), true, renderedText)
  assert.equal(includesText(renderedText, "Planting labour"), false, renderedText)
  assert.equal(includesText(renderedText, "Maintenance wording"), false, renderedText)
  assert.equal(includesText(renderedText, "Garden tidy"), false, renderedText)
  assert.equal(includesText(renderedText, "Decking"), false, renderedText)
  assert.equal(includesText(renderedText, "Irrigation"), false, renderedText)
  assert.equal(/legacy labour total|\$\d+(?:\.\d{2})?\s+labou?r/i.test(renderedText), false, renderedText)
  assert.equal(/^Scope$/im.test(renderedText), false, renderedText)
})
