import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import {
  calculatePlantingQuote,
  extractPlantCalculatorRequestsFromText,
} from "./calculators/planting"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { quoteFactsFromProcessedQuote, type QuoteFact, type QuoteFactCategory } from "./core/quote-facts"
import { buildCustomerPreviewQuoteInput } from "./customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "./customer-preview-render"
import { buildCustomerQuotePreview } from "./customer-quote-preview"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "./plants"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import { recommendTemplateForQuote, scoreTemplatesForQuote, plantingTemplateSignalsFromQuote } from "./template-recommendation"
import { quoteOptionsFromPlantCalculatorResults } from "./trades/planting/quote-options"

const ACCEPTANCE_DOC = "docs/PLANTING_MVP_ACCEPTANCE.md"

const plantingTemplate: QuoteTemplateLibraryItem = {
  id: "planting",
  template_name: "Planting",
  category: "planting",
  trade: "planting",
  job_type: "planting",
  document_type: "quote_template",
  common_line_items: ["Plant supply", "Ficus Tuffi", "Garden mix", "Mulch", "Planting labour"],
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

const deckingTemplate: QuoteTemplateLibraryItem = {
  id: "decking",
  template_name: "Decking",
  category: "decking",
  trade: "decking",
  job_type: "decking",
  document_type: "quote_template",
  common_line_items: ["Decking boards", "Decking labour"],
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

const amyFicusRows: KnowledgePlantRow[] = [
  plantRow("PLANT-028", "Ficus Tuffi 1.2m Hedge plant", "Ficus Tuffi 1.2m", "1.2m", 34.88),
  plantRow("PLANT-047", "Ficus Tuffi 14L Hedge plant", "Ficus Tuffi 14L", "14L", 81.25),
  plantRow("PLANT-060", "Ficus Tuffi 25L Hedge plant", "Ficus Tuffi 25L", "25L", 118.75),
]

function plantRow(
  itemCode: string,
  itemName: string,
  plantName: string,
  size: string,
  sellPrice: number,
): KnowledgePlantRow {
  return {
    item_code: itemCode,
    item_name: itemName,
    aliases: [itemCode, plantName, "Ficus Tuffi", size, "850mm", "Ficus Tuffy", "Tuffi hedge"],
    item_type: "plant",
    category: "Hedge",
    sell_price: sellPrice,
    raw_import: {
      plant_name: plantName,
      plant_size: size,
      pot_size: size,
      spacing_mm: 850,
      supplier: "Main Nursery",
      stock_status: "In stock",
      is_true_plant: true,
    },
  }
}

function acceptanceTranscript() {
  const doc = readFileSync(ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Acceptance transcript must remain documented in docs/PLANTING_MVP_ACCEPTANCE.md")
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
    sourceField: "planting-mvp-acceptance",
    confidence: "high",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
  }
}

function plantingCalculatorFixture(transcript: string) {
  const [request] = extractPlantCalculatorRequestsFromText(transcript)
  assert.ok(request, "Planting calculator request should be detected from the acceptance transcript")

  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(amyFicusRows, request.plant_name ?? ""),
  })

  return { request, result, quoteOptions: quoteOptionsFromPlantCalculatorResults([result]) }
}

function currentDeterministicPlantingQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  const { result, quoteOptions } = plantingCalculatorFixture(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: ["Plant 11.5 metres of Ficus Tuffi hedge.", "Garden mix", "Mulch", "Labour included"],
      notes: [],
    },
    customer_scope: ["Plant 11.5 metres of Ficus Tuffi hedge.", "Garden mix", "Mulch", "Labour included"],
    materials: ["Garden mix", "Mulch"],
    exclusions: ["No irrigation"],
    plant_calculator_results: [result],
    quote_options: quoteOptions,
  }
}

function currentRenderedDraft(transcript: string, quote: ProcessedQuote) {
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: transcript,
    selectedTemplate: plantingTemplate,
  })
  const preview = buildCustomerQuotePreview(previewInput)
  const model = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview: preview,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })

  return renderCustomerDraftPreviewText(model)
}

test("planting MVP extracts customer address plant length options materials labour and exclusions", () => {
  const transcript = acceptanceTranscript()
  const address = extractAddressDetails(transcript)
  const { request, result, quoteOptions } = plantingCalculatorFixture(transcript)
  const quote = currentDeterministicPlantingQuote(transcript)

  assert.equal(extractClientNameFromTranscript(transcript), "Amy")
  assert.equal(address.cleaned_address, "44 Amy Street")
  assert.equal(quote.job_type, "planting")
  assert.equal(request.plant_name, "Ficus Tuffi")
  assert.equal(request.length_m, 11.5)
  assert.deepEqual(request.requested_option_sizes, ["1.2m", "14l", "25l"])
  assert.equal(result.plant_count, 15)
  assert.deepEqual(quoteOptions.map((option) => option.title), ["Ficus Tuffi 1.2m", "Ficus Tuffi 14L", "Ficus Tuffi 25L"])
  assert.deepEqual(quote.materials, ["Garden mix", "Mulch"])
  assert.equal(quote.customer_scope.some((item) => /labour included/i.test(item)), true)
  assert.deepEqual(quote.exclusions, ["No irrigation"])
})

test("planting MVP recommends Planting and not maintenance tidy decking or retaining", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicPlantingQuote(transcript)
  const templates = [maintenanceTemplate, gardenTidyTemplate, deckingTemplate, retainingTemplate, plantingTemplate]
  const facts = [
    ...quoteFactsFromProcessedQuote(quote),
    fact("plants", "Ficus Tuffi hedge planting options."),
    fact("materials", "Garden mix and mulch for planting."),
    fact("exclusions", "No irrigation."),
  ]
  const recommendation = recommendTemplateForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
    plantingSignals: plantingTemplateSignalsFromQuote(quote),
  })
  const recommendedNames = scoreTemplatesForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
    plantingSignals: plantingTemplateSignalsFromQuote(quote),
  })
    .filter((score) => score.score >= 7)
    .map((score) => score.templateName)

  assert.equal(recommendation?.templateName, "Planting")
  assert.equal(recommendedNames.includes("Ongoing Garden Maintenance"), false)
  assert.equal(recommendedNames.includes("One-Off Garden Tidy"), false)
  assert.equal(recommendedNames.includes("Decking"), false)
  assert.equal(recommendedNames.includes("Retaining"), false)
})

test("planting MVP renders customer-ready quote draft through QuoteDraft-equivalent path", () => {
  const transcript = acceptanceTranscript()
  const quote = currentDeterministicPlantingQuote(transcript)
  const renderedText = currentRenderedDraft(transcript, quote)

  assert.equal(includesText(renderedText, "Prepared for\nAmy\n44 Amy Street"), true, renderedText)
  assert.equal(includesText(renderedText, "Planting Quote"), true, renderedText)
  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
  assert.equal(includesText(renderedText, "Supply and plant"), true, renderedText)
  assert.equal(includesText(renderedText, "Planting Options"), true, renderedText)
  assert.equal(includesText(renderedText, "Ficus Tuffi 1.2m"), true, renderedText)
  assert.equal(includesText(renderedText, "Ficus Tuffi 14L"), true, renderedText)
  assert.equal(includesText(renderedText, "Ficus Tuffi 25L"), true, renderedText)
  assert.equal(includesText(renderedText, "— $"), true, renderedText)
  assert.equal(includesText(renderedText, "Materials"), true, renderedText)
  assert.equal(includesText(renderedText, "Garden mix to be allowed for separately"), true, renderedText)
  assert.equal(includesText(renderedText, "Mulch to be allowed for separately"), true, renderedText)
  assert.equal(includesText(renderedText, "Garden mix included"), false, renderedText)
  assert.equal(includesText(renderedText, "Exclusions"), true, renderedText)
  assert.equal(includesText(renderedText, "Irrigation not included"), true, renderedText)

  assert.equal(includesText(renderedText, "11.5m"), false, renderedText)
  assert.equal(includesText(renderedText, "plants x $"), false, renderedText)
  assert.equal(includesText(renderedText, "Option 1:"), false, renderedText)
  assert.equal(includesText(renderedText, "Maintenance wording"), false, renderedText)
  assert.equal(includesText(renderedText, "Subscription wording"), false, renderedText)
  assert.equal(includesText(renderedText, "Garden tidy"), false, renderedText)
  assert.equal((renderedText.match(/Planting labour/gi) ?? []).length <= 1, true, renderedText)
  assert.equal(/legacy labour total|\$\d+(?:\.\d{2})?\s+labou?r/i.test(renderedText), false, renderedText)
  assert.equal(includesText(renderedText, "Irrigation included"), false, renderedText)
})
