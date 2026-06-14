import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { extractPricing } from "./core/pricing-extraction"
import { quoteFactsFromProcessedQuote } from "./core/quote-facts"
import { buildCustomerPreviewQuoteInput } from "./customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "./customer-preview-render"
import { buildCustomerQuotePreview } from "./customer-quote-preview"
import { buildGardenTidyProcessedQuote } from "./garden-tidy-processing"
import type { ProcessedQuote } from "./processed-quote"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import { recommendTemplateForQuote, scoreTemplatesForQuote } from "./template-recommendation"
import { hasPlantingCalculatorIntent } from "./trades/planting/intent"

const ACCEPTANCE_DOC = "docs/GARDEN_TIDY_MVP_ACCEPTANCE.md"

const gardenTidyTemplate: QuoteTemplateLibraryItem = {
  id: "one-off-garden-tidy",
  template_name: "One-Off Garden Tidy",
  category: "garden_tidy",
  trade: "maintenance",
  job_type: "garden_tidy",
  document_type: "quote_template",
  common_line_items: ["Garden tidy", "Greenwaste removal", "Weeding", "Shrub cut back"],
  template_content: {
    reusable_customer_wording: ["One-off garden tidy including greenwaste removal."],
  },
  status: "active",
}

const plantingTemplate: QuoteTemplateLibraryItem = {
  id: "planting",
  template_name: "Planting",
  category: "planting",
  trade: "planting",
  job_type: "planting",
  document_type: "quote_template",
  common_line_items: ["Planting labour", "Plant supply"],
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

const deckingTemplate: QuoteTemplateLibraryItem = {
  id: "decking",
  template_name: "Decking",
  category: "decking",
  trade: "decking",
  job_type: "decking",
  document_type: "quote_template",
  common_line_items: ["Decking labour", "Decking boards"],
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
  assert.ok(match?.[1], "Acceptance transcript must remain documented in docs/GARDEN_TIDY_MVP_ACCEPTANCE.md")
  return match[1].trim()
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

function currentDeterministicGardenTidyQuote(transcript: string): ProcessedQuote {
  return buildGardenTidyProcessedQuote(transcript)
}

function currentRenderedDraft(transcript: string, quote: ProcessedQuote) {
  return renderCustomerDraftPreviewText(currentDraftPreviewModel(transcript, quote))
}

function currentDraftPreviewModel(
  transcript: string,
  quote: ProcessedQuote,
  selectedTemplate?: QuoteTemplateLibraryItem | null,
) {
  const pricing = extractPricing(transcript)
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: transcript,
    pricingFacts: pricing.pricing,
    selectedTemplate,
  })
  const preview = buildCustomerQuotePreview(previewInput)
  const model = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview: preview,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })
  return model
}

test("garden tidy MVP extracts customer and address", () => {
  const transcript = acceptanceTranscript()
  const address = extractAddressDetails(transcript)

  assert.equal(extractClientNameFromTranscript(transcript), "Sarah")
  assert.equal(address.cleaned_address, "44 Amy Street")
  assert.equal(address.needs_address_confirmation, false)
  assert.equal(address.address_warnings.includes("Please confirm site address."), false)
})

test("garden tidy MVP extracts job type and labour", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicGardenTidyQuote(transcript)

  assert.equal(quote.job_type, "garden_tidy")
  assert.equal(quote.labour_allowance, "1 day, 2 staff")
})

test("garden tidy MVP extracts price and inclusions", () => {
  const pricing = extractPricing(acceptanceTranscript())
  const fixedPrice = pricing.pricing.find((fact) => fact.type === "fixed_price")

  assert.equal(fixedPrice?.amount, 1440)
  assert.deepEqual(fixedPrice?.inclusions, ["greenwaste removal"])
})

test("garden tidy MVP extracts scope and site notes", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicGardenTidyQuote(transcript)

  assert.deepEqual(quote.customer_scope, [
    "Remove overgrowth around boundary",
    "Cut back shrubs",
    "Weed garden beds",
    "Remove self-seeded plants",
  ])
  assert.deepEqual(quote.primary_quote.notes, ["Greenwaste removed from site"])
})

test("garden tidy MVP recommends One-Off Garden Tidy and not other templates", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicGardenTidyQuote(transcript)
  const templates = [plantingTemplate, maintenanceTemplate, deckingTemplate, retainingTemplate, gardenTidyTemplate]
  const facts = quoteFactsFromProcessedQuote(quote)
  const recommendation = recommendTemplateForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
  })
  const scores = scoreTemplatesForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
  })
  const recommendedNames = scores.filter((score) => score.score >= 7).map((score) => score.templateName)

  assert.equal(recommendation?.templateName, "One-Off Garden Tidy")
  assert.equal(recommendedNames.includes("Planting"), false)
  assert.equal(recommendedNames.includes("Ongoing Garden Maintenance"), false)
  assert.equal(recommendedNames.includes("Decking"), false)
  assert.equal(recommendedNames.includes("Retaining"), false)
  assert.ok(transcript, "keeps acceptance transcript in this test's deterministic path")
})

test("garden tidy MVP does not trigger planting calculator missing-info warnings", () => {
  assert.equal(hasPlantingCalculatorIntent(acceptanceTranscript()), false)
  assert.equal(hasPlantingCalculatorIntent("Supply and install 24 Griselinia plants for a new hedge."), true)
})

test("garden tidy MVP renders customer-ready quote draft", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicGardenTidyQuote(transcript)
  const renderedText = currentRenderedDraft(transcript, quote)

  assert.equal(includesText(renderedText, "One-Off Garden Tidy"), true, renderedText)
  assert.equal(includesText(renderedText, "Main Scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Remove overgrowth around boundary"), true, renderedText)
  assert.equal(includesText(renderedText, "Cut back shrubs"), true, renderedText)
  assert.equal(includesText(renderedText, "Weed garden beds"), true, renderedText)
  assert.equal(includesText(renderedText, "Remove self-seeded plants"), true, renderedText)
  assert.equal(includesText(renderedText, "Service Includes"), true, renderedText)
  assert.equal(includesText(renderedText, "Greenwaste removal"), true, renderedText)
  assert.equal(includesText(renderedText, "$1,440"), true, renderedText)
  assert.equal(includesText(renderedText, "Greenwaste removed from site"), true, renderedText)
  assert.equal(includesText(renderedText, "Planting labour"), false, renderedText)
  assert.equal(includesText(renderedText, "Maintenance wording"), false, renderedText)
  assert.equal(includesText(renderedText, "Subscription wording"), false, renderedText)
  assert.equal(includesText(renderedText, "Monthly maintenance"), false, renderedText)
  assert.equal(/legacy labour total|\$\d+(?:\.\d{2})?\s+labou?r/i.test(renderedText), false, renderedText)
})

test("garden tidy live-equivalent one_off_tidy draft matches acceptance output", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicGardenTidyQuote(transcript)
  const liveQuote: ProcessedQuote = {
    ...quote,
    job_type: "one_off_tidy",
    primary_quote: {
      ...quote.primary_quote,
      job_type: "one_off_tidy",
    },
  }
  const model = currentDraftPreviewModel(transcript, liveQuote)
  const renderedText = renderCustomerDraftPreviewText(model)
  const expected = [
    "Prepared for",
    "Sarah",
    "44 Amy Street",
    "Quote",
    "One-Off Garden Tidy",
    "Main Scope",
    "Remove overgrowth around boundary",
    "Cut back shrubs",
    "Weed garden beds",
    "Remove self-seeded plants",
    "Service Includes",
    "Greenwaste removal",
    "Price",
    "$1,440",
    "Site Notes",
    "Greenwaste removed from site",
  ].join("\n")

  assert.equal(model.assembly ? "assembly" : "legacy", "assembly")
  assert.ok(model.assembly, "Assembly exists: yes")
  assert.equal(renderedText, expected)
  assert.equal(includesText(renderedText, "Planting labour"), false, renderedText)
  assert.equal(includesText(renderedText, "Maintenance wording"), false, renderedText)
  assert.equal(includesText(renderedText, "Subscription wording"), false, renderedText)
  assert.equal(includesText(renderedText, "Monthly maintenance"), false, renderedText)
  assert.equal(includesText(renderedText, "Renderer path: legacy"), false, renderedText)
  assert.equal(includesText(renderedText, "Assembly exists: no"), false, renderedText)
  assert.equal(/legacy labour total|\$\d+(?:\.\d{2})?\s+labou?r/i.test(renderedText), false, renderedText)
})

test("garden tidy live manual template activates assembly when job type fields are missing", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicGardenTidyQuote(transcript)
  const liveQuote: ProcessedQuote = {
    ...quote,
    quote_title: "",
    job_type: "",
    primary_quote: {
      ...quote.primary_quote,
      quote_title: "",
      job_type: "",
    },
  }
  const model = currentDraftPreviewModel(transcript, liveQuote, gardenTidyTemplate)
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.equal(model.assembly ? "assembly" : "legacy", "assembly")
  assert.ok(model.assembly, "Assembly exists: yes")
  assert.equal(includesText(renderedText, "One-Off Garden Tidy"), true, renderedText)
  assert.equal(includesText(renderedText, "Main Scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Greenwaste removal"), true, renderedText)
  assert.equal(includesText(renderedText, "$1,440"), true, renderedText)
  assert.equal(includesText(renderedText, "Renderer path: legacy"), false, renderedText)
  assert.equal(includesText(renderedText, "Assembly exists: no"), false, renderedText)
})
