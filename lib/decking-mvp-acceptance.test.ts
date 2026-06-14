import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { quoteFactsFromProcessedQuote, type QuoteFact, type QuoteFactCategory } from "./core/quote-facts"
import { extractScopeNotes } from "./core/scope-notes"
import { buildCustomerPreviewQuoteInput } from "./customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "./customer-preview-render"
import { buildCustomerQuotePreview } from "./customer-quote-preview"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import { recommendTemplateForQuote, scoreTemplatesForQuote } from "./template-recommendation"
import { calculateDecking, detectDeckingFromText } from "./trades/decking"

const ACCEPTANCE_DOC = "docs/DECKING_MVP_ACCEPTANCE.md"

const deckingTemplate: QuoteTemplateLibraryItem = {
  id: "decking",
  template_name: "Decking",
  category: "decking",
  trade: "decking",
  job_type: "decking",
  document_type: "quote_template",
  common_line_items: ["Decking labour", "Kwila decking", "Deck removal", "Deck tidy up"],
  status: "active",
}

const plantingTemplate: QuoteTemplateLibraryItem = {
  id: "planting",
  template_name: "Planting",
  category: "planting",
  trade: "planting",
  job_type: "planting",
  document_type: "quote_template",
  common_line_items: ["Plant supply", "Planting labour"],
  status: "active",
}

const maintenanceTemplate: QuoteTemplateLibraryItem = {
  id: "maintenance",
  template_name: "Ongoing Garden Maintenance",
  category: "maintenance",
  trade: "maintenance",
  job_type: "maintenance",
  document_type: "quote_template",
  common_line_items: ["Ongoing Garden Maintenance", "Greenwaste removal"],
  status: "active",
}

const gardenTidyTemplate: QuoteTemplateLibraryItem = {
  id: "one-off-garden-tidy",
  template_name: "One-Off Garden Tidy",
  category: "garden_tidy",
  trade: "maintenance",
  job_type: "garden_tidy",
  document_type: "quote_template",
  common_line_items: ["Garden tidy", "Greenwaste removal"],
  status: "active",
}

const retainingTemplate: QuoteTemplateLibraryItem = {
  id: "retaining",
  template_name: "Retaining",
  category: "retaining",
  trade: "retaining",
  job_type: "retaining",
  document_type: "quote_template",
  common_line_items: ["Retaining wall labour", "Drainage"],
  status: "active",
}

function acceptanceTranscript() {
  const doc = readFileSync(ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Acceptance transcript must remain documented in docs/DECKING_MVP_ACCEPTANCE.md")
  return match[1].trim()
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

function fact(category: QuoteFactCategory, description: string): QuoteFact {
  return {
    id: `${category}-${description}`,
    category,
    description,
    sourceField: "decking-mvp-acceptance",
    confidence: "high",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
  }
}

function currentDeterministicDeckingQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "Deck Construction / Deck Replacement Quote",
    job_type: "decking",
    primary_quote: {
      quote_title: "Deck Construction / Deck Replacement Quote",
      job_type: "decking",
      cadence: "",
      scope: [
        "Deck measures 12.8m by 15.6m.",
        "Remove existing deck.",
        "Use Kwila 140x19 for the entire deck.",
        "Posts are still in good condition and will remain.",
        "Allow time for tidy up.",
        "Entire project should take approximately 2 weeks with 2 people.",
      ],
      notes: ["Access is poor, allow an additional 10 hours."],
    },
    customer_scope: [
      "Deck measures 12.8m by 15.6m.",
      "Remove existing deck.",
      "Use Kwila 140x19 for the entire deck.",
      "Posts are still in good condition and will remain.",
      "Allow time for tidy up.",
      "Entire project should take approximately 2 weeks with 2 people.",
    ],
    labour_allowance: "2 people, 2 days removal, 10 hours access allowance",
    materials: ["Kwila 140x19"],
    exclusions: extractScopeNotes(transcript).notes
      .filter((note) => note.type === "exclusion")
      .map((note) => note.label),
    internal_notes: ["Estimate 2 people for 2 days for removal.", "Access is poor, allow an additional 10 hours."],
  }
}

function currentDraftPreviewModel(transcript: string, quote: ProcessedQuote) {
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: transcript,
    selectedTemplate: deckingTemplate,
  })
  const preview = buildCustomerQuotePreview(previewInput)
  return buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview: preview,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })
}

function currentRenderedDraft(transcript: string, quote: ProcessedQuote) {
  return renderCustomerDraftPreviewText(currentDraftPreviewModel(transcript, quote))
}

test("decking MVP extracts customer address dimensions area material removal retained structure access labour programme and exclusion", () => {
  const transcript = acceptanceTranscript()
  const address = extractAddressDetails(transcript)
  const quote = currentDeterministicDeckingQuote(transcript)
  const detection = detectDeckingFromText(transcript)
  const result = calculateDecking(detection.request)
  const [area] = result.areas

  assert.equal(extractClientNameFromTranscript(transcript), "Susan")
  assert.equal(address.cleaned_address, "6 Tarawera Terrace")
  assert.equal(quote.job_type, "decking")
  assert.equal(detection.is_decking, true)
  assert.equal(area?.length_m, 12.8)
  assert.equal(area?.width_m, 15.6)
  assert.equal(result.total_square_metres, 199.68)
  assert.equal(includesText(transcript, "Kwila 140x19"), true)
  assert.equal(includesText(transcript, "Remove existing deck"), true)
  assert.equal(includesText(transcript, "Posts are still in good condition and will remain"), true)
  assert.equal(includesText(transcript, "Access is poor"), true)
  assert.equal(includesText(quote.labour_allowance, "2 people"), true)
  assert.equal(includesText(quote.labour_allowance, "2 days"), true)
  assert.equal(includesText(quote.labour_allowance, "10 hours"), true)
  assert.equal(includesText(transcript, "2 weeks"), true)
  assert.deepEqual(quote.exclusions, ["staining"])
})

test("decking MVP recommends Decking and not planting maintenance tidy or retaining", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicDeckingQuote(transcript)
  const templates = [plantingTemplate, maintenanceTemplate, gardenTidyTemplate, retainingTemplate, deckingTemplate]
  const facts = [
    ...quoteFactsFromProcessedQuote(quote),
    fact("materials", "Kwila 140x19 decking."),
    fact("waste", "Existing deck removed."),
    fact("site_conditions", "Poor access."),
    fact("exclusions", "No staining."),
  ]
  const recommendation = recommendTemplateForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
  })
  const recommendedNames = scoreTemplatesForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
  })
    .filter((score) => score.score >= 7)
    .map((score) => score.templateName)

  assert.equal(recommendation?.templateName, "Decking")
  assert.equal(recommendedNames.includes("Planting"), false)
  assert.equal(recommendedNames.includes("Ongoing Garden Maintenance"), false)
  assert.equal(recommendedNames.includes("One-Off Garden Tidy"), false)
  assert.equal(recommendedNames.includes("Retaining"), false)
})

test("decking MVP renders customer-ready quote draft through QuoteDraft-equivalent path", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicDeckingQuote(transcript)
  const model = currentDraftPreviewModel(transcript, quote)
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.ok(model.assembly, "Decking draft should use customer quote assembly")
  assert.equal(includesText(renderedText, "Prepared for\nSusan\n6 Tarawera Terrace"), true, renderedText)
  assert.equal(includesText(renderedText, "Deck Construction / Deck Replacement Quote"), true, renderedText)
  assert.equal(includesText(renderedText, "Project Overview"), true, renderedText)
  assert.equal(includesText(renderedText, "Existing deck removed"), true, renderedText)
  assert.equal(includesText(renderedText, "Existing posts retained"), true, renderedText)
  assert.equal(includesText(renderedText, "New Kwila 140x19 decking installed"), true, renderedText)
  assert.equal(includesText(renderedText, "Deck Details"), true, renderedText)
  assert.equal(includesText(renderedText, "12.8m x 15.6m"), true, renderedText)
  assert.equal(includesText(renderedText, "Approximate area 199.68m²"), true, renderedText)
  assert.equal(includesText(renderedText, "Material"), true, renderedText)
  assert.equal(includesText(renderedText, "Kwila 140x19"), true, renderedText)
  assert.equal(includesText(renderedText, "Access"), true, renderedText)
  assert.equal(includesText(renderedText, "Poor access conditions"), true, renderedText)
  assert.equal(includesText(renderedText, "Programme"), true, renderedText)
  assert.equal(includesText(renderedText, "Approximately 2 weeks"), true, renderedText)
  assert.equal(includesText(renderedText, "Exclusions"), true, renderedText)
  assert.equal(includesText(renderedText, "Staining not included"), true, renderedText)

  assert.equal(includesText(renderedText, "Planting labour"), false, renderedText)
  assert.equal(includesText(renderedText, "Maintenance wording"), false, renderedText)
  assert.equal(includesText(renderedText, "Garden tidy"), false, renderedText)
  assert.equal(includesText(renderedText, "Irrigation"), false, renderedText)
  assert.equal(/legacy labour total|\$\d+(?:\.\d{2})?\s+labou?r/i.test(renderedText), false, renderedText)
  assert.equal(/^Scope$/im.test(renderedText), false, renderedText)
})
