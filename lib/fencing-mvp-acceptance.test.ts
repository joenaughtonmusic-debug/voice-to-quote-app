import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { extractMeasurements } from "./core/measurement-extraction"
import { quoteFactsFromProcessedQuote } from "./core/quote-facts"
import { buildCustomerPreviewQuoteInput } from "./customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "./customer-preview-render"
import { buildCustomerQuotePreview } from "./customer-quote-preview"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import { recommendTemplateForQuote, scoreTemplatesForQuote } from "./template-recommendation"

const ACCEPTANCE_DOC = "docs/FENCING_MVP_ACCEPTANCE.md"

const fencingTemplate: QuoteTemplateLibraryItem = {
  id: "fencing",
  template_name: "Fencing",
  category: "fencing",
  trade: "fencing",
  job_type: "fencing",
  document_type: "quote_template",
  common_line_items: ["Fence labour", "Posts", "Rails", "Palings"],
  status: "active",
}

const otherTemplates: QuoteTemplateLibraryItem[] = [
  { id: "planting", template_name: "Planting", category: "planting", trade: "planting", job_type: "planting", document_type: "quote_template", common_line_items: ["Planting labour"], status: "active" },
  { id: "maintenance", template_name: "Ongoing Garden Maintenance", category: "maintenance", trade: "maintenance", job_type: "maintenance", document_type: "quote_template", common_line_items: ["Garden maintenance"], status: "active" },
  { id: "tidy", template_name: "One-Off Garden Tidy", category: "garden_tidy", trade: "maintenance", job_type: "garden_tidy", document_type: "quote_template", common_line_items: ["Garden tidy"], status: "active" },
  { id: "decking", template_name: "Decking", category: "decking", trade: "decking", job_type: "decking", document_type: "quote_template", common_line_items: ["Decking labour"], status: "active" },
  { id: "retaining", template_name: "Retaining", category: "retaining", trade: "retaining", job_type: "retaining", document_type: "quote_template", common_line_items: ["Retaining wall labour"], status: "active" },
]

function acceptanceTranscript() {
  const doc = readFileSync(ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Acceptance transcript must remain documented in docs/FENCING_MVP_ACCEPTANCE.md")
  return match[1].trim()
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

function currentDeterministicFencingQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
  }
}

function currentRenderedDraft(transcript: string, quote: ProcessedQuote) {
  const previewInput = buildCustomerPreviewQuoteInput({ processedQuote: quote, rawTranscript: transcript, selectedTemplate: fencingTemplate })
  const preview = buildCustomerQuotePreview(previewInput)
  const model = buildCustomerDraftPreviewModel({ processedQuote: quote, customerPreview: preview, rawTranscript: transcript, selectedTemplate: previewInput.selected_template })
  return { model, renderedText: renderCustomerDraftPreviewText(model) }
}

test("fencing MVP extracts documented customer address dimensions materials access and exclusions", () => {
  const transcript = acceptanceTranscript()
  const address = extractAddressDetails(transcript)
  const quote = currentDeterministicFencingQuote(transcript)
  const measurements = extractMeasurements(transcript).measurements

  assert.equal(extractClientNameFromTranscript(transcript), "Ben")
  assert.equal(address.cleaned_address, "18 Valley Road")
  assert.equal(quote.job_type, "fencing")
  assert.equal(measurements.some((measurement) => measurement.value === 18 && measurement.unit === "m"), true)
  assert.equal(measurements.some((measurement) => measurement.value === 1.8 && measurement.unit === "m"), true)
  assert.equal(includesText(transcript, "standard timber posts, rails, and palings"), true)
  assert.equal(includesText(transcript, "Remove existing fence"), true)
  assert.equal(includesText(transcript, "Access is straightforward"), true)
  assert.equal(includesText(transcript, "No painting or staining included"), true)
})

test("fencing MVP recommends Fencing and not competing templates", () => {
  const quote = currentDeterministicFencingQuote(acceptanceTranscript())
  const templates = [...otherTemplates, fencingTemplate]
  const facts = quoteFactsFromProcessedQuote(quote)
  const recommendation = recommendTemplateForQuote({ facts, templates, sectionsByTemplateId: {}, trade: quote.job_type, jobType: quote.job_type })
  const recommendedNames = scoreTemplatesForQuote({ facts, templates, sectionsByTemplateId: {}, trade: quote.job_type, jobType: quote.job_type })
    .filter((score) => score.score >= 7)
    .map((score) => score.templateName)

  assert.equal(recommendation?.templateName, "Fencing")
  assert.equal(recommendedNames.includes("Planting"), false)
  assert.equal(recommendedNames.includes("Ongoing Garden Maintenance"), false)
  assert.equal(recommendedNames.includes("One-Off Garden Tidy"), false)
  assert.equal(recommendedNames.includes("Decking"), false)
  assert.equal(recommendedNames.includes("Retaining"), false)
})

test("fencing MVP renders customer-ready quote draft through QuoteDraft-equivalent path", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicFencingQuote(transcript)
  const { model, renderedText } = currentRenderedDraft(transcript, quote)

  assert.ok(model.assembly, "Fencing draft should use customer quote assembly")
  assert.equal(includesText(renderedText, "Fencing Quote"), true, renderedText)
  assert.equal(includesText(renderedText, "Fence Scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Fence Details"), true, renderedText)
  assert.equal(includesText(renderedText, "Materials"), true, renderedText)
  assert.equal(includesText(renderedText, "Access"), true, renderedText)
  assert.equal(includesText(renderedText, "Exclusions"), true, renderedText)
  assert.equal(/^Scope$/im.test(renderedText), false, renderedText)
})
