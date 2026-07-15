import assert from "node:assert/strict"
import test from "node:test"

import { extractAddressDetails } from "../address-extraction"
import {
  calculatePlantingQuote,
  extractPlantCalculatorRequestsFromText,
  extractSpokenSpacingMmFromText,
} from "../calculators/planting"
import { extractClientNameFromTranscript } from "../client-name-extraction"
import { buildCustomerPreviewQuoteInput } from "../customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "../customer-preview-render"
import { buildCustomerQuotePreview } from "../customer-quote-preview"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "../plants"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import {
  buildQuotePresentationModel,
} from "./index"
import { quoteOptionsFromPlantCalculatorResults } from "../trades/planting/quote-options"
import type { QuoteTemplateLibraryItem } from "../template-import-learning"

import { clientALiveTranscript } from "./client-a-live-transcript"

const plantingTemplate: QuoteTemplateLibraryItem = {
  id: "planting",
  template_name: "Planting",
  category: "planting",
  trade: "planting",
  job_type: "planting",
  document_type: "quote_template",
  common_line_items: ["Plant supply", "Garden mix", "Planting labour"],
  status: "active",
}

const clientAMicheliaRows: KnowledgePlantRow[] = [
  micheliaRow("PLANT-101", "Michelia gracipes 2L", "Michelia gracipes 2L", "2L", 18.5, 600),
  micheliaRow("PLANT-102", "Michelia gracipes 4L", "Michelia gracipes 4L", "4L", 32.0, 600),
  micheliaRow("PLANT-103", "Michelia gracipes 25L", "Michelia gracipes 25L", "25L", 95.0, 600),
]

function micheliaRow(
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
    aliases: [itemCode, plantName, "Michelia gracipes", size],
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

export function buildClientAQuoteFixture(transcript: string = clientALiveTranscript): ProcessedQuote {
  return buildLiveProcessedQuoteFromTranscript(transcript)
}

function buildLiveProcessedQuoteFromTranscript(transcript: string): ProcessedQuote {
  const [request] = extractPlantCalculatorRequestsFromText(transcript)
  assert.ok(request, "Client A transcript must produce a planting calculator request")

  const libraryMatch = matchPlantRowsFromLibrary(clientAMicheliaRows, request.plant_name ?? "")
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: libraryMatch,
  })
  const quoteOptions = quoteOptionsFromPlantCalculatorResults([result])
  const address = extractAddressDetails(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "Client A",
    site_address: address.cleaned_address ?? "10 Willow Lane, Mount Wellington",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: [
        "14.2 metre planting area of Michaelia gracipes",
        "Five bags of garden mix",
        "One person, 1.5 days labour",
      ],
      notes: [],
    },
    customer_scope: [
      "14.2 metre planting area of Michaelia gracipes",
      "Five bags of garden mix",
      "One person, 1.5 days labour",
    ],
    materials: ["Five bags of garden mix"],
    labour_allowance: "One person, 1.5 days",
    follow_up_tasks: ["150 by 50 timber board border to do later"],
    plant_calculator_results: [result],
    quote_options: quoteOptions,
  }
}

test("Client A live transcript extracts planting length plant name and 50cm spacing", () => {
  const transcript = clientALiveTranscript

  assert.equal(extractSpokenSpacingMmFromText(transcript), 500)

  const [request] = extractPlantCalculatorRequestsFromText(transcript)
  assert.ok(request)
  assert.equal(request.length_m, 14.2)
  assert.match(request.plant_name ?? "", /gracipes/i)
  assert.equal(request.spoken_spacing_mm, 500)
})

test("Michaelia gracipes fuzzy-matches Michelia gracipes in plant library", () => {
  const match = matchPlantRowsFromLibrary(clientAMicheliaRows, "Michaelia gracipes")

  assert.notEqual(match.match_confidence, "none")
  assert.equal(match.plant_name, "Michelia gracipes")
  assert.ok((match.options ?? []).length >= 2)
})

test("Client A live transcript produces priced plant options with spoken spacing plant count and spacing review warning", () => {
  const [request] = extractPlantCalculatorRequestsFromText(clientALiveTranscript)
  assert.ok(request)

  const libraryMatch = matchPlantRowsFromLibrary(clientAMicheliaRows, request.plant_name ?? "")
  const result = calculatePlantingQuote({ ...request, plant_library_match: libraryMatch })

  assert.equal(result.length_m, 14.2)
  assert.equal(result.spacing_mm, 500)
  assert.equal(result.spacing_source, "spoken")
  assert.equal(result.plant_count, 30)
  assert.equal(result.option_groups.length, 2)
  assert.ok(result.option_groups.every((option) => option.plant_count === 30))
  assert.ok(result.option_groups.every((option) => typeof option.unit_sell_price === "number"))
  assert.ok(result.warnings.some((warning) => /500mm.*600mm|600mm.*500mm/i.test(warning.message)))
})

test("Client A live transcript QuoteDraft-equivalent path fills presentation model with sendable planting data", () => {
  const quote = buildLiveProcessedQuoteFromTranscript(clientALiveTranscript)
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: clientALiveTranscript,
    selectedTemplate: plantingTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput, {
    includeDeckingScope: true,
    includeRetainingScope: true,
  })
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: clientALiveTranscript,
    selectedTemplate: previewInput.selected_template,
  })
  const rendered = renderCustomerDraftPreviewText(previewModel)
  const sections = previewModel.plantingCustomerQuote ?? []

  assert.equal(previewModel.rendererPath, "planting-presentation")
  assert.equal(rendered.includes("Scope of Work"), true, rendered)
  assert.equal(rendered.includes("Supply and plant"), true, rendered)
  assert.equal(rendered.includes("Michelia gracipes 4L — $"), true, rendered)
  assert.equal(rendered.includes("Garden mix to be allowed for separately"), true, rendered)
  assert.equal(rendered.includes("Garden mix included"), false, rendered)
  assert.equal(rendered.includes("Planting labour included as described above"), true, rendered)
  assert.equal(rendered.includes("150x50 timber board border, if required"), true, rendered)
  assert.equal(rendered.includes("border , if required"), false, rendered)
  assert.equal(rendered.includes("14.2m"), false, rendered)
  assert.equal(rendered.includes("500mm"), false, rendered)
  assert.equal(rendered.includes("30 plants x $"), false, rendered)
  assert.equal(rendered.includes("Review Notes"), false, rendered)
  assert.equal(rendered.includes("Review required"), false, rendered)
  assert.equal(rendered.includes("Option 1:"), false, rendered)

  const labourSection = sections.find((section) => section.title === "Labour")
  assert.ok(labourSection)
  assert.equal(labourSection!.items.length, 1)
  assert.ok(previewModel.plantingInternalReviewNotes.length > 0)
})

test("shadow telemetry never leaks into customer-facing quote output", () => {
  const quote = buildLiveProcessedQuoteFromTranscript(clientALiveTranscript)
  // Attach a rich, divergent shadow report as internal telemetry.
  ;(quote as ProcessedQuote).shadow_report = {
    status: "fallback",
    usedForOutput: false,
    findings: [{ code: "unknown_quote_type", message: "SHADOW-ONLY finding text", severity: "warning" }],
    diff: {
      deterministicQuoteType: "planting",
      candidateQuoteType: "decking",
      quoteTypeChanged: true,
      mainLabourCountDelta: 0,
      optionalBucketCountDelta: 0,
      mainScopeCountDelta: 0,
      divergences: ["SHADOW-ONLY divergence text"],
      divergent: true,
    },
    summary: "SHADOW-ONLY summary text",
    deterministicPlan: { quoteType: "planting" } as never,
    aiDraftPlan: { secret: "SHADOW-ONLY draft" },
    resolvedPlan: null,
  }

  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: clientALiveTranscript,
    selectedTemplate: plantingTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput, {
    includeDeckingScope: true,
    includeRetainingScope: true,
  })
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: clientALiveTranscript,
    selectedTemplate: previewInput.selected_template,
  })
  const rendered = renderCustomerDraftPreviewText(previewModel)

  for (const leak of ["SHADOW-ONLY", "AI Shadow Planner", "not used for quote output", "shadow_report"]) {
    assert.equal(rendered.includes(leak), false, `customer output must not contain shadow telemetry ("${leak}")`)
  }
})
