import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "../address-extraction"
import {
  calculatePlantingQuote,
  extractPlantCalculatorRequestsFromText,
} from "../calculators/planting"
import { extractClientNameFromTranscript } from "../client-name-extraction"
import { buildCustomerPreviewQuoteInput } from "../customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "../customer-preview-render"
import { buildCustomerQuotePreview } from "../customer-quote-preview"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "../plants"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import { quoteOptionsFromPlantCalculatorResults } from "../trades/planting/quote-options"
import type { QuoteTemplateLibraryItem } from "../template-import-learning"
import { clientALiveTranscript } from "./client-a-live-transcript"
import { buildClientAQuoteFixture } from "./client-a-live-transcript.test"

const PLANTING_ACCEPTANCE_DOC = "docs/PLANTING_MVP_ACCEPTANCE.md"

const plantingTemplate: QuoteTemplateLibraryItem = {
  id: "planting",
  template_name: "Planting",
  category: "planting",
  trade: "planting",
  job_type: "planting",
  document_type: "quote_template",
  common_line_items: ["Plant supply", "Garden mix", "Mulch", "Planting labour"],
  status: "active",
}

const amyFicusRows: KnowledgePlantRow[] = [
  plantRow("PLANT-028", "Ficus Tuffi 1.2m Hedge plant", "Ficus Tuffi 1.2m", "1.2m", 34.88, 850),
  plantRow("PLANT-047", "Ficus Tuffi 14L Hedge plant", "Ficus Tuffi 14L", "14L", 81.25, 850),
  plantRow("PLANT-060", "Ficus Tuffi 25L Hedge plant", "Ficus Tuffi 25L", "25L", 118.75, 850),
]

function plantRow(
  itemCode: string,
  itemName: string,
  plantName: string,
  size: string,
  sellPrice: number,
  spacingMm: number,
): KnowledgePlantRow {
  return {
    item_code: itemCode,
    item_name: itemName,
    aliases: [itemCode, plantName, "Ficus Tuffi", size],
    item_type: "plant",
    category: "Hedge",
    sell_price: sellPrice,
    raw_import: {
      plant_name: plantName,
      plant_size: size,
      pot_size: size,
      spacing_mm: spacingMm,
      supplier: "Main Nursery",
      stock_status: "In stock",
      is_true_plant: true,
    },
  }
}

function amyAcceptanceTranscript() {
  const doc = readFileSync(PLANTING_ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Amy acceptance transcript must remain documented")
  return match[1].trim()
}

function amyQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  const [request] = extractPlantCalculatorRequestsFromText(transcript)
  assert.ok(request)
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(amyFicusRows, request.plant_name ?? ""),
  })

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "Amy",
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
    quote_options: quoteOptionsFromPlantCalculatorResults([result]),
  }
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

test("QuoteDraft live path: Client A uses presentation customer quote instead of thin assembly", () => {
  const quote = buildClientAQuoteFixture()
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: clientALiveTranscript,
    selectedTemplate: plantingTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput)
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: clientALiveTranscript,
    selectedTemplate: previewInput.selected_template,
  })
  const rendered = renderCustomerDraftPreviewText(previewModel)

  assert.equal(previewModel.rendererPath, "planting-presentation")
  assert.equal(rendered.includes("Option 1: Michelia"), false, rendered)
  assert.equal(rendered.includes("Scope of Work"), true, rendered)
  assert.equal(rendered.includes("500mm"), false, rendered)
  assert.equal(rendered.includes("Review Notes"), false, rendered)
  assert.equal(rendered.includes("Review required"), false, rendered)
})

test("QuoteDraft live path: Amy shows grouped priced planting options from presentation model", () => {
  const transcript = amyAcceptanceTranscript()
  const quote = amyQuote(transcript)
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: transcript,
    selectedTemplate: plantingTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput)
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })
  const rendered = renderCustomerDraftPreviewText(previewModel)

  assert.equal(previewModel.rendererPath, "planting-presentation")
  assert.equal(includesText(rendered, "Ficus Tuffi 14L"), true, rendered)
  assert.equal(includesText(rendered, "plants x $"), false, rendered)
  assert.equal(previewModel.plantingCustomerQuote?.find((section) => section.title === "Planting Options")?.items.length, 3)
})
