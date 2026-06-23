import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "../address-extraction"
import {
  calculatePlantingQuote,
  extractPlantCalculatorRequestsFromText,
} from "../calculators/planting"
import { extractClientNameFromTranscript } from "../client-name-extraction"
import { assembleCustomerQuote, type CustomerQuoteAssembly } from "../customer-quote-assembly"
import { buildCustomerPreviewQuoteInput } from "../customer-preview-flow"
import { buildCustomerQuotePreview } from "../customer-quote-preview"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "../plants"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import {
  buildQuotePresentationModel,
  customerViewLines,
  exportViewLines,
  internalViewLines,
  type QuotePresentationModel,
} from "./index"
import { quoteOptionsFromPlantCalculatorResults } from "../trades/planting/quote-options"
import type { QuoteTemplateLibraryItem } from "../template-import-learning"

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

const stephanieTranscript =
  "Okay, I went to Stephanie's place yesterday, number 10 Cotswold Lane in Mount Wellington, and she had a few jobs that she wanted done, but one of which was this planting job, and it was a 14.2 metre planting area, and the plant she wanted planting was Michelia gracipes. I'm not sure what we've got in the database, but not the biggest one. Maybe give both sizes as an option, probably with 50 centimetre spacing, so however that works along the length. And then there was an optional note for a 150 by 50 timber board border to do later. I estimate that the labour would be one person, 1.5 days, because there's a few roots that we have to dig through, and she'll also need five bags of garden mix."

const amyFicusRows: KnowledgePlantRow[] = [
  micheliaPlantRow("PLANT-028", "Ficus Tuffi 1.2m Hedge plant", "Ficus Tuffi 1.2m", "1.2m", 34.88, 850),
  micheliaPlantRow("PLANT-047", "Ficus Tuffi 14L Hedge plant", "Ficus Tuffi 14L", "14L", 81.25, 850),
  micheliaPlantRow("PLANT-060", "Ficus Tuffi 25L Hedge plant", "Ficus Tuffi 25L", "25L", 118.75, 850),
]

const stephanieMicheliaRows: KnowledgePlantRow[] = [
  micheliaPlantRow("PLANT-101", "Michelia gracipes 2L", "Michelia gracipes 2L", "2L", 18.5, 600),
  micheliaPlantRow("PLANT-102", "Michelia gracipes 4L", "Michelia gracipes 4L", "4L", 32.0, 600),
]

function micheliaPlantRow(
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

function amyAcceptanceTranscript() {
  const doc = readFileSync(PLANTING_ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Amy acceptance transcript must remain documented")
  return match[1].trim()
}

function plantingCalculatorFixture(transcript: string, plantRows: KnowledgePlantRow[]) {
  const [request] = extractPlantCalculatorRequestsFromText(transcript)
  assert.ok(request, "Planting calculator request should be detected")

  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(plantRows, request.plant_name ?? ""),
  })

  return { request, result, quoteOptions: quoteOptionsFromPlantCalculatorResults([result]) }
}

function buildLivePathPresentationModel(transcript: string, quote: ProcessedQuote) {
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: transcript,
    selectedTemplate: plantingTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput)

  return {
    previewInput,
    customerPreview,
    model: buildQuotePresentationModel({
      quote,
      rawTranscript: transcript,
      customerPreview,
    }),
  }
}

function lineByRole(model: QuotePresentationModel, role: string) {
  return model.lines.filter((line) => line.role === role)
}

function plantOptionLines(model: QuotePresentationModel) {
  return lineByRole(model, "plant_option")
}

function findLine(model: QuotePresentationModel, predicate: (line: (typeof model.lines)[number]) => boolean) {
  return model.lines.find(predicate)
}

function assemblySectionItems(assembly: CustomerQuoteAssembly, title: string) {
  return assembly.sections.find((section) => section.title === title)?.items ?? []
}

function assemblyFlatText(assembly: CustomerQuoteAssembly) {
  return assembly.sections.flatMap((section) => section.items).join("\n").toLowerCase()
}

export type AssemblyDataLossField =
  | "planting_length_m"
  | "plant_name"
  | "plant_count"
  | "spacing_mm"
  | "unit_price"
  | "subtotal"
  | "labour_detail"
  | "material_quantity"
  | "optional_works"
  | "item_code"
  | "account_code"
  | "tax_code"
  | "source_item_id"
  | "warnings"

export type AssemblyComparisonResult = {
  presentationFields: Partial<Record<AssemblyDataLossField, string | number | boolean>>
  assemblyFields: Partial<Record<AssemblyDataLossField, string | number | boolean>>
  lostInAssembly: AssemblyDataLossField[]
}

export function compareAssemblyToPresentation(
  assembly: CustomerQuoteAssembly,
  model: QuotePresentationModel,
): AssemblyComparisonResult {
  const plantingLength = findLine(model, (line) => typeof line.plantingLengthM === "number")
  const plantName = findLine(model, (line) => Boolean(line.plantName))
  const spacing = findLine(model, (line) => line.role === "spacing")
  const plantOptions = plantOptionLines(model)
  const firstPricedOption = plantOptions.find((line) => typeof line.unitPrice === "number")
  const gardenMix = findLine(model, (line) => line.role === "material" && /garden mix/i.test(line.customerTitle))
  const labour = findLine(model, (line) => line.role === "labour")
  const optionalWorks = lineByRole(model, "optional_work")

  const presentationFields: AssemblyComparisonResult["presentationFields"] = {
    planting_length_m: plantingLength?.plantingLengthM ?? undefined,
    plant_name: plantName?.plantName ?? undefined,
    plant_count: firstPricedOption?.plantCount ?? plantingLength?.plantCount ?? undefined,
    spacing_mm: spacing?.spacingMm ?? undefined,
    unit_price: firstPricedOption?.unitPrice ?? undefined,
    subtotal: firstPricedOption?.subtotal ?? undefined,
    labour_detail: labour?.customerDescription ?? undefined,
    material_quantity: gardenMix?.quantity ?? gardenMix?.customerDescription ?? undefined,
    optional_works: optionalWorks.length > 0,
    item_code: firstPricedOption?.itemCode ?? undefined,
    account_code: firstPricedOption?.accountCode ?? undefined,
    tax_code: firstPricedOption?.taxCode ?? undefined,
    source_item_id: firstPricedOption?.sourceItemId ?? undefined,
    warnings: (model.reviewNotices.length > 0 || model.lines.some((line) => (line.warnings ?? []).length > 0)) as boolean,
  }

  const assemblyText = assemblyFlatText(assembly)
  const assemblyFields: AssemblyComparisonResult["assemblyFields"] = {
    planting_length_m: /\b14\.2\s*m|\b11\.5\s*m/i.test(assemblyText) ? "mentioned in text" : undefined,
    plant_name: /michelia|ficus tuffi/i.test(assemblyText) ? "mentioned in text" : undefined,
    plant_count: /\b\d+\s*plants?\b/i.test(assemblyText) ? "mentioned in text" : undefined,
    spacing_mm: /\b50\s*cm|\b500\s*mm|\b850\s*mm|\bspacing\b/i.test(assemblyText) ? "mentioned in text" : undefined,
    unit_price: /\$\d+/i.test(assemblyText) ? "mentioned in text" : undefined,
    subtotal: /\$\d+/i.test(assemblyText) ? "mentioned in text" : undefined,
    labour_detail: assemblySectionItems(assembly, "Labour").some((item) => !/^included$/i.test(item))
      ? "detailed"
      : assemblySectionItems(assembly, "Labour").includes("Included")
        ? "generic included"
        : undefined,
    material_quantity: assemblySectionItems(assembly, "Materials").some((item) => /\d+\s*bags?/i.test(item))
      ? "quantity present"
      : assemblySectionItems(assembly, "Materials").some((item) => /garden mix|mulch/i.test(item))
        ? "keyword only"
        : undefined,
    optional_works: /timber|border|optional/i.test(assemblyText),
    item_code: /PLANT-/i.test(assemblyText),
    account_code: /\b4100\b|\baccount\b/i.test(assemblyText),
    tax_code: /OUTPUT|GST|tax/i.test(assemblyText),
    source_item_id: /PLANT-/i.test(assemblyText),
    warnings: /review|warning|confirm/i.test(assemblyText),
  }

  const lostInAssembly: AssemblyDataLossField[] = []
  for (const field of Object.keys(presentationFields) as AssemblyDataLossField[]) {
    const presentationValue = presentationFields[field]
    const assemblyValue = assemblyFields[field]
    if (presentationValue == null || presentationValue === false) continue

    if (field === "labour_detail") {
      if (presentationValue && assemblyValue === "generic included") lostInAssembly.push(field)
      continue
    }

    if (field === "material_quantity") {
      if (presentationValue && assemblyValue === "keyword only") lostInAssembly.push(field)
      continue
    }

    if (field === "optional_works" || field === "warnings") {
      if (presentationValue === true && !assemblyValue) lostInAssembly.push(field)
      continue
    }

    if (presentationValue && !assemblyValue) lostInAssembly.push(field)
  }

  return { presentationFields, assemblyFields, lostInAssembly }
}

function stephanieStructuredCalculatorFixture() {
  const request = {
    plant_name: "Michelia gracipes",
    length_m: 14.2,
    spoken_spacing_mm: 500,
    requested_option_sizes: ["2l", "4l"],
    source_text: "14.2 metre planting area of Michelia gracipes at 50 centimetre spacing",
  }

  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(stephanieMicheliaRows, request.plant_name),
  })

  return { request, result, quoteOptions: quoteOptionsFromPlantCalculatorResults([result]) }
}

function stephanieQuote(): ProcessedQuote {
  const address = extractAddressDetails(stephanieTranscript)
  const { result, quoteOptions } = stephanieStructuredCalculatorFixture()

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(stephanieTranscript) ?? "Stephanie",
    site_address: address.cleaned_address ?? "10 Cotswold Lane, Mount Wellington",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: [
        "14.2 metre planting area of Michelia gracipes",
        "Five bags of garden mix",
        "One person, 1.5 days labour",
      ],
      notes: [],
    },
    customer_scope: [
      "14.2 metre planting area of Michelia gracipes",
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

function amyQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  const { result, quoteOptions } = plantingCalculatorFixture(transcript, amyFicusRows)

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
    quote_options: quoteOptions,
  }
}

test("Stephanie live-path presentation model retains planting length plant name spacing options labour materials and optional works", () => {
  const quote = stephanieQuote()
  const { model, customerPreview } = buildLivePathPresentationModel(stephanieTranscript, quote)

  assert.ok(model, "Stephanie quote should produce a planting presentation model")
  assert.equal(model!.workflow, "planting")
  assert.equal(model!.clientName, "Stephanie")

  const customerLines = customerViewLines(model!)
  const internalLines = internalViewLines(model!)
  const exportLines = exportViewLines(model!)

  assert.ok(findLine(model!, (line) => line.plantingLengthM === 14.2))
  assert.ok(findLine(model!, (line) => /Michelia gracipes/i.test(line.plantName ?? line.customerDescription ?? "")))
  assert.ok(findLine(model!, (line) => line.role === "spacing" && line.spacingMm === 500))
  assert.equal(plantOptionLines(model!).length, 2)
  assert.ok(plantOptionLines(model!).every((line) => typeof line.plantCount === "number" && line.plantCount! > 0))
  assert.ok(plantOptionLines(model!).every((line) => typeof line.unitPrice === "number"))
  assert.ok(plantOptionLines(model!).every((line) => typeof line.subtotal === "number"))
  assert.ok(findLine(model!, (line) => line.role === "material" && /garden mix/i.test(line.customerTitle)))
  assert.ok(findLine(model!, (line) => line.role === "labour" && /1\.5\s*days/i.test(line.customerDescription ?? "")))
  assert.ok(lineByRole(model!, "optional_work").some((line) => /150.*50.*timber/i.test(line.customerTitle)))

  assert.ok(model!.reviewNotices.some((notice) => /500mm.*600mm|600mm.*500mm/i.test(notice)))
  assert.ok(internalLines.some((line) => line.itemCode?.startsWith("PLANT-")))
  assert.ok(exportLines.some((line) => line.role === "plant_option" && line.itemCode?.startsWith("PLANT-")))
  assert.ok(customerLines.some((line) => line.role === "plant_option"))
  assert.equal(customerPreview.plantOptions.length, 2)
})

test("Amy live-path presentation model retains three priced options length materials and exclusions", () => {
  const transcript = amyAcceptanceTranscript()
  const quote = amyQuote(transcript)
  const { model } = buildLivePathPresentationModel(transcript, quote)

  assert.ok(model)
  assert.ok(findLine(model!, (line) => line.plantingLengthM === 11.5))
  assert.equal(plantOptionLines(model!).length, 3)
  assert.deepEqual(
    plantOptionLines(model!)
      .map((line) => line.customerTitle)
      .sort(),
    ["Ficus Tuffi 1.2m", "Ficus Tuffi 14L", "Ficus Tuffi 25L"].sort(),
  )
  assert.ok(plantOptionLines(model!).every((line) => typeof line.unitPrice === "number"))
  assert.ok(plantOptionLines(model!).every((line) => typeof line.subtotal === "number"))
  assert.ok(findLine(model!, (line) => line.role === "material" && /garden mix/i.test(line.customerTitle)))
  assert.ok(findLine(model!, (line) => line.role === "material" && /mulch/i.test(line.customerTitle)))
  assert.ok(findLine(model!, (line) => line.role === "exclusion" && /irrigation/i.test(line.customerTitle)))
  assert.ok(exportViewLines(model!).filter((line) => line.role === "plant_option").length >= 3)
})

test("Stephanie assembly comparison documents fields lost by current customer assembly", () => {
  const quote = stephanieQuote()
  const { model, previewInput, customerPreview } = buildLivePathPresentationModel(stephanieTranscript, quote)
  assert.ok(model)

  const assembly = assembleCustomerQuote({
    quote,
    rawTranscript: stephanieTranscript,
    selectedTemplate: previewInput.selected_template,
    pricingFacts: customerPreview.pricingFacts.map((fact) => ({
      id: fact.id,
      type: "fixed_price" as const,
      amount: Number(fact.amountText.replace(/[^0-9.]+/g, "")),
      amount_min: null,
      amount_max: null,
      currency: "NZD",
      cadence: null,
      label: "Price",
      inclusions: fact.inclusions,
      source_text: fact.amountText,
      confidence: "high" as const,
    })),
  })

  assert.ok(assembly)
  const comparison = compareAssemblyToPresentation(assembly!, model!)

  assert.deepEqual(sectionLike(assembly!, "Planting Options"), [
    "Option 1: Michelia gracipes 2L",
    "Option 2: Michelia gracipes 4L",
  ])

  assert.ok(comparison.lostInAssembly.includes("planting_length_m"))
  assert.ok(comparison.lostInAssembly.includes("plant_count"))
  assert.ok(comparison.lostInAssembly.includes("spacing_mm"))
  assert.ok(comparison.lostInAssembly.includes("unit_price"))
  assert.ok(comparison.lostInAssembly.includes("subtotal"))
  assert.ok(comparison.lostInAssembly.includes("labour_detail"))
  assert.ok(comparison.lostInAssembly.includes("material_quantity"))
  assert.ok(comparison.lostInAssembly.includes("optional_works"))
  assert.ok(comparison.lostInAssembly.includes("item_code"))
  assert.ok(comparison.lostInAssembly.includes("warnings"))
})

test("Amy assembly comparison documents price and count fields lost by current customer assembly", () => {
  const transcript = amyAcceptanceTranscript()
  const quote = amyQuote(transcript)
  const { model, customerPreview, previewInput } = buildLivePathPresentationModel(transcript, quote)
  assert.ok(model)

  const assembly = assembleCustomerQuote({
    quote,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
    pricingFacts: customerPreview.pricingFacts.map((fact) => ({
      id: fact.id,
      type: "fixed_price" as const,
      amount: Number(fact.amountText.replace(/[^0-9.]+/g, "")),
      amount_min: null,
      amount_max: null,
      currency: "NZD",
      cadence: null,
      label: "Price",
      inclusions: fact.inclusions,
      source_text: fact.amountText,
      confidence: "high" as const,
    })),
  })

  assert.ok(assembly)
  const comparison = compareAssemblyToPresentation(assembly!, model!)

  assert.ok(comparison.lostInAssembly.includes("plant_count"))
  assert.ok(comparison.lostInAssembly.includes("unit_price"))
  assert.ok(comparison.lostInAssembly.includes("subtotal"))
  assert.ok(comparison.lostInAssembly.includes("planting_length_m"))
  assert.ok(comparison.lostInAssembly.includes("spacing_mm"))
  assert.ok(comparison.lostInAssembly.includes("item_code"))
})

function sectionLike(assembly: CustomerQuoteAssembly, title: string) {
  return assembly.sections.find((section) => section.title === title)?.items ?? []
}

test("presentation export view retains metadata required by Xero planting export", () => {
  const transcript = amyAcceptanceTranscript()
  const quote = amyQuote(transcript)
  const { model, customerPreview } = buildLivePathPresentationModel(transcript, quote)
  assert.ok(model)

  const exportLines = exportViewLines(model!)
  const plantExportLines = exportLines.filter((line) => line.role === "plant_option")

  assert.equal(plantExportLines.length, 3)
  assert.ok(plantExportLines.every((line) => line.itemCode?.startsWith("PLANT-")))
  assert.ok(plantExportLines.every((line) => typeof line.quantity === "number" && line.quantity > 0))
  assert.ok(plantExportLines.every((line) => typeof line.unitPrice === "number"))
  assert.ok(plantExportLines.every((line) => typeof line.subtotal === "number"))

  const previewOptionIds = new Set(customerPreview.plantOptions.map((option) => option.id))
  const modelOptionRefs = new Set(plantExportLines.map((line) => line.sourceRef))
  assert.ok([...previewOptionIds].every((id) => modelOptionRefs.has(id)))
})

test("no silent data loss: every priced planting quote option maps to a presentation line", () => {
  const transcript = amyAcceptanceTranscript()
  const quote = amyQuote(transcript)
  const { model } = buildLivePathPresentationModel(transcript, quote)
  assert.ok(model)

  const pricedOptions = (quote.quote_options ?? []).filter(
    (option) => option.category === "planting" && option.lineItems.length > 0 && option.subtotal > 0,
  )
  const presentationOptionLines = plantOptionLines(model!)

  assert.equal(presentationOptionLines.length, pricedOptions.length)
  for (const option of pricedOptions) {
    assert.ok(presentationOptionLines.some((line) => line.sourceRef === option.id))
  }
})
