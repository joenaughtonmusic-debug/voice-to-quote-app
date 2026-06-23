import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  calculatePlantingQuote,
  extractPlantCalculatorRequestsFromText,
} from "../calculators/planting"
import { buildCustomerPreviewQuoteInput } from "../customer-preview-flow"
import {
  buildCustomerDraftPreviewModel,
  renderCustomerDraftPreviewText,
} from "../customer-preview-render"
import { buildCustomerQuotePreview } from "../customer-quote-preview"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "../plants"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import {
  buildPresentationInternalReviewNotes,
  buildQuotePresentationModel,
  collectPresentationReviewNotes,
  exportViewLines,
  isUsablePlantingCustomerQuote,
  presentationModelRetainsExportMetadata,
  presentationModelRetainsInternalPlantingCalculations,
} from "./index"
import { quoteOptionsFromPlantCalculatorResults } from "../trades/planting/quote-options"
import type { QuoteTemplateLibraryItem } from "../template-import-learning"
import { stephanieLiveTranscript } from "./stephanie-live-transcript"

const PLANTING_ACCEPTANCE_DOC = "docs/PLANTING_MVP_ACCEPTANCE.md"

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

const stephanieMicheliaRows: KnowledgePlantRow[] = [
  micheliaRow("PLANT-102", "Michelia gracipes 4L", "Michelia gracipes 4L", "4L", 68.75, 850),
]

const amyFicusRows: KnowledgePlantRow[] = [
  ficusRow("PLANT-028", "Ficus Tuffi 1.2m Hedge plant", "Ficus Tuffi 1.2m", "1.2m", 34.88, 850),
  ficusRow("PLANT-047", "Ficus Tuffi 14L Hedge plant", "Ficus Tuffi 14L", "14L", 81.25, 850),
  ficusRow("PLANT-060", "Ficus Tuffi 25L Hedge plant", "Ficus Tuffi 25L", "25L", 118.75, 850),
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

function ficusRow(
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

function buildStephanieQuote(): ProcessedQuote {
  const [request] = extractPlantCalculatorRequestsFromText(stephanieLiveTranscript)
  assert.ok(request)
  const libraryMatch = matchPlantRowsFromLibrary(stephanieMicheliaRows, request.plant_name ?? "")
  const result = calculatePlantingQuote({ ...request, plant_library_match: libraryMatch })

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Stephanie",
    site_address: "10 Cotswold Lane, Mount Wellington",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: ["14.2 metre planting area", "Five bags of garden mix", "One person, 1.5 days labour"],
      notes: [],
    },
    customer_scope: ["14.2 metre planting area", "Five bags of garden mix", "One person, 1.5 days labour"],
    materials: ["Five bags of garden mix"],
    labour_allowance: "One person, 1.5 days because there are a few roots to dig through",
    follow_up_tasks: ["150 by 50 timber board border to do later"],
    plant_calculator_results: [result],
    quote_options: quoteOptionsFromPlantCalculatorResults([result]),
  }
}

function buildAmyQuote(transcript: string): ProcessedQuote {
  const [request] = extractPlantCalculatorRequestsFromText(transcript)
  assert.ok(request)
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(amyFicusRows, request.plant_name ?? ""),
  })

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Amy",
    site_address: "44 Amy Street",
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

function quoteDraftRendered(transcript: string, quote: ProcessedQuote) {
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: transcript,
    selectedTemplate: plantingTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput, {
    includeDeckingScope: true,
    includeRetainingScope: true,
  })
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })

  return {
    previewModel,
    rendered: renderCustomerDraftPreviewText(previewModel),
    presentationSections: previewModel.plantingCustomerQuote ?? [],
    internalReviewNotes: previewModel.plantingInternalReviewNotes,
  }
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

test("Stephanie customer quote uses planting presentation model output", () => {
  const { previewModel, rendered } = quoteDraftRendered(stephanieLiveTranscript, buildStephanieQuote())

  assert.equal(previewModel.rendererPath, "planting-presentation")
  assert.ok(previewModel.plantingCustomerQuote)
  assert.equal(includesText(rendered, "Scope of Work"), true, rendered)
  assert.equal(includesText(rendered, "Planting Options"), true, rendered)
  assert.equal(includesText(rendered, "Option 1: Michelia"), false, rendered)
})

test("Stephanie customer quote uses narrative scope and hides calculation detail", () => {
  const { rendered, presentationSections } = quoteDraftRendered(stephanieLiveTranscript, buildStephanieQuote())

  assert.equal(includesText(rendered, "Supply and plant Michelia gracipes hedge"), true, rendered)
  assert.equal(includesText(rendered, "Prepare planting area, dig planting holes"), true, rendered)
  assert.equal(includesText(rendered, "existing roots"), true, rendered)
  assert.equal(includesText(rendered, "Michelia gracipes 4L — $2,062.50"), true, rendered)
  assert.equal(includesText(rendered, "Garden mix to be allowed for separately"), true, rendered)
  assert.equal(includesText(rendered, "Garden mix included"), false, rendered)
  assert.equal(includesText(rendered, "Planting labour included as described above"), true, rendered)
  assert.equal(includesText(rendered, "150x50 timber board border, if required"), true, rendered)
  assert.equal(rendered.includes("border , if required"), false, rendered)

  assert.equal(includesText(rendered, "14.2m"), false, rendered)
  assert.equal(includesText(rendered, "500mm"), false, rendered)
  assert.equal(includesText(rendered, "30 plants"), false, rendered)
  assert.equal(includesText(rendered, "$68.75"), false, rendered)
  assert.equal(includesText(rendered, "1 person for 1.5 days"), false, rendered)
  assert.equal(includesText(rendered, "Planting Details"), false, rendered)

  const labourSection = presentationSections.find((section) => section.title === "Labour")
  assert.ok(labourSection)
  assert.equal(labourSection!.items.length, 1)
  assert.equal(presentationSections.some((section) => section.title === "Review Notes"), false)
})

test("Stephanie customer quote hides internal review warnings from customer output", () => {
  const { rendered, internalReviewNotes } = quoteDraftRendered(stephanieLiveTranscript, buildStephanieQuote())

  assert.equal(rendered.includes("Review Notes"), false, rendered)
  assert.equal(/garden mix rate missing/i.test(rendered), false, rendered)
  assert.equal(/fuzzy.*michaelia gracipes/i.test(rendered), false, rendered)
  assert.equal(/850mm.*500mm|500mm.*850mm/i.test(rendered), false, rendered)
  assert.equal(/review required/i.test(rendered), false, rendered)
  assert.ok(internalReviewNotes.length > 0)
})

test("Stephanie internal review notes are deduplicated and retained on the model", () => {
  const quote = buildStephanieQuote()
  const model = buildQuotePresentationModel({
    quote,
    rawTranscript: stephanieLiveTranscript,
    customerPreview: buildCustomerQuotePreview(
      buildCustomerPreviewQuoteInput({
        processedQuote: quote,
        rawTranscript: stephanieLiveTranscript,
        selectedTemplate: plantingTemplate,
      }),
    ),
  })
  assert.ok(model)

  const notes = collectPresentationReviewNotes(model)
  const internalSections = buildPresentationInternalReviewNotes(model)
  assert.equal(internalSections.length, 1)
  assert.equal(notes.length, internalSections[0]!.items.length)

  assert.equal(new Set(notes.map((note) => note.toLowerCase())).size, notes.length)
  assert.equal(notes.some((note) => /review required/i.test(note)), false)
  assert.equal(notes.some((note) => /500mm.*850mm|850mm.*500mm/i.test(note)), true)
  assert.equal(notes.some((note) => /fuzzy.*michaelia gracipes.*michelia gracipes/i.test(note)), true)
  assert.equal(notes.some((note) => /garden mix rate missing/i.test(note)), true)
  assert.equal(notes.some((note) => /plant delivery fee not captured/i.test(note)), true)
  assert.ok(model.lines.some((line) => (line.warnings ?? []).length > 0 || line.reviewRequired))
  assert.equal(presentationModelRetainsInternalPlantingCalculations(model), true)
  assert.equal(presentationModelRetainsExportMetadata(model), true)
  assert.ok(exportViewLines(model).some((line) => line.itemCode || typeof line.unitPrice === "number"))
})

test("Amy customer quote shows customer-friendly planting options with totals only", () => {
  const transcript = amyAcceptanceTranscript()
  const { previewModel, rendered, presentationSections } = quoteDraftRendered(transcript, buildAmyQuote(transcript))

  assert.equal(previewModel.rendererPath, "planting-presentation")
  const plantingOptions = presentationSections.find((section) => section.title === "Planting Options")
  assert.ok(plantingOptions)
  assert.equal(plantingOptions!.items.length, 3)
  assert.ok(plantingOptions!.items.every((item) => /— \$\d/.test(item.title)))
  assert.ok(plantingOptions!.items.every((item) => !item.detail?.includes("plants x $")))
  assert.equal(includesText(rendered, "Ficus Tuffi 14L"), true, rendered)
  assert.equal(includesText(rendered, "11.5m"), false, rendered)
  assert.equal(includesText(rendered, "plants x $"), false, rendered)
})

test("planting falls back to assembly when presentation model is not usable", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Amy",
    site_address: "44 Amy Street",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: ["Plant 11.5 metres of Ficus Tuffi hedge.", "Garden mix", "Labour included"],
      notes: [],
    },
    customer_scope: ["Plant 11.5 metres of Ficus Tuffi hedge.", "Garden mix", "Labour included"],
    materials: ["Garden mix"],
    labour_allowance: "Labour included",
  }

  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: "Plant 11.5 metres of Ficus Tuffi hedge with garden mix. Labour included.",
    selectedTemplate: plantingTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput)
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: "Plant 11.5 metres of Ficus Tuffi hedge with garden mix. Labour included.",
    selectedTemplate: previewInput.selected_template,
  })

  assert.equal(previewModel.rendererPath, "assembly")
  assert.equal(previewModel.plantingCustomerQuote, null)
  assert.ok(previewModel.assembly)
  assert.equal(previewModel.assembly!.sections.some((section) => section.title === "Materials"), true)
})

test("isUsablePlantingCustomerQuote rejects review-only sections", () => {
  assert.equal(
    isUsablePlantingCustomerQuote([{ title: "Review Notes", items: [{ title: "Garden mix rate missing." }] }]),
    false,
  )
})

test("Stephanie presentation model retains five bags of garden mix quantity", () => {
  const quote = buildStephanieQuote()
  const model = buildQuotePresentationModel({
    quote,
    rawTranscript: stephanieLiveTranscript,
    customerPreview: buildCustomerQuotePreview(
      buildCustomerPreviewQuoteInput({
        processedQuote: quote,
        rawTranscript: stephanieLiveTranscript,
        selectedTemplate: plantingTemplate,
      }),
    ),
  })
  assert.ok(model)

  const gardenMix = model.lines.find((line) => line.role === "material" && /garden mix/i.test(line.customerTitle))
  assert.ok(gardenMix)
  assert.equal(gardenMix!.quantity, 5)
  assert.equal(gardenMix!.unit, "bags")
})

test("priced garden mix line item resolves to customer included wording", () => {
  const quote = buildStephanieQuote()
  quote.line_items = [
    {
      item_code: "MAT-GARDEN-MIX",
      item_name: "Garden mix",
      item_type: "material",
      description: "Garden mix",
      quantity: "5",
      unit: "bags",
      rate: "18",
      knowledge_base_rate: "18",
      override_rate: null,
      final_rate_used: "18",
      total: "90",
      match_confidence: "high",
      match_reason: "Matched knowledge item garden mix",
      needs_review: false,
      warning: "",
      source_item_id: "kb-garden-mix",
    },
  ]

  const model = buildQuotePresentationModel({
    quote,
    rawTranscript: stephanieLiveTranscript,
    customerPreview: buildCustomerQuotePreview(
      buildCustomerPreviewQuoteInput({
        processedQuote: quote,
        rawTranscript: stephanieLiveTranscript,
        selectedTemplate: plantingTemplate,
      }),
    ),
  })
  assert.ok(model)

  const gardenMix = model.lines.find((line) => line.role === "material" && /garden mix/i.test(line.customerTitle))
  assert.ok(gardenMix)
  assert.equal(gardenMix!.quantity, 5)
  assert.equal(gardenMix!.unitPrice, 18)
  assert.equal(gardenMix!.subtotal, 90)

  const notes = collectPresentationReviewNotes(model)
  assert.equal(notes.some((note) => /garden mix rate missing/i.test(note)), false)

  const { rendered } = quoteDraftRendered(stephanieLiveTranscript, quote)
  assert.equal(includesText(rendered, "Garden mix included"), true, rendered)
})

test("planting mix alias resolves to garden mix material line", () => {
  const quote = buildStephanieQuote()
  quote.materials = ["Five bags of planting mix"]
  quote.line_items = [
    {
      item_code: "MAT-PLANT-MIX",
      item_name: "Planting mix",
      item_type: "material",
      description: "Planting mix",
      quantity: "5",
      unit: "bags",
      rate: "22",
      knowledge_base_rate: "22",
      override_rate: null,
      final_rate_used: "22",
      total: "110",
      match_confidence: "high",
      match_reason: "Matched knowledge item planting mix",
      needs_review: false,
      warning: "",
    },
  ]

  const model = buildQuotePresentationModel({ quote, rawTranscript: stephanieLiveTranscript })
  assert.ok(model)

  const gardenMix = model.lines.find((line) => line.role === "material" && line.customerTitle === "Garden mix")
  assert.ok(gardenMix)
  assert.equal(gardenMix!.unitPrice, 22)
})

test("captured plant delivery suppresses internal delivery review note", () => {
  const quote = buildStephanieQuote()
  quote.materials = [...quote.materials, "Plant delivery fee $85"]
  quote.line_items = [
    {
      item_code: "",
      item_name: "Plant delivery",
      item_type: "material",
      description: "Plant delivery fee",
      quantity: "1",
      unit: "",
      rate: "85",
      knowledge_base_rate: null,
      override_rate: null,
      final_rate_used: "85",
      total: "85",
      match_confidence: "medium",
      match_reason: "Spoken delivery fee",
      needs_review: false,
      warning: "",
    },
  ]

  const model = buildQuotePresentationModel({ quote, rawTranscript: stephanieLiveTranscript })
  assert.ok(model)

  const notes = collectPresentationReviewNotes(model)
  assert.equal(notes.some((note) => /plant delivery fee not captured/i.test(note)), false)
})

test("customer quote hides plant delivery review note", () => {
  const { rendered, internalReviewNotes } = quoteDraftRendered(stephanieLiveTranscript, buildStephanieQuote())

  assert.equal(/plant delivery fee not captured/i.test(rendered), false, rendered)
  assert.equal(
    internalReviewNotes.some((note) => /plant delivery fee not captured/i.test(note)),
    true,
  )
})
