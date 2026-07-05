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
  dedupeOptionalWorkTitles,
  exportViewLines,
  isUsablePlantingCustomerQuote,
  presentationModelRetainsExportMetadata,
  presentationModelRetainsInternalPlantingCalculations,
} from "./index"
import { applyPlantingMaterialOptions } from "../trades/planting/apply-material-options"
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

test("optional works dedupe prefers specific timber border line", () => {
  assert.deepEqual(
    dedupeOptionalWorkTitles([
      "Timber board border installation later",
      "150 by 50 timber board border to do later",
    ]),
    ["150x50 timber board border, if required"],
  )

  const quote = buildStephanieQuote()
  quote.follow_up_tasks = [
    "150 by 50 timber board border to do later",
    "Timber board border installation later",
  ]

  const { presentationSections } = quoteDraftRendered(stephanieLiveTranscript, quote)
  const optionalWorks = presentationSections.find((section) => section.title === "Optional Works")
  assert.ok(optionalWorks)
  assert.equal(optionalWorks!.items.length, 1)
  assert.equal(optionalWorks!.items[0]?.title, "150x50 timber board border, if required")
})

test("Stephanie customer quote hides unpriced planting material trade option cards", () => {
  const quote = buildStephanieQuote()
  applyPlantingMaterialOptions(quote, stephanieLiveTranscript, [])

  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: stephanieLiveTranscript,
    selectedTemplate: plantingTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput)
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: stephanieLiveTranscript,
    selectedTemplate: previewInput.selected_template,
  })
  const rendered = renderCustomerDraftPreviewText(previewModel)

  assert.equal(previewModel.plantingCustomerTradeOptions.length, 0)
  assert.equal(includesText(rendered, "Garden mix to be allowed for separately"), true, rendered)
  assert.equal(/pricing not configured/i.test(rendered), false, rendered)
  assert.equal(/not found in item library/i.test(rendered), false, rendered)
  assert.equal(/\$0\.00/.test(rendered), false, rendered)
  assert.equal(
    previewModel.plantingInternalReviewNotes.some((note) => /garden mix rate missing/i.test(note)),
    true,
  )
  assert.equal(
    previewModel.plantingInternalReviewNotes.some((note) => /not found in item library/i.test(note)),
    true,
  )
  assert.equal(
    previewModel.plantingInternalReviewNotes.some((note) => /pricing not configured/i.test(note)),
    true,
  )
})

test("Stephanie priced plant option still appears after material resolver runs", () => {
  const quote = buildStephanieQuote()
  applyPlantingMaterialOptions(quote, stephanieLiveTranscript, [])

  const { rendered, presentationSections } = quoteDraftRendered(stephanieLiveTranscript, quote)
  const plantingOptions = presentationSections.find((section) => section.title === "Planting Options")
  assert.ok(plantingOptions)
  assert.equal(plantingOptions!.items.some((item) => /Michelia gracipes 4L — \$/i.test(item.title)), true)
  assert.equal(includesText(rendered, "Michelia gracipes 4L — $"), true, rendered)
})

// ---------------------------------------------------------------------------
// Michelia transcript: "plant she wanted was" phrasing — new transcript format
// ---------------------------------------------------------------------------

const micheliaTranscript = `Went to see Stephanie at 10 Cotswold Lane, Mount Wellington.

This is a planting quote for the front garden bed.

The planting area is approximately 14.2 metres long.

The plant she wanted was Michelia gracipes.

She does not want the biggest size, but please show both size options if available.

Plant spacing should be 50 centimetres.

Allow one person for one and a half days because there are roots in the garden bed.

Allow 5 bags of garden mix.

Optional work:
Install a 150x50 timber board border around the planting area.

Internal notes:
This is a planting job, not a garden tidy.
Use the spoken 50 centimetre spacing.
Keep the timber board border as optional work.`

/**
 * Builds a ProcessedQuote that simulates AI output for the Michelia transcript.
 * Includes contaminated optional_quotes.scope with metadata lines, mirroring
 * what the AI sometimes produces for optional works entries.
 */
function buildMicheliaQuote(): ProcessedQuote {
  const [request] = extractPlantCalculatorRequestsFromText(micheliaTranscript)
  const libraryMatch = request
    ? matchPlantRowsFromLibrary(stephanieMicheliaRows, request.plant_name ?? "")
    : undefined
  const result = request
    ? calculatePlantingQuote({ ...request, plant_library_match: libraryMatch })
    : null

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Stephanie",
    site_address: "10 Cotswold Lane, Mount Wellington",
    quote_title: "planting",
    job_type: "planting",
    primary_quote: {
      quote_title: "planting",
      job_type: "planting",
      cadence: "",
      scope: [
        "Supply and plant Michelia gracipes hedge to the agreed planting area",
        "Planting area approximately 14.2 metres long",
        "Plants to be spaced at approximately 50cm centres",
      ],
      notes: [],
    },
    customer_scope: [
      "Supply and plant Michelia gracipes hedge to the agreed planting area",
    ],
    materials: ["Garden mix"],
    labour_allowance: "Allow one person for one and a half days because there are roots in the garden bed",
    // Simulates AI optional_quotes with metadata-contaminated scope
    optional_quotes: [
      {
        ...EMPTY_PROCESSED_QUOTE.primary_quote,
        job_type: "optional work, if required",
        scope: [
          "Title: Optional Works",
          "Job type: optional work, if required",
          ": Install a 150x50 timber board border around the planting area",
        ],
        notes: [],
      },
    ],
    follow_up_tasks: [],
    plant_calculator_results: result ? [result] : [],
    quote_options: result ? quoteOptionsFromPlantCalculatorResults([result]) : [],
  }
}

test("Michelia quote: calculator produces Michelia gracipes not 'long'", () => {
  const [request] = extractPlantCalculatorRequestsFromText(micheliaTranscript)
  assert.ok(request, "Expected a calculator request from Michelia transcript")
  assert.match(
    request.plant_name ?? "",
    /michelia/i,
    `plant_name must be Michelia, not '${request.plant_name}'`,
  )
  assert.ok(!/^long$/i.test(request.plant_name ?? ""), `plant_name must not be 'long'. Got: ${request.plant_name}`)
  assert.equal(request.length_m, 14.2)
  assert.equal(request.spoken_spacing_mm, 500)
})

test("Michelia customer quote uses planting presentation model", () => {
  const { previewModel } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  assert.equal(previewModel.rendererPath, "planting-presentation")
})

test("Michelia customer quote scope shows Michelia gracipes, not 'long hedge'", () => {
  const { rendered } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  assert.ok(includesText(rendered, "Michelia"), `Expected Michelia in rendered output: ${rendered}`)
  assert.ok(!includesText(rendered, "long hedge"), `Must not show 'long hedge': ${rendered}`)
})

test("Michelia customer scope shows Michelia gracipes and not the size suffix from library", () => {
  // When the library name is "Michelia gracipes 4L" and the spoken name is
  // "Michelia gracipes", the scope should say "Michelia gracipes" (no size suffix).
  const { presentationSections } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  const scopeSection = presentationSections.find((s) => s.title === "Scope of Work")
  const firstScopeItem = scopeSection?.items[0]?.title ?? ""
  assert.ok(
    /michelia\s+gracipes/i.test(firstScopeItem),
    `First scope item must contain "Michelia gracipes". Got: "${firstScopeItem}"`,
  )
  assert.ok(
    !/michelia\s+gracipes\s+\d+/i.test(firstScopeItem),
    `Scope must not include size suffix from library (e.g. "Michelia gracipes 4L"). Got: "${firstScopeItem}"`,
  )
})

test("Michelia customer scope uses spoken name over library apostrophe variant", () => {
  // Production scenario: library fuzzy-matches "Michelia gracipes" to "Michelia 'Gracepies'"
  // (a variant with an apostrophe). The spoken name is more reliable here — use it.
  const [request] = extractPlantCalculatorRequestsFromText(micheliaTranscript)
  assert.ok(request, "Calculator must produce a request from Michelia transcript")

  const gracepiesRow = micheliaRow(
    "PLANT-GRACEPIES",
    "Michelia 'Gracepies' 14L",
    "Michelia 'Gracepies' 14L",
    "14L",
    154.0,
    500,
  )
  const libraryMatch = matchPlantRowsFromLibrary([gracepiesRow], request.plant_name ?? "")
  const result = calculatePlantingQuote({ ...request, plant_library_match: libraryMatch })

  const gracepiesQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    quote_title: "planting",
    job_type: "planting",
    primary_quote: {
      quote_title: "planting",
      job_type: "planting",
      cadence: "",
      scope: [],
      notes: [],
    },
    plant_calculator_results: [result],
    quote_options: quoteOptionsFromPlantCalculatorResults([result]),
  }

  const { presentationSections } = quoteDraftRendered(micheliaTranscript, gracepiesQuote)
  const scopeSection = presentationSections.find((s) => s.title === "Scope of Work")
  const firstScopeItem = scopeSection?.items[0]?.title ?? ""
  assert.ok(
    /michelia\s+gracipes/i.test(firstScopeItem),
    `Customer scope must use spoken name "Michelia gracipes", not library variant "Michelia 'Gracepies'". Got: "${firstScopeItem}"`,
  )
  assert.ok(
    !/michelia\s+'gracepies'/i.test(firstScopeItem),
    `Customer scope must not show apostrophe variant "Michelia 'Gracepies'". Got: "${firstScopeItem}"`,
  )
})

test("Michelia customer quote scope shows planting area length", () => {
  const { presentationSections } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  const scopeSection = presentationSections.find((s) => s.title === "Scope of Work")
  const scopeText = scopeSection?.items.map((i) => i.title).join(" ") ?? ""
  assert.ok(/14\.2/i.test(scopeText), `Expected 14.2 metres in scope: ${scopeText}`)
})

test("Michelia customer quote scope shows 50cm spacing", () => {
  const { presentationSections } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  const scopeSection = presentationSections.find((s) => s.title === "Scope of Work")
  const scopeText = scopeSection?.items.map((i) => i.title).join(" ") ?? ""
  assert.ok(/50\s*cm|500\s*mm/i.test(scopeText), `Expected 50cm spacing in scope: ${scopeText}`)
})

test("Michelia customer quote shows Materials section with garden mix", () => {
  const { presentationSections } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  const materialsSection = presentationSections.find((s) => s.title === "Materials")
  assert.ok(materialsSection, `Expected Materials section. Sections: ${presentationSections.map((s) => s.title).join(", ")}`)
  const matText = materialsSection!.items.map((i) => i.title).join(" ")
  assert.ok(/garden\s+mix/i.test(matText), `Expected garden mix in materials: ${matText}`)
})

test("Michelia customer quote shows Labour section", () => {
  const { presentationSections } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  const labourSection = presentationSections.find((s) => s.title === "Labour")
  assert.ok(labourSection, `Expected Labour section. Sections: ${presentationSections.map((s) => s.title).join(", ")}`)
})

test("Michelia customer quote optional works: metadata stripped, timber border present", () => {
  const { presentationSections } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  const optSection = presentationSections.find((s) => s.title === "Optional Works")
  assert.ok(optSection, `Expected Optional Works section. Sections: ${presentationSections.map((s) => s.title).join(", ")}`)
  const optText = optSection!.items.map((i) => i.title).join(" | ")
  assert.ok(/timber.*board.*border|150.*50.*timber/i.test(optText), `Expected timber border in optional works: ${optText}`)
  assert.ok(!/job\s+type\s*:/i.test(optText), `Job type metadata must not appear: ${optText}`)
  assert.ok(!/^title\s*:/im.test(optText), `Title metadata must not appear: ${optText}`)
})

test("Michelia customer quote optional works: no standalone 'optional work' metadata item", () => {
  const { presentationSections } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  const optSection = presentationSections.find((s) => s.title === "Optional Works")
  const optItems = optSection?.items.map((i) => i.title) ?? []
  const badItem = optItems.find((t) => /^optional\s+works?(?:\s*,\s*if\s+required)?$/i.test(t.trim()))
  assert.ok(
    !badItem,
    `Standalone 'optional work' must not appear as an item. Items: ${optItems.join(" | ")}`,
  )
})

test("Michelia customer quote does not expose internal notes", () => {
  const { rendered } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  assert.ok(!/not a garden tidy/i.test(rendered), `Internal note must not appear: ${rendered}`)
  assert.ok(!/use the spoken/i.test(rendered), `Internal note must not appear: ${rendered}`)
})

test("Michelia customer quote does not expose raw labour duration in scope", () => {
  const { rendered } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  // Labour section may say "Planting labour included" but must not expose "1.5 days" in scope
  const scopeMatch = rendered.match(/Scope of Work[\s\S]*?(?=\n[A-Z]|\n\n[A-Z]|$)/)
  const scopeText = scopeMatch?.[0] ?? ""
  assert.ok(!/1\.5\s+days/i.test(scopeText), `Labour duration must not appear in scope section: ${scopeText}`)
})

test("Michelia customer quote does not contain bogus 'metres long. The' plant text", () => {
  const { rendered } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  assert.ok(!/metres\s+long\.\s*The/i.test(rendered), `Bogus "metres long. The" must not appear in customer view: ${rendered}`)
})

test("Michelia customer quote does not contain 'Planting area 2' from bogus second request", () => {
  const { rendered } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  assert.ok(!/Planting area 2/i.test(rendered), `Bogus "Planting area 2" must not appear in customer view: ${rendered}`)
})

test("Michelia customer quote does not contain joined plant names ('Michelia gracipes and')", () => {
  const { rendered } = quoteDraftRendered(micheliaTranscript, buildMicheliaQuote())
  assert.ok(!/Michelia gracipes and/i.test(rendered), `Joined plant names must not appear in customer view: ${rendered}`)
})
