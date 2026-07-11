import assert from "node:assert/strict"
import test from "node:test"

import {
  calculatePlantingQuote,
  extractPlantCalculatorRequestsFromText,
} from "../../calculators/planting"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "../../plants"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import {
  buildPresentationCustomerPreview,
  buildQuotePresentationModel,
  collectPresentationReviewNotes,
} from "../../quote-presentation"
import { clientALiveTranscript } from "../../quote-presentation/client-a-live-transcript"
import { quoteOptionsFromPlantCalculatorResults } from "./quote-options"
import { applyPlantingMaterialOptions } from "./apply-material-options"

const gardenMixItem = {
  source_item_id: "kb-garden-mix",
  item_code: "MAT-GARDEN-MIX",
  item_name: "Garden mix",
  sell_price: 18,
  unit: "bag",
  item_type: "material",
}

const plantingMixAliasItem = {
  source_item_id: "kb-plant-mix",
  item_code: "MAT-PLANT-MIX",
  item_name: "Planting mix",
  sell_price: 22,
  unit: "bag",
  item_type: "material",
  aliases: ["garden mix"],
}

const deliveryItem = {
  source_item_id: "kb-delivery",
  item_code: "DEL-PLANT",
  item_name: "Plant delivery",
  sell_price: 85,
  unit: "each",
  item_type: "material",
}

const clientAMicheliaRows: KnowledgePlantRow[] = [
  {
    item_code: "PLANT-102",
    item_name: "Michelia gracipes 4L",
    aliases: ["Michelia gracipes 4L", "Michelia gracipes"],
    item_type: "plant",
    category: "Hedge",
    sell_price: 68.75,
    raw_import: {
      plant_name: "Michelia gracipes 4L",
      plant_size: "4L",
      pot_size: "4L",
      spacing_mm: 850,
      supplier: "Main Nursery",
      stock_status: "In stock",
      is_true_plant: true,
    },
  },
]

function buildClientAQuote(): ProcessedQuote {
  const [request] = extractPlantCalculatorRequestsFromText(clientALiveTranscript)
  assert.ok(request)
  const libraryMatch = matchPlantRowsFromLibrary(clientAMicheliaRows, request.plant_name ?? "")
  const result = calculatePlantingQuote({ ...request, plant_library_match: libraryMatch })

  return {
    ...EMPTY_PROCESSED_QUOTE,
    line_items: [],
    client_name: "Client A",
    site_address: "10 Willow Lane, Mount Wellington",
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

test("applyPlantingMaterialOptions prices five bags of garden mix from knowledge item", () => {
  const quote = buildClientAQuote()
  const plantingOptionsBefore = (quote.quote_options ?? []).filter((option) => option.category === "planting")

  applyPlantingMaterialOptions(quote, clientALiveTranscript, [gardenMixItem])

  const gardenMix = quote.line_items.find((item) => /garden mix/i.test(item.item_name))
  assert.ok(gardenMix)
  assert.equal(gardenMix.quantity, "5")
  assert.equal(Number(gardenMix.final_rate_used), 18)
  assert.equal(Number(String(gardenMix.total).replace(/[^\d.]/g, "")), 90)
  assert.equal(gardenMix.warning, "")

  const materialOptions = (quote.quote_options ?? []).filter((option) => option.category === "material")
  assert.equal(materialOptions.length, 1)
  assert.equal(materialOptions[0]?.subtotal, 90)

  const plantingOptionsAfter = (quote.quote_options ?? []).filter((option) => option.category === "planting")
  assert.deepEqual(plantingOptionsAfter, plantingOptionsBefore)
})

test("applyPlantingMaterialOptions works for planting job_type without landscaping classification", () => {
  const quote = buildClientAQuote()
  assert.equal(quote.job_type, "planting")

  applyPlantingMaterialOptions(quote, clientALiveTranscript, [gardenMixItem])

  assert.ok(quote.line_items.some((item) => /garden mix/i.test(item.item_name) && Number(item.final_rate_used) === 18))
})

test("applyPlantingMaterialOptions matches garden mix transcript to Planting mix knowledge alias", () => {
  const quote = buildClientAQuote()

  applyPlantingMaterialOptions(quote, clientALiveTranscript, [plantingMixAliasItem])

  const gardenMix = quote.line_items.find((item) => /planting mix|garden mix/i.test(item.item_name))
  assert.ok(gardenMix)
  assert.equal(Number(gardenMix.final_rate_used), 22)
})

test("applyPlantingMaterialOptions leaves material unpriced when no knowledge match exists", () => {
  const quote = buildClientAQuote()

  applyPlantingMaterialOptions(quote, clientALiveTranscript, [])

  const gardenMix = quote.line_items.find((item) => /garden mix/i.test(item.item_name))
  assert.ok(gardenMix)
  assert.equal(gardenMix.quantity, "5")
  assert.equal(gardenMix.final_rate_used, null)
  assert.equal(gardenMix.warning, "Rate missing")

  const model = buildQuotePresentationModel({ quote, rawTranscript: clientALiveTranscript })
  assert.ok(model)
  const rendered = buildPresentationCustomerPreview(model)
    .flatMap((section) => section.items.map((item) => item.title))
    .join("\n")
  assert.equal(rendered.includes("Garden mix included"), false)
  assert.equal(rendered.includes("Garden mix to be allowed for separately"), true)
  assert.equal(collectPresentationReviewNotes(model).some((note) => /garden mix rate missing/i.test(note)), true)
})

test("applyPlantingMaterialOptions prefers spoken unit price over knowledge item rate", () => {
  const quote = buildClientAQuote()
  const transcript = `${clientALiveTranscript.replace(/\.$/, "")}, and price five bags of garden mix at $15 each.`

  applyPlantingMaterialOptions(quote, transcript, [gardenMixItem])

  const gardenMix = quote.line_items.find((item) => /garden mix/i.test(item.item_name))
  assert.ok(gardenMix)
  assert.equal(Number(gardenMix.final_rate_used), 15)
  assert.equal(Number(String(gardenMix.total).replace(/[^\d.]/g, "")), 75)
})

test("resolved plant delivery suppresses missing delivery review note", () => {
  const quote = buildClientAQuote()
  const transcript = `${clientALiveTranscript} Include plant delivery.`

  applyPlantingMaterialOptions(quote, transcript, [gardenMixItem, deliveryItem])

  const model = buildQuotePresentationModel({ quote, rawTranscript: transcript })
  assert.ok(model)
  assert.equal(model.deliveryCaptured, true)
  assert.equal(
    collectPresentationReviewNotes(model).some((note) => /plant delivery fee not captured/i.test(note)),
    false,
  )
})

test("resolved garden mix surfaces as customer included material in presentation model", () => {
  const quote = buildClientAQuote()
  applyPlantingMaterialOptions(quote, clientALiveTranscript, [gardenMixItem])

  const model = buildQuotePresentationModel({ quote, rawTranscript: clientALiveTranscript })
  assert.ok(model)

  const rendered = buildPresentationCustomerPreview(model)
    .flatMap((section) => section.items.map((item) => item.title))
    .join("\n")
  assert.equal(rendered.includes("Garden mix included"), true, rendered)
  assert.equal(collectPresentationReviewNotes(model).some((note) => /garden mix rate missing/i.test(note)), false)
})
