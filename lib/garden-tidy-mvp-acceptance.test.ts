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
import { extractTidyPricingFacts } from "./export/tidy-pricing-facts"
import { computeTidyTotals, isLabourFinalLine } from "./customer-quote-assembly/garden-tidy"
import { resolveTidyExtras } from "./export/tidy-extras"
import { greenwasteRulePrice } from "./export/waste-line-builder"
import { buildGardenTidyProcessedQuote } from "./garden-tidy-processing"
import type { ProcessedQuote } from "./processed-quote"
import {
  buildQuoteHandoffForDraftPreview,
  editableSectionsToProcessedQuote,
  EMPTY_PROCESSED_QUOTE,
  processedQuoteToEditableSections,
} from "./processed-quote"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import { recommendTemplateForQuote, scoreTemplatesForQuote } from "./template-recommendation"
import { resolveTemplateSelection } from "./template-selection"
import { hasPlantingCalculatorIntent } from "./trades/planting/intent"
import { buildXeroQuotePayload } from "./xero-quote-payload"
import type { CustomerPreviewQuote } from "./customer-quote-preview"

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

const shirleyRawTranscript = `Just went to see Shirley at 6 Percival Parade, Freemans Bay. The quote is a one-off tidy, mostly hedge trimming and tree pruning. We need to prune back the Mexican elder trees on the right-hand boundary. That job will take two people one and a quarter days with two trailer loads of green waste. And we also need to trim the side back and then also trim the top back. Form her property on a sharp angle so it's defined. That's probably going to be three quarters of a trailer load for six days green waste, along with the usual blowdown and tidy of things that we want to do.`

function acceptanceTranscript() {
  const doc = readFileSync(ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Acceptance transcript must remain documented in docs/GARDEN_TIDY_MVP_ACCEPTANCE.md")
  return match[1].trim()
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

function assemblySectionItems(title: string, model: { assembly: { sections: Array<{ title: string; items: string[] }> } | null }) {
  return model.assembly?.sections.find((section) => section.title === title)?.items ?? []
}

// T7 — the merged "Labour - main scope" section carries the scope work items followed by a single
// final labour figure: a $ amount, or a rate-stripped crew/duration allowance when no total is
// derivable. These split the two so assertions stay precise.
function isMoneyLine(value: string) {
  return /^\$[\d,]+\.\d{2}$/.test(value.trim())
}
function labourMainScope(model: Parameters<typeof assemblySectionItems>[1]) {
  return assemblySectionItems("Labour - main scope", model)
}
function labourAmountLines(model: Parameters<typeof assemblySectionItems>[1]) {
  return labourMainScope(model).filter(isMoneyLine)
}
function tidyScopeWork(model: Parameters<typeof assemblySectionItems>[1]) {
  return labourMainScope(model).filter((item) => !isLabourFinalLine(item))
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

function simulateReviewToDraftHandoff(
  baseQuote: ProcessedQuote,
  customerScopeItems: string[],
  primaryQuoteSectionContent: string,
  dirtyKeys: ReadonlySet<string> = new Set(),
  rawTranscript = shirleyRawTranscript,
  selectedTemplate: QuoteTemplateLibraryItem | null = gardenTidyTemplate,
) {
  const sections = processedQuoteToEditableSections(baseQuote).map((section) =>
    section.key === "primary_quote" ? { ...section, content: primaryQuoteSectionContent } : section,
  )
  const editedQuoteForReview = editableSectionsToProcessedQuote(sections, baseQuote)
  const handoffQuote = buildQuoteHandoffForDraftPreview({
    sections,
    baseQuote: editedQuoteForReview,
    customerScopeItems,
    dirtyKeys,
  })
  const pricing = extractPricing(rawTranscript)
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: handoffQuote,
    rawTranscript,
    pricingFacts: pricing.pricing,
    selectedTemplate,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput)
  const model = buildCustomerDraftPreviewModel({
    processedQuote: handoffQuote,
    customerPreview,
    rawTranscript,
    selectedTemplate: previewInput.selected_template,
  })
  return { handoffQuote, model, customerPreview, previewInput }
}

/** Mirrors Quote Review → Push to JMS: buildCustomerPreviewQuoteInput → buildXeroQuotePayload. */
function quoteReviewExportPayload(
  processedQuote: ProcessedQuote,
  rawTranscript: string,
  selectedTemplate: QuoteTemplateLibraryItem | null = gardenTidyTemplate,
) {
  const pricing = extractPricing(rawTranscript)
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote,
    rawTranscript,
    pricingFacts: pricing.pricing,
    selectedTemplate,
  })
  return {
    previewInput,
    payload: buildXeroQuotePayload(previewInput),
    customerPreview: buildCustomerQuotePreview(previewInput),
    draftModel: buildCustomerDraftPreviewModel({
      processedQuote,
      customerPreview: buildCustomerQuotePreview(previewInput),
      rawTranscript,
      selectedTemplate: previewInput.selected_template,
    }),
  }
}

function assertShirleyGardenTidyXeroParity(
  draftModel: ReturnType<typeof buildCustomerDraftPreviewModel>,
  payload: ReturnType<typeof buildXeroQuotePayload>,
) {
  assert.ok(draftModel.assembly, "Customer assembly must activate for Shirley parity")
  assert.equal(draftModel.assembly?.title, "One-Off Garden Tidy")

  const scopeItems = tidyScopeWork(draftModel)
  const greenWasteItems = assemblySectionItems("Green Waste", draftModel)
  assert.ok(scopeItems.length >= 3, `Expected scope items, got: ${scopeItems.join(" | ")}`)
  assert.ok(greenWasteItems.length > 0, `Expected green waste items, got: ${greenWasteItems.join(" | ")}`)

  assert.equal(payload.quote.lineItems.length, 2, "Pristine-style export expects labour + greenwaste lines")
  assert.equal(payload.quote.lineItems[0].description, "One-Off Garden Tidy")
  assert.equal(payload.quote.lineItems[1].description, "Greenwaste")

  const labourDesc = payload.quote.xeroLineItemsArray[0]?.Description ?? ""
  const greenwasteDesc = payload.quote.xeroLineItemsArray[1]?.Description ?? ""

  assert.ok(includesText(labourDesc, "Mexican elder"), labourDesc)
  assert.ok(includesText(labourDesc, "Trim hedge") || includesText(labourDesc, "sharp angle"), labourDesc)
  assert.ok(includesText(labourDesc, "Blowdown"), labourDesc)
  assert.equal(/Labour Allowance:/i.test(labourDesc), false, labourDesc)
  assert.equal(/\btwo people\b/i.test(labourDesc), false, labourDesc)
  assert.equal(/\bone and a quarter\b/i.test(labourDesc), false, labourDesc)

  assert.ok(includesText(greenwasteDesc, "trailer"), greenwasteDesc)
  // Parity: Xero greenwaste text comes from the same assembly Green Waste section as the customer draft.
  const assemblyGreenWasteText = greenWasteItems.join(" ").toLowerCase()
  assert.ok(
    greenWasteItems.some((item) => includesText(greenwasteDesc, item.split(/\s+/).slice(0, 3).join(" "))),
    `Xero greenwaste must reflect assembly items. Assembly: ${assemblyGreenWasteText}. Xero: ${greenwasteDesc}`,
  )

  assert.equal(
    payload.quote.exportWarnings.some((warning) => warning.includes("Customer price not captured")),
    payload.quote.xeroLineItemsArray.some((line) => line.UnitAmount === 0),
    "Unpriced export lines must surface customer price review warning",
  )
}

function assertShirleyStructuredLabourPricing(
  previewInput: CustomerPreviewQuote,
  payload: ReturnType<typeof buildXeroQuotePayload>,
  expectedHours: number,
  hourlyRate: number,
) {
  const expectedTotal = expectedHours * hourlyRate
  assert.equal(payload.quote.xeroLineItemsArray[0]?.UnitAmount, expectedTotal)
  assert.equal(
    payload.quote.exportWarnings.some((warning) => warning.includes('Price missing for "One-Off Garden Tidy"')),
    false,
  )
}

test("garden tidy MVP: Shirley live handoff — visible review scope reaches assembleGardenTidyCustomerQuote", () => {
  const baseQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Shirley",
    site_address: "Shirley address",
    job_type: "hedge_trimming",
    selected_template_name: "One-Off Garden Tidy",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "hedge_trimming",
      scope: [],
      notes: [],
    },
    customer_scope: [],
    labour_allowance: "",
    greenwaste: "",
  }

  const customerScopeItems = [
    "Prune back the Mexican elder trees on the right-hand boundary.",
    "Trim the side back and trim the top back from the property on a sharp angle to define it.",
    "Complete the usual blowdown and tidy.",
  ]

  const primaryQuoteSectionContent = [
    "Scope: Prune back the Mexican elder trees on the right-hand boundary.",
    "Scope: Trim the side back and trim the top back from the property on a sharp angle to define it.",
    "Scope: Complete the usual blowdown and tidy.",
    "Note: Job will take two people one and a quarter days.",
    "Note: Two trailer loads of greenwaste expected.",
    "Note: Three quarters of a trailer load of greenwaste for six days.",
  ].join("\n")

  const { handoffQuote, model } = simulateReviewToDraftHandoff(
    baseQuote,
    customerScopeItems,
    primaryQuoteSectionContent,
  )

  assert.ok(handoffQuote.customer_scope.length >= 3)
  assert.equal(handoffQuote.primary_quote.scope.length, 3)
  assert.equal(handoffQuote.primary_quote.notes.length, 3)
  assert.ok(model.assemblyInputDebug)
  assert.ok(model.assemblyInputDebug!.customer_scope.length >= 3)
  assert.equal(model.assemblyInputDebug!.primary_quote_scope.length, 3)
  assert.equal(model.assemblyInputDebug!.primary_quote_notes.length, 3)
  assert.ok((model.assembly?.sections.length ?? 0) > 1)

  const rendered = renderCustomerDraftPreviewText(model)
  assert.match(rendered, /Labour - main scope/i)
  assert.match(rendered, /Labour - main scope/i)
  assert.match(rendered, /Green Waste/i)
  assert.match(rendered, /Service Includes/i)
  assert.match(rendered, /Mexican elder trees/i)
  assert.match(rendered, /two people one and a quarter days/i)
  assert.match(rendered, /Two trailer loads of greenwaste expected/i)
})

test("Shirley live handoff — Scope of Work excludes labour and greenwaste quantity lines", () => {
  const baseQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Shirley",
    site_address: "Shirley address",
    job_type: "hedge_trimming",
    selected_template_name: "One-Off Garden Tidy",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "hedge_trimming",
      scope: [],
      notes: [],
    },
    customer_scope: [],
    labour_allowance: "",
    greenwaste: "",
  }

  const customerScopeItems = [
    "Prune back the Mexican elder trees on the right-hand boundary.",
    "Trim the side back and trim the top back from the property on a sharp angle to define it.",
    "Complete the usual blowdown and tidy.",
  ]

  const primaryQuoteSectionContent = [
    "Scope: Prune back the Mexican elder trees on the right-hand boundary.",
    "Scope: Trim the side back and trim the top back from the property on a sharp angle to define it.",
    "Scope: Complete the usual blowdown and tidy.",
    "Note: Job will take two people one and a quarter days.",
    "Note: Two trailer loads of greenwaste expected.",
    "Note: Three quarters of a trailer load of greenwaste for six days.",
  ].join("\n")

  const { model } = simulateReviewToDraftHandoff(baseQuote, customerScopeItems, primaryQuoteSectionContent)
  // T7 — the merged "Labour - main scope" line carries the scope work items and the labour
  // allowance; greenwaste quantities and service boilerplate must still be kept OUT of it.
  const labourLine = labourMainScope(model)
  const greenwaste = assemblySectionItems("Green Waste", model)
  const includes = assemblySectionItems("Service Includes", model)

  assert.ok(labourLine.some((item) => /mexican elder/i.test(item)))
  assert.ok(labourLine.some((item) => /trim/i.test(item)))
  assert.ok(labourLine.some((item) => /blowdown|tidy/i.test(item)))
  assert.ok(labourLine.some((item) => /two people/i.test(item)), "labour allowance is part of the labour line")
  assert.ok(!labourLine.some((item) => /trailer load/i.test(item)), `Greenwaste quantities must not appear in the labour line: ${labourLine.join(" | ")}`)
  assert.ok(
    !labourLine.some((item) => /including greenwaste removal/i.test(item)),
    `Service include boilerplate must not appear in the labour line: ${labourLine.join(" | ")}`,
  )

  assert.ok(greenwaste.length > 0)
  assert.ok(greenwaste.some((item) => /trailer/i.test(item)))
  assert.ok(includes.some((item) => /greenwaste removal/i.test(item)))
})

// B1 — notes→customer-scope leak fix + priced labour/greenwaste from what was spoken.
// PRODUCTION_DIRECTION: internal notes must NEVER reach the customer; labour/greenwaste
// become $ lines from spoken figures. Deterministic fixtures (no live extraction).

test("B1 David tidy — internal notes never reach customer scope; labour priced from spoken hours×rate", () => {
  const david: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "David",
    site_address: "88B Kurahaupo Street, Orakei",
    job_type: "one_off_tidy",
    quote_title: "One-off tidy",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "one_off_tidy",
      scope: [
        "Tidy the leaves",
        "Cut back the roses",
        "Weed the steps and the pathway",
        "Cut and paste the dam line",
        "Weed the front side",
        "Prune hydrangeas",
      ],
      notes: [
        "Estimate: 5 hours of work",
        "Labour rate: $80 an hour",
        "Green waste allowance: 1.5 days",
        "Dump rate: $5",
        "Blowdown on Friday added to labour",
      ],
    },
    labour_allowance: "5 hours at $80 per hour",
    greenwaste: "1.5 days",
  }

  const model = currentDraftPreviewModel("", david)
  // David's labour is priced ($400), so the scope-work portion is the labour line minus the $ line.
  const scope = tidyScopeWork(model)
  const labour = labourAmountLines(model)

  // Scope of Work: work items only — no Friday, hourly rate, labour hours, dump rate or greenwaste.
  assert.ok(scope.length >= 4, `Expected work items in scope. Got: ${scope.join(" | ")}`)
  assert.ok(!scope.some((item) => /friday/i.test(item)), `Friday leaked to scope: ${scope.join(" | ")}`)
  assert.ok(!scope.some((item) => /per hour|\$\s?80|\bhours?\b/i.test(item)), `Labour basis leaked to scope: ${scope.join(" | ")}`)
  assert.ok(!scope.some((item) => /dump\s+rate/i.test(item)), `Dump rate leaked to scope: ${scope.join(" | ")}`)
  assert.ok(!scope.some((item) => /green\s*waste/i.test(item)), `Greenwaste leaked to scope: ${scope.join(" | ")}`)
  assert.ok(!scope.some((item) => /labou?r\s+note/i.test(item)), `Labour note leaked to scope: ${scope.join(" | ")}`)

  // Labour: priced $ total from "5 hours at $80 per hour" = $400, never a raw rate.
  assert.deepEqual(labour, ["$400.00"], `Labour should be the spoken $ total. Got: ${labour.join(" | ")}`)

  // Nothing internal leaked anywhere the customer sees (rendered draft).
  const rendered = renderCustomerDraftPreviewText(model)
  assert.equal(/friday/i.test(rendered), false, rendered)
  assert.equal(/dump\s+rate/i.test(rendered), false, rendered)
  assert.equal(/\$\s?80\s*(?:per|an|\/)\s*hour/i.test(rendered), false, rendered)
})

test("B1 Xavier tidy — labour rate stripped when no total spoken; greenwaste priced from spoken $", () => {
  const xavier: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Xavier Begg",
    site_address: "90a Owens Road, Mount Eden",
    job_type: "one_off_tidy",
    quote_title: "One-off tidy",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "one_off_tidy",
      scope: [
        "Spray the kumara vine with extra strength weed killer",
        "Trim the hedge in the driveway",
        "Weeding by the Nikau",
      ],
      notes: [
        "Estimated a full day with two people at $80 an hour",
        "Estimated $130 of green waste",
        "Tentative plans for larger and smaller versions of the job",
      ],
    },
    labour_allowance: "Two people at $80 per hour",
    greenwaste: "Estimated $130 of green waste",
  }

  const model = currentDraftPreviewModel("", xavier)
  // Xavier's labour is unpriced, so the crew allowance is the labour line's final item.
  const scope = labourMainScope(model)
  const labour = labourMainScope(model)
  const greenwaste = assemblySectionItems("Green Waste", model)

  // The labour line excludes the labour basis rate, greenwaste and the planning-meta chatter.
  assert.ok(!scope.some((item) => /per hour|\$\s?80|full day with two people/i.test(item)), `Labour leaked to scope: ${scope.join(" | ")}`)
  assert.ok(!scope.some((item) => /green\s*waste|\$\s?130/i.test(item)), `Greenwaste leaked to scope: ${scope.join(" | ")}`)
  assert.ok(!scope.some((item) => /tentative|versions? of the job/i.test(item)), `Planning-meta leaked to scope: ${scope.join(" | ")}`)

  // Labour: no spoken total → crew shown WITHOUT the hourly rate (never a rate leak).
  assert.ok(labour.length > 0, "Labour section should be present")
  assert.ok(labour.some((item) => /two people/i.test(item)), `Expected crew allowance. Got: ${labour.join(" | ")}`)
  assert.ok(!labour.some((item) => /per hour|\$\s?80/i.test(item)), `Hourly rate leaked in Labour: ${labour.join(" | ")}`)

  // Greenwaste: its own priced line from the spoken "$130 of green waste".
  assert.ok(greenwaste.some((item) => /\$130\b/.test(item)), `Greenwaste should be priced $130. Got: ${greenwaste.join(" | ")}`)
})

// T1 — deterministic tidy pricing facts. Spoken totals are parsed from the RAW transcript so the
// same transcript yields the SAME figures every run (not dependent on AI-narrated fields).

const T1_DAVID_TRANSCRIPT =
  "This is a one-off tidy and it's five hours, we're gonna do it $80 an hour, so $400 for labour, 1.5 days of green waste, and $5 of dump rate. And a blowdown on Friday to add to the labour note."
const T1_XAVIER_TRANSCRIPT =
  "Probably a full day with two people at $80 an hour. I'd probably say $130 of green waste. Spray the kumara vine with the extra strength weed killer."

function t1TidyQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Test",
    site_address: "1 Test St",
    job_type: "one_off_tidy",
    quote_title: "One-off tidy",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "one_off_tidy",
      scope: ["Tidy the leaves", "Weed the steps and pathway", "Prune hydrangeas"],
      notes: [],
    },
    // Deliberately empty: the priced figures must come from the transcript, not these fields.
    labour_allowance: "",
    greenwaste: "",
  }
}

test("T1 extractTidyPricingFacts parses spoken totals and foundation facts deterministically", () => {
  const david = extractTidyPricingFacts(T1_DAVID_TRANSCRIPT)
  assert.equal(david.spokenLabourTotal, 400)
  assert.equal(david.labourRate, 80)
  assert.equal(david.labourHours, 5)
  assert.equal(david.spokenGreenwasteTotal, null, "'1.5 days' is not a dollar total")
  assert.equal(david.greenwasteOddUnit, "1.5 days")
  assert.equal(david.labourDays, null, "the greenwaste '1.5 days' must not be read as labour days")

  const xavier = extractTidyPricingFacts(T1_XAVIER_TRANSCRIPT)
  assert.equal(xavier.spokenLabourTotal, null, "no '$N for labour' spoken")
  assert.equal(xavier.labourRate, 80)
  assert.equal(xavier.labourDays, 1)
  assert.equal(xavier.labourPeople, 2)
  assert.equal(xavier.spokenGreenwasteTotal, 130)
  assert.deepEqual(xavier.extras, [{ name: "Weedkiller - extra strength" }])

  assert.equal(extractTidyPricingFacts("two bags of green waste per visit").greenwasteBags, 2)
  assert.equal(extractTidyPricingFacts("half a trailer load of greenwaste").greenwasteTrailers, 0.5)

  // Determinism: same input → identical facts every call.
  assert.deepEqual(extractTidyPricingFacts(T1_DAVID_TRANSCRIPT), extractTidyPricingFacts(T1_DAVID_TRANSCRIPT))
})

test("T1 David — labour $400 comes from the spoken transcript total, with the AI fields empty", () => {
  const model = currentDraftPreviewModel(T1_DAVID_TRANSCRIPT, t1TidyQuote())
  assert.deepEqual(labourAmountLines(model), ["$400.00"])
})

test("T1 Xavier — greenwaste $130 comes from the spoken transcript total, with the AI fields empty", () => {
  const model = currentDraftPreviewModel(T1_XAVIER_TRANSCRIPT, t1TidyQuote())
  const greenwaste = assemblySectionItems("Green Waste", model)
  assert.ok(greenwaste.some((item) => /\$130\b/.test(item)), `Expected $130 greenwaste. Got: ${greenwaste.join(" | ")}`)
})

test("T1 — the same transcript yields the same priced figures across repeated runs", () => {
  for (const _ of [1, 2, 3, 4, 5]) {
    const model = currentDraftPreviewModel(T1_DAVID_TRANSCRIPT, t1TidyQuote())
    assert.deepEqual(labourAmountLines(model), ["$400.00"])
  }
})

// T2 — labour day-rate rule: full day = 7.5h, rate PER PERSON, spoken total wins. Computed from
// the deterministic T1 transcript facts, so it is stable run-to-run.

const T2_XAVIER_FULL_TRANSCRIPT =
  "Probably a full day with two people at $80 an hour. I'd probably say $130 of green waste. We could probably reduce the smaller version to 11 hours labour and then green waste 90."

test("T2 Xavier — labour computes 7.5h × 2 people × $80 = $1,200 (full-day rule beats the reduced-option '11 hours')", () => {
  const model = currentDraftPreviewModel(T2_XAVIER_FULL_TRANSCRIPT, t1TidyQuote())
  assert.deepEqual(labourAmountLines(model), ["$1,200.00"])
})

test("T2 David — a spoken labour total ($400) still wins over the day-rate rule", () => {
  const model = currentDraftPreviewModel(T1_DAVID_TRANSCRIPT, t1TidyQuote())
  assert.deepEqual(labourAmountLines(model), ["$400.00"])
})

test("T2 — the computed labour figure is identical across repeat runs (deterministic)", () => {
  for (const _ of [1, 2, 3, 4, 5]) {
    const model = currentDraftPreviewModel(T2_XAVIER_FULL_TRANSCRIPT, t1TidyQuote())
    assert.deepEqual(labourAmountLines(model), ["$1,200.00"])
  }
})

// T3 — greenwaste business rule: $26.50/bag, 6 bags = 1 trailer, spoken $ wins, odd units flagged.

function greenWasteLine(model: ReturnType<typeof currentDraftPreviewModel>) {
  return assemblySectionItems("Green Waste", model)
}

test("T3 greenwaste rule — bags and trailers price deterministically from the transcript facts", () => {
  assert.equal(greenwasteRulePrice(extractTidyPricingFacts("three bags of green waste")), 79.5)
  assert.equal(greenwasteRulePrice(extractTidyPricingFacts("half a trailer load of greenwaste")), 79.5)
  assert.equal(greenwasteRulePrice(extractTidyPricingFacts("one trailer load of greenwaste")), 159)
  assert.equal(greenwasteRulePrice(extractTidyPricingFacts("two trailer loads of green waste")), 318)
  assert.equal(greenwasteRulePrice(extractTidyPricingFacts("1.5 days of green waste")), null, "odd unit is not priced by the rule")
})

test("T3 Xavier — spoken greenwaste $130 wins over the bag/trailer rule", () => {
  const model = currentDraftPreviewModel(T1_XAVIER_TRANSCRIPT, t1TidyQuote())
  assert.ok(greenWasteLine(model).some((item) => /\$130\b/.test(item)), greenWasteLine(model).join(" | "))
})

test("T3 bags — a stated bag quantity prices at $26.50/bag", () => {
  const model = currentDraftPreviewModel("One-off tidy. Weed the beds and prune the shrubs. Three bags of green waste.", t1TidyQuote())
  assert.ok(greenWasteLine(model).some((item) => /79\.50\b/.test(item)), greenWasteLine(model).join(" | "))
})

test("T3 David — an odd greenwaste unit ('1.5 days') is flagged, not guessed (no $ line)", () => {
  const model = currentDraftPreviewModel(T1_DAVID_TRANSCRIPT, t1TidyQuote())
  const greenwaste = greenWasteLine(model)
  assert.ok(!greenwaste.some((item) => /\$/.test(item)), `David greenwaste must not be priced. Got: ${greenwaste.join(" | ")}`)
})

test("T3 — the computed greenwaste figure is identical across repeat runs (deterministic)", () => {
  for (const _ of [1, 2, 3, 4, 5]) {
    const model = currentDraftPreviewModel("One-off tidy. Weed the beds. Half a trailer load of greenwaste.", t1TidyQuote())
    assert.ok(greenWasteLine(model).some((item) => /79\.50\b/.test(item)), greenWasteLine(model).join(" | "))
  }
})

// T4 — priced tidy extras: a small extensible price list, spoken $ wins, unmatched extras flagged.

const T4_TWO_WEEDKILLERS =
  "One-off tidy. Spray the kumara vine with the extra strength weed killer and the wall with the organic weed killer. Weed the beds."

function extrasLine(model: ReturnType<typeof currentDraftPreviewModel>) {
  return assemblySectionItems("Extras", model)
}

test("T4 extras — price list resolves listed extras and flags unmatched ones", () => {
  const resolved = resolveTidyExtras(extractTidyPricingFacts(T4_TWO_WEEDKILLERS), T4_TWO_WEEDKILLERS)
  assert.deepEqual(resolved, [
    { name: "Weedkiller - extra strength", amount: 6 },
    { name: "Weedkiller - organic", amount: null },
  ])
})

test("T4 extras — a spoken $ next to the extra wins over the price list", () => {
  const transcript = "One-off tidy. Spray with the extra strength weed killer for $8."
  const resolved = resolveTidyExtras(extractTidyPricingFacts(transcript), transcript)
  assert.deepEqual(resolved, [{ name: "Weedkiller - extra strength", amount: 8 }])
})

test("T4 Xavier-style — extras render as priced ($6) and flagged lines in the customer draft", () => {
  const extras = extrasLine(currentDraftPreviewModel(T4_TWO_WEEDKILLERS, t1TidyQuote()))
  assert.ok(extras.some((item) => /Weedkiller - extra strength — \$6\.00\b/.test(item)), extras.join(" | "))
  assert.ok(extras.some((item) => /Weedkiller - organic — price to confirm/.test(item)), extras.join(" | "))
})

test("T4 — a tidy with no extras has no Extras section", () => {
  const model = currentDraftPreviewModel("One-off tidy. Weed the beds and prune the shrubs.", t1TidyQuote())
  assert.equal(model.assembly?.sections.some((s) => s.title === "Extras"), false)
})

test("T4 — the extras figures are identical across repeat runs (deterministic)", () => {
  for (const _ of [1, 2, 3, 4, 5]) {
    assert.deepEqual(extrasLine(currentDraftPreviewModel(T4_TWO_WEEDKILLERS, t1TidyQuote())), [
      "Weedkiller - extra strength — $6.00",
      "Weedkiller - organic — price to confirm",
    ])
  }
})

// T5 — GST-inclusive totals in the line-item format. Line amounts include GST; TOTAL is their
// sum; the GST line is the SUM of each line's GST portion (per-line rounding, like Xero/Joe's
// quotes), NOT total × 3/23.

const T5_XAVIER =
  "Probably a full day with two people at $80 an hour. I'd probably say $130 of green waste. Spray with the extra strength weed killer and the organic weed killer."

test("T5 GST — per-line inclusive GST matches the answer keys (Xavier $104.20, David $62.57)", () => {
  assert.deepEqual(computeTidyTotals([720, 72.88, 6]), { total: 798.88, gst: 104.2 })
  assert.deepEqual(computeTidyTotals([440, 39.75]), { total: 479.75, gst: 62.57 })
  // Per-line rounding is what the answer key uses; total × 3/23 would give David $62.58 instead.
  assert.equal(Math.round(((479.75 * 3) / 23) * 100) / 100, 62.58)
})

test("T5 Xavier — priced lines total with per-line GST, in 2dp", () => {
  const totals = assemblySectionItems("Totals", currentDraftPreviewModel(T5_XAVIER, t1TidyQuote()))
  assert.ok(totals.includes("Total (NZD): $1,336.00"), totals.join(" | "))
  assert.ok(totals.includes("Includes GST (15%): $174.26"), totals.join(" | "))
  assert.ok(totals.some((item) => /still to be confirmed/.test(item)), "organic weedkiller is flagged → pending note")
})

test("T5 David — total covers priced labour ($400); unpriced greenwaste is excluded and noted", () => {
  const totals = assemblySectionItems("Totals", currentDraftPreviewModel(T1_DAVID_TRANSCRIPT, t1TidyQuote()))
  assert.ok(totals.includes("Total (NZD): $400.00"), totals.join(" | "))
  assert.ok(totals.includes("Includes GST (15%): $52.17"), totals.join(" | "))
  assert.ok(totals.some((item) => /still to be confirmed/.test(item)))
})

test("T5 — no total is shown until labour is priced (labour is the anchor line)", () => {
  // A crew/duration allowance with no rate → labour unpriced → no Totals section.
  const model = currentDraftPreviewModel("One-off tidy. Weed the beds. Two people for the day.", t1TidyQuote())
  assert.equal(model.assembly?.sections.some((s) => s.title === "Totals"), false)
})

test("T5 — totals are identical across repeat runs (deterministic)", () => {
  for (const _ of [1, 2, 3, 4, 5]) {
    const totals = assemblySectionItems("Totals", currentDraftPreviewModel(T5_XAVIER, t1TidyQuote()))
    assert.ok(totals.includes("Total (NZD): $1,336.00"), totals.join(" | "))
  }
})

// T6 — Xero export includes an extras line so its total matches the customer draft, and the
// labour is a single "Labour - main scope" prose line.

test("T6 Xavier — Xero export total matches the customer draft total (parity, $1,336)", () => {
  const quote = t1TidyQuote()
  const previewInput = buildCustomerPreviewQuoteInput({ processedQuote: quote, rawTranscript: T5_XAVIER })
  const payload = buildXeroQuotePayload(previewInput)
  const xeroTotal = payload.quote.xeroLineItemsArray.reduce((sum, li) => sum + (Number(li.UnitAmount) || 0), 0)
  assert.equal(Math.round(xeroTotal * 100) / 100, 1336, JSON.stringify(payload.quote.xeroLineItemsArray))

  const totals = assemblySectionItems("Totals", currentDraftPreviewModel(T5_XAVIER, quote))
  assert.ok(totals.includes("Total (NZD): $1,336.00"), totals.join(" | "))
})

test("Shirley live handoff — Green Waste dedupes repeated two-trailer lines", () => {
  const baseQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Shirley",
    site_address: "Shirley address",
    job_type: "hedge_trimming",
    selected_template_name: "One-Off Garden Tidy",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "hedge_trimming",
      scope: [],
      notes: [],
    },
    customer_scope: [],
    labour_allowance: "",
    greenwaste: "Two trailer loads expected",
  }

  const primaryQuoteSectionContent = [
    "Note: Two trailer loads expected.",
    "Note: Two trailer loads of greenwaste expected.",
    "Note: Three quarters of a trailer load of greenwaste for six days.",
  ].join("\n")

  const sections = processedQuoteToEditableSections(baseQuote).map((section) =>
    section.key === "primary_quote" ? { ...section, content: primaryQuoteSectionContent } : section,
  )
  const handoffQuote = buildQuoteHandoffForDraftPreview({
    sections,
    baseQuote: editableSectionsToProcessedQuote(sections, baseQuote),
    customerScopeItems: [],
    dirtyKeys: new Set(),
  })
  const model = currentDraftPreviewModel(shirleyRawTranscript, handoffQuote, gardenTidyTemplate)
  const greenwaste = assemblySectionItems("Green Waste", model)

  const twoTrailerLines = greenwaste.filter((item) => /\btwo\s+trailer\s+loads?\b/i.test(item))
  assert.equal(
    twoTrailerLines.length,
    1,
    `Expected one two-trailer line. Got: ${greenwaste.join(" | ")}`,
  )
  assert.ok(
    greenwaste.some((item) => /quarter/i.test(item)),
    `Distinct fractional trailer line must remain. Got: ${greenwaste.join(" | ")}`,
  )
})

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
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
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

  // T7 — the scope work items and the labour allowance ("1 day, 2 staff") are now one merged
  // "Labour - main scope" line in the rendered draft.
  const expected = [
    "Prepared for",
    "Sarah",
    "44 Amy Street",
    "Quote",
    "One-Off Garden Tidy",
    "Labour - main scope",
    "Remove overgrowth around boundary",
    "Cut back shrubs",
    "Weed garden beds",
    "Remove self-seeded plants",
    "1 day, 2 staff",
    "Service Includes",
    "Greenwaste removal",
    "Price",
    "$1,440.00",
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
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Greenwaste removal"), true, renderedText)
  assert.equal(includesText(renderedText, "$1,440"), true, renderedText)
  assert.equal(includesText(renderedText, "Renderer path: legacy"), false, renderedText)
  assert.equal(includesText(renderedText, "Assembly exists: no"), false, renderedText)
})

// ---------------------------------------------------------------------------
// Shirley real-world quote — full live-path acceptance (Pristine Gardens)
// ---------------------------------------------------------------------------

function shirleyProcessedQuote(): ProcessedQuote {
  return {
    ...buildGardenTidyProcessedQuote(shirleyRawTranscript),
    // Override with realistic AI-extraction output for the Shirley transcript.
    // The deterministic builder does not handle pruning/trimming/blowdown scope
    // patterns, so we supply the fields as the live AI path would populate them.
    job_type: "one_off_tidy",
    labour_allowance: "Two people for approximately one and a quarter days",
    greenwaste: "Approximately two trailer loads for tree pruning and three quarters of a trailer load for hedge trimming",
    customer_scope: [
      "Prune back Mexican elder trees along the right-hand boundary",
      "Trim hedge sides and top to a defined sharp angle",
      "Blowdown and tidy on completion",
    ],
    primary_quote: {
      quote_title: "One-Off Garden Tidy",
      job_type: "one_off_tidy",
      cadence: "",
      scope: [
        "Prune back Mexican elder trees along the right-hand boundary",
        "Trim hedge sides and top to a defined sharp angle",
        "Blowdown and tidy on completion",
      ],
      notes: [],
    },
  }
}

test("Shirley one-off tidy — live path renders Scope of Work with all captured items", () => {
  const quote = shirleyProcessedQuote()
  const renderedText = currentRenderedDraft(shirleyRawTranscript, quote)

  assert.equal(includesText(renderedText, "One-Off Garden Tidy"), true, renderedText)
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Mexican elder"), true, renderedText)
  assert.equal(includesText(renderedText, "Trim hedge"), true, renderedText)
  assert.equal(includesText(renderedText, "Blowdown"), true, renderedText)
})

test("Shirley one-off tidy — live path renders Labour Allowance section", () => {
  const quote = shirleyProcessedQuote()
  const renderedText = currentRenderedDraft(shirleyRawTranscript, quote)

  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Two people"), true, renderedText)
  assert.equal(includesText(renderedText, "one and a quarter"), true, renderedText)
})

test("Shirley one-off tidy — live path renders Green Waste section with trailer-load quantities", () => {
  const quote = shirleyProcessedQuote()
  const renderedText = currentRenderedDraft(shirleyRawTranscript, quote)

  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
  assert.equal(includesText(renderedText, "trailer"), true, renderedText)
  assert.equal(includesText(renderedText, "quarter"), true, renderedText)
})

test("Shirley one-off tidy — live path is not limited to only Service Includes Greenwaste removal", () => {
  const quote = shirleyProcessedQuote()
  const model = currentDraftPreviewModel(shirleyRawTranscript, quote)
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.ok(model.assembly, "Assembly path must be used for Shirley quote")
  assert.ok(
    (model.assembly?.sections.length ?? 0) >= 3,
    `Must have at least 3 sections. Got: ${model.assembly?.sections.map((s) => s.title).join(", ")}`,
  )
  assert.equal(includesText(renderedText, "Planting labour"), false, renderedText)
  assert.equal(includesText(renderedText, "Monthly maintenance"), false, renderedText)
  assert.equal(/legacy labour total/i.test(renderedText), false, renderedText)
})

// ---------------------------------------------------------------------------
// Shirley template path — "Use Template As Quote" simulation
// These tests reproduce the exact live path after pressing "Use Template As Quote":
//   - processedQuote is the edited live quote
//   - gardenTidyTemplate is the manually-selected template
//   - buildCustomerDraftPreviewModel is called with selectedTemplate set
// ---------------------------------------------------------------------------

test("Shirley Use-Template-As-Quote — assembly still activates and sections count > 1", () => {
  const quote = shirleyProcessedQuote()
  const model = currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate)
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.ok(model.assembly, "Assembly must exist in template path")
  assert.ok(
    (model.assembly?.sections.length ?? 0) > 1,
    `Template path must produce more than 1 section. Got: ${model.assembly?.sections.map((s) => s.title).join(", ")}`,
  )
  assert.equal(includesText(renderedText, "One-Off Garden Tidy"), true, renderedText)
  assert.equal(includesText(renderedText, "Service Includes"), true, renderedText)
  assert.equal(includesText(renderedText, "Greenwaste removal"), true, renderedText)
})

test("Shirley Use-Template-As-Quote — Scope of Work and items appear in template path", () => {
  const quote = shirleyProcessedQuote()
  const renderedText = renderCustomerDraftPreviewText(currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate))

  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Mexican elder"), true, renderedText)
  assert.equal(includesText(renderedText, "Trim hedge"), true, renderedText)
  assert.equal(includesText(renderedText, "Blowdown"), true, renderedText)
})

test("Shirley Use-Template-As-Quote — Labour Allowance and Green Waste appear in template path", () => {
  const quote = shirleyProcessedQuote()
  const renderedText = renderCustomerDraftPreviewText(currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate))

  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "two people"), true, renderedText)
  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
  assert.equal(includesText(renderedText, "trailer"), true, renderedText)
})

// ---------------------------------------------------------------------------
// Shirley Xero live-path parity — same pipeline as Quote Review → Push to JMS
// ---------------------------------------------------------------------------

test("Shirley live path — Xero export scope parallels customer assembly (Use Template As Quote)", () => {
  const quote = shirleyProcessedQuote()
  const { draftModel, payload } = quoteReviewExportPayload(quote, shirleyRawTranscript, gardenTidyTemplate)

  assertShirleyGardenTidyXeroParity(draftModel, payload)
  assert.equal(includesText(renderCustomerDraftPreviewText(draftModel), "Labour - main scope"), true)
  assert.equal(includesText(renderCustomerDraftPreviewText(draftModel), "Green Waste"), true)
})

test("Shirley live handoff — Xero export uses same assembly scope as QuoteDraft preview", () => {
  const baseQuote = shirleyHedgeTrimmingProcessedQuote()
  const customerScopeItems = [
    "Prune back the Mexican elder trees on the right-hand boundary.",
    "Trim the side back and trim the top back from the property on a sharp angle to define it.",
    "Complete the usual blowdown and tidy.",
  ]
  const primaryQuoteSectionContent = [
    "Scope: Prune back the Mexican elder trees on the right-hand boundary.",
    "Scope: Trim the side back and trim the top back from the property on a sharp angle to define it.",
    "Scope: Complete the usual blowdown and tidy.",
    "Note: Job will take two people one and a quarter days.",
    "Note: Two trailer loads of greenwaste expected.",
    "Note: Three quarters of a trailer load of greenwaste for six days.",
  ].join("\n")

  const { handoffQuote, model } = simulateReviewToDraftHandoff(
    baseQuote,
    customerScopeItems,
    primaryQuoteSectionContent,
  )
  const { payload } = quoteReviewExportPayload(handoffQuote, shirleyRawTranscript, gardenTidyTemplate)

  assertShirleyGardenTidyXeroParity(model, payload)
})

test("Shirley live path — structured labour pricing from allowance and KB hourly rate", () => {
  const quote: ProcessedQuote = {
    ...shirleyProcessedQuote(),
    line_items: [
      {
        item_code: "10010",
        item_name: "Landscaping Labour",
        item_type: "labour",
        description: "Landscaping labour",
        quantity: "20",
        unit: "hours",
        rate: "80",
        knowledge_base_rate: "80",
        override_rate: null,
        final_rate_used: "80",
        total: "1600.00",
        account_code: "4100",
        tax_type: "OUTPUT2",
        match_confidence: "high",
        match_reason: "KB labour match",
        needs_review: false,
        warning: "",
      },
    ],
  }

  const { previewInput, payload } = quoteReviewExportPayload(quote, shirleyRawTranscript, gardenTidyTemplate)

  // Two people × 1.25 days × 8 hours × $80/hr
  assertShirleyStructuredLabourPricing(previewInput, payload, 20, 80)
  assert.equal(payload.quote.xeroLineItemsArray[0]?.AccountCode, "4100")
  assert.equal(payload.quote.xeroLineItemsArray[0]?.TaxType, "OUTPUT2")
})

// ---------------------------------------------------------------------------
// Shirley thin-extraction path — scope only in primary_quote.scope
// This simulates what the live AI extraction produces when it does NOT populate
// customer_scope, labour_allowance, or greenwaste as structured fields, but puts
// all data in primary_quote.scope and primary_quote.notes (the most common live
// extraction pattern for one-off tidy and hedge-trimming classified transcripts).
// ---------------------------------------------------------------------------

function shirleyThinProcessedQuote(): ProcessedQuote {
  return {
    ...buildGardenTidyProcessedQuote(shirleyRawTranscript),
    job_type: "one_off_tidy",
    customer_scope: [],
    labour_allowance: "",
    greenwaste: "",
    primary_quote: {
      quote_title: "One-Off Garden Tidy",
      job_type: "one_off_tidy",
      cadence: "",
      scope: [
        "Prune back Mexican elder trees along the right-hand boundary",
        "Trim hedge sides and top to a defined sharp angle",
        "Blowdown and tidy on completion",
      ],
      notes: [
        "Two people for one and a quarter days with two trailer loads of green waste",
        "Three quarters of a trailer load for hedge trimming",
      ],
    },
  }
}

test("Shirley thin-extraction — assembly still produces Scope of Work without customer_scope", () => {
  const quote = shirleyThinProcessedQuote()
  const renderedText = currentRenderedDraft(shirleyRawTranscript, quote)

  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Mexican elder"), true, renderedText)
  assert.equal(includesText(renderedText, "Trim hedge"), true, renderedText)
  assert.equal(includesText(renderedText, "Blowdown"), true, renderedText)
})

test("Shirley thin-extraction — Labour Allowance from primary_quote.notes fallback", () => {
  const quote = shirleyThinProcessedQuote()
  const renderedText = currentRenderedDraft(shirleyRawTranscript, quote)

  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "one and a quarter"), true, renderedText)
})

test("Shirley thin-extraction — Green Waste from primary_quote.notes fallback", () => {
  const quote = shirleyThinProcessedQuote()
  const renderedText = currentRenderedDraft(shirleyRawTranscript, quote)

  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
  assert.equal(includesText(renderedText, "trailer"), true, renderedText)
})

test("Shirley thin-extraction with template — all sections still appear", () => {
  const quote = shirleyThinProcessedQuote()
  const model = currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate)
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.ok(model.assembly, "Assembly must exist")
  assert.ok(
    (model.assembly?.sections.length ?? 0) > 1,
    `Must produce more than 1 section with thin extraction + template. Got: ${model.assembly?.sections.map((s) => s.title).join(", ")}`,
  )
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
  assert.equal(includesText(renderedText, "Service Includes"), true, renderedText)
})

// ---------------------------------------------------------------------------
// Shirley hedge_trimming live path — exact live scenario
//
// The AI classifier extracts job_type: "hedge_trimming" for Shirley's transcript.
// This is the specific classification that caused the "1 section only" bug.
//
// ProcessedQuote structure simulates what getHedgeTrimmingExtractorInstructions()
// produces:
// - job_type = "hedge_trimming" (not "one_off_tidy")
// - primary_quote.job_type = "hedge_trimming"
// - customer_scope = [] (hedge trimming extractor does not populate this)
// - labour_allowance = "" (not structured)
// - greenwaste = "" (not structured)
// - primary_quote.scope = actual scope items + possible bare labels ("labour note",
//   "greenwaste note") that the AI inserts for empty structured fields
// ---------------------------------------------------------------------------

function shirleyHedgeTrimmingProcessedQuote(): ProcessedQuote {
  return {
    ...buildGardenTidyProcessedQuote(shirleyRawTranscript),
    job_type: "hedge_trimming",
    customer_scope: [],
    labour_allowance: "",
    greenwaste: "",
    primary_quote: {
      quote_title: "One-Off Garden Tidy",
      job_type: "hedge_trimming",
      cadence: "",
      scope: [
        "Prune back Mexican elder trees on right boundary",
        "Trim back side and top",
        "Blowdown and tidy",
        "labour note",
        "greenwaste note",
      ],
      notes: [],
    },
  }
}

test("Shirley hedge_trimming + One-Off Garden Tidy template — assembly activates", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const model = currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate)

  assert.ok(model.assembly, "Assembly must activate for hedge_trimming + One-Off Garden Tidy template")
})

test("Shirley hedge_trimming + One-Off Garden Tidy template — more than 1 section", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const model = currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate)

  assert.ok(
    (model.assembly?.sections.length ?? 0) > 1,
    `hedge_trimming + template must produce more than 1 section. Got: ${model.assembly?.sections.map((s) => s.title).join(", ")}`,
  )
})

test("Shirley hedge_trimming + One-Off Garden Tidy template — Scope of Work contains real items not bare labels", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const renderedText = renderCustomerDraftPreviewText(currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate))

  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Mexican elder"), true, renderedText)
  assert.equal(includesText(renderedText, "Trim back side"), true, renderedText)
  assert.equal(includesText(renderedText, "Blowdown"), true, renderedText)
  assert.equal(includesText(renderedText, "labour note"), false, `Bare label "labour note" must not appear in Scope of Work: ${renderedText}`)
  assert.equal(includesText(renderedText, "greenwaste note"), false, `Bare label "greenwaste note" must not appear in Scope of Work: ${renderedText}`)
})

test("Shirley hedge_trimming + One-Off Garden Tidy template — Labour Allowance from rawTranscript fallback", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const renderedText = renderCustomerDraftPreviewText(currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate))

  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "two people"), true, renderedText)
  assert.equal(includesText(renderedText, "one and a quarter"), true, renderedText)
})

test("Shirley hedge_trimming + One-Off Garden Tidy template — Green Waste from rawTranscript fallback", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const renderedText = renderCustomerDraftPreviewText(currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate))

  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
  assert.equal(includesText(renderedText, "trailer"), true, renderedText)
})

test("Shirley hedge_trimming + One-Off Garden Tidy template — Service Includes present", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const renderedText = renderCustomerDraftPreviewText(currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate))

  assert.equal(includesText(renderedText, "Service Includes"), true, renderedText)
  assert.equal(includesText(renderedText, "Greenwaste removal"), true, renderedText)
})

test("Shirley hedge_trimming WITHOUT template — assembly activates via isGardenTidySubtype", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const model = currentDraftPreviewModel(shirleyRawTranscript, quote)

  assert.ok(
    model.assembly,
    "Assembly must activate for hedge_trimming even without a selected template (garden tidy-compatible subtype)",
  )
  assert.ok(
    (model.assembly?.sections.length ?? 0) > 1,
    `hedge_trimming without template must produce more than 1 section. Got: ${model.assembly?.sections.map((s) => s.title).join(", ")}`,
  )
})

test("Shirley hedge_trimming + selected_template_name only — assembly activates without template object", () => {
  const quote: ProcessedQuote = {
    ...shirleyHedgeTrimmingProcessedQuote(),
    selected_template_id: "one-off-garden-tidy",
    selected_template_name: "One-Off Garden Tidy",
  }
  const model = currentDraftPreviewModel(shirleyRawTranscript, quote)
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.ok(model.assembly, "Assembly must activate when selected_template_name is One-Off Garden Tidy")
  assert.ok(
    (model.assembly?.sections.length ?? 0) > 1,
    `selected_template_name-only path must produce more than 1 section. Got: ${model.assembly?.sections.map((s) => s.title).join(", ")}`,
  )
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
})

// ---------------------------------------------------------------------------
// tree_pruning — confirms that other garden-tidy-compatible subtypes also route correctly
// ---------------------------------------------------------------------------

test("tree_pruning + One-Off Garden Tidy template — assembly activates", () => {
  const quote: ProcessedQuote = {
    ...buildGardenTidyProcessedQuote(shirleyRawTranscript),
    job_type: "tree_pruning",
    customer_scope: [],
    labour_allowance: "",
    greenwaste: "",
    primary_quote: {
      quote_title: "One-Off Garden Tidy",
      job_type: "tree_pruning",
      cadence: "",
      scope: ["Prune Mexican elder trees on the right-hand boundary"],
      notes: ["Two people for one and a quarter days with two trailer loads of green waste"],
    },
  }

  const model = currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate)

  assert.ok(model.assembly, "Assembly must activate for tree_pruning + One-Off Garden Tidy template")
  assert.ok(
    (model.assembly?.sections.length ?? 0) > 1,
    `tree_pruning + template must produce more than 1 section. Got: ${model.assembly?.sections.map((s) => s.title).join(", ")}`,
  )
})

// ---------------------------------------------------------------------------
// Regression: normal one_off_tidy still works after routing changes
// ---------------------------------------------------------------------------

test("one_off_tidy without template — assembly still activates (regression)", () => {
  const quote = shirleyThinProcessedQuote()
  const model = currentDraftPreviewModel(shirleyRawTranscript, quote)

  assert.ok(model.assembly, "one_off_tidy must still activate assembly without a template")
  assert.ok(
    (model.assembly?.sections.length ?? 0) > 1,
    `one_off_tidy must still produce multiple sections. Got: ${model.assembly?.sections.map((s) => s.title).join(", ")}`,
  )
})

test("maintenance job_type does NOT activate garden tidy assembly (regression)", () => {
  const maintenanceTranscript = "Ongoing garden maintenance for Sue at 12 Main Street. Monthly visits, mowing, weeding, edges. Price $250 per month."
  const quote: ProcessedQuote = {
    ...buildGardenTidyProcessedQuote(maintenanceTranscript),
    job_type: "maintenance",
    quote_title: "Ongoing Garden Maintenance",
    primary_quote: {
      quote_title: "Ongoing Garden Maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: ["Mowing", "Weeding", "Edges"],
      notes: [],
    },
  }
  const model = currentDraftPreviewModel(maintenanceTranscript, quote)

  if (model.assembly) {
    assert.notEqual(
      model.assembly.title,
      "One-Off Garden Tidy",
      `Maintenance job_type must not produce a One-Off Garden Tidy assembly. Got sections: ${model.assembly.sections.map((s) => s.title).join(", ")}`,
    )
  }
})

test("maintenance job_type with maintenance template does NOT activate garden tidy assembly (regression)", () => {
  const maintenanceTranscript = "Ongoing garden maintenance for Sue at 12 Main Street. Monthly visits. Price $250 per month."
  const quote: ProcessedQuote = {
    ...buildGardenTidyProcessedQuote(maintenanceTranscript),
    job_type: "maintenance",
    quote_title: "Ongoing Garden Maintenance",
    primary_quote: {
      quote_title: "Ongoing Garden Maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: ["Mowing", "Weeding"],
      notes: [],
    },
  }
  const model = currentDraftPreviewModel(maintenanceTranscript, quote, maintenanceTemplate)

  if (model.assembly) {
    assert.notEqual(
      model.assembly.title,
      "One-Off Garden Tidy",
      `Maintenance template must not produce a One-Off Garden Tidy assembly. Got sections: ${model.assembly.sections.map((s) => s.title).join(", ")}`,
    )
  }
})

test("Shirley hedge_trimming transcript recommends One-Off Garden Tidy not Decking", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const facts = quoteFactsFromProcessedQuote(quote)
  const templates = [plantingTemplate, maintenanceTemplate, deckingTemplate, retainingTemplate, gardenTidyTemplate]
  const recommendation = recommendTemplateForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.primary_quote.job_type,
  })
  const scores = scoreTemplatesForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.primary_quote.job_type,
  })

  assert.equal(recommendation?.templateName, "One-Off Garden Tidy")
  assert.notEqual(recommendation?.template.id, deckingTemplate.id)
  const deckingScore = scores.find((score) => score.template.id === deckingTemplate.id)?.score ?? 0
  const gardenTidyScore = scores.find((score) => score.template.id === gardenTidyTemplate.id)?.score ?? 0
  assert.ok(gardenTidyScore > deckingScore)
})

test("Shirley live handoff — customer_scope overlay only with empty section state reaches assembly", () => {
  const baseQuote = shirleyHedgeTrimmingProcessedQuote()
  const customerScopeItems = [
    "Prune back the Mexican elder trees on the right-hand boundary.",
    "Trim the side back and trim the top back from the property on a sharp angle to define it.",
    "Complete the usual blowdown and tidy.",
  ]
  const primaryQuoteSectionContent = [
    "Scope: Prune back the Mexican elder trees on the right-hand boundary.",
    "Scope: Trim the side back and trim the top back from the property on a sharp angle to define it.",
    "Scope: Complete the usual blowdown and tidy.",
    "Note: Job will take two people one and a quarter days.",
    "Note: Two trailer loads of greenwaste expected.",
    "Note: Three quarters of a trailer load of greenwaste for six days.",
  ].join("\n")

  const sections = processedQuoteToEditableSections(baseQuote).map((section) => {
    if (section.key === "primary_quote") return { ...section, content: primaryQuoteSectionContent }
    if (section.key === "customer_scope") return { ...section, content: "" }
    return section
  })
  const editedQuoteForReview = editableSectionsToProcessedQuote(sections, baseQuote)
  const handoffQuote = buildQuoteHandoffForDraftPreview({
    sections,
    baseQuote: editedQuoteForReview,
    customerScopeItems,
    dirtyKeys: new Set(),
  })
  const model = currentDraftPreviewModel(shirleyRawTranscript, handoffQuote, gardenTidyTemplate)
  const rendered = renderCustomerDraftPreviewText(model)

  assert.ok(handoffQuote.customer_scope.length >= 3)
  assert.ok(handoffQuote.primary_quote.notes.length >= 2)
  assert.ok(model.assemblyInputDebug)
  assert.ok(model.assemblyInputDebug!.primary_quote_scope.length > 0)
  assert.ok(model.assemblyInputDebug!.primary_quote_notes.length > 0)
  assert.ok((model.assembly?.sections.length ?? 0) > 1)
  assert.match(rendered, /Labour - main scope/i)
  assert.match(rendered, /Labour - main scope/i)
  assert.match(rendered, /Green Waste/i)
  assert.match(rendered, /Service Includes/i)
})

test("Shirley hedge_trimming editable review round-trip preserves scope for manual One-Off Garden Tidy preview", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const sections = processedQuoteToEditableSections(quote)
  const editedQuote = editableSectionsToProcessedQuote(sections, quote)
  const model = currentDraftPreviewModel(shirleyRawTranscript, editedQuote, gardenTidyTemplate)
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.ok(editedQuote.primary_quote.scope.some((item) => /mexican elder/i.test(item)))
  assert.ok(model.assemblyInputDebug)
  assert.ok(model.assemblyInputDebug!.primary_quote_scope.length > 0)
  assert.ok((model.assembly?.sections.length ?? 0) > 1)
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
  assert.equal(includesText(renderedText, "Service Includes"), true, renderedText)
})

test("stale AI Decking selection is ignored for Shirley hedge_trimming quote", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const facts = quoteFactsFromProcessedQuote(quote)
  const selection = resolveTemplateSelection({
    templates: [deckingTemplate, gardenTidyTemplate],
    selectedTemplateName: "Decking",
    facts,
    jobType: quote.job_type,
    trade: quote.job_type,
  })

  assert.deepEqual(selection, { templateId: "", source: "stale_ai" })
})

// ---------------------------------------------------------------------------
// Monash hedge trimming — real-world one-off garden tidy acceptance
// ---------------------------------------------------------------------------

const monashRawTranscript =
  "Okay, just went and saw Monash at 19A Moore Avenue, Te Atatū Peninsula. He wants some hedge trimming done as a one-off job. So there's a front Pittosporum. We need to reduce the top by 50 centimetres and push the sides back by approximately 30 centimetres. And that job is probably four hours with one person. And then there's a large side hedge, Griselinia. We need to reduce the tops by 1.5 metres, which is probably one person one day. And then we also need the other person working to do the side and the end and also the neighbour's face. So for the labour all up, it's two people for a full day and the green waste is two trailer loads. And we need an internal note, which is to make sure we bring the pole chainsaws, the silkies, and the loppers, etc. with us for the job."

function monashHedgeTrimmingProcessedQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Monash",
    site_address: "19A Moore Avenue, Te Atatū Peninsula",
    quote_title: "One-Off Garden Tidy",
    job_type: "hedge_trimming",
    selected_template_name: "One-Off Garden Tidy",
    internal_notes: [
      "Internal note: make sure we bring the pole chainsaws, the silkies, and the loppers for the job.",
      "Planting Calculator\nselected plant option: Pittosporum Green Pillar 2.5L | unit price: $24.00 | plant count: Not captured\nselected plant option: Griselinia Broadway 3L | unit price: $88.00 | plant count: Not captured",
    ],
    confidence_warnings: [],
    customer_scope: [
      "Reduce front Pittosporum top by 50cm",
      "Push Pittosporum sides back by approximately 30cm",
      "Reduce Griselinia side hedge tops by 1.5m",
      "Trim side, end, and neighbour-facing side",
      "Bring pole chainsaws, silkies, and loppers for the job",
      "[]",
      "Reduce front Pittosporum top by 50cm",
      "$24",
      "$88",
    ],
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "One-Off Garden Tidy",
      job_type: "hedge_trimming",
      scope: [
        "Reduce front Pittosporum top by 50cm",
        "Push Pittosporum sides back by approximately 30cm",
        "Reduce Griselinia side hedge tops by 1.5m",
        "Trim side, end, and neighbour-facing side",
      ],
      notes: [],
    },
  }
}

test("Monash hedge trimming — planting calculator intent is suppressed", () => {
  assert.equal(hasPlantingCalculatorIntent(monashRawTranscript), false)
})

test("Monash hedge trimming — client name extracts as Monash", () => {
  assert.equal(extractClientNameFromTranscript(monashRawTranscript), "Monash")
})

test("Monash hedge trimming — live path is One-Off Garden Tidy without fake prices or planting warnings", () => {
  const quote = monashHedgeTrimmingProcessedQuote()
  const model = currentDraftPreviewModel(monashRawTranscript, quote, gardenTidyTemplate)
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.equal(model.rendererPath, "assembly")
  assert.ok(model.assembly, renderedText)
  assert.equal(model.assembly?.title, "One-Off Garden Tidy")
  assert.equal(includesText(renderedText, "Missing planting length or plant quantity"), false, renderedText)
  assert.equal(includesText(renderedText, "Planting Options"), false, renderedText)
  assert.equal(includesText(renderedText, "$24"), false, renderedText)
  assert.equal(includesText(renderedText, "$88"), false, renderedText)
  assert.equal(includesText(renderedText, "Price"), false, renderedText)
  assert.equal(includesText(renderedText, "pole chainsaw"), false, renderedText)
  assert.equal(includesText(renderedText, "silkies"), false, renderedText)
  assert.equal(includesText(renderedText, "loppers"), false, renderedText)
  assert.equal(includesText(renderedText, "[]"), false, renderedText)
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "Pittosporum"), true, renderedText)
  assert.equal(includesText(renderedText, "Griselinia"), true, renderedText)
  assert.equal(includesText(renderedText, "Labour - main scope"), true, renderedText)
  assert.equal(includesText(renderedText, "two people"), true, renderedText)
  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
  assert.equal(includesText(renderedText, "two trailer"), true, renderedText)

  const scopeItems = tidyScopeWork(model)
  assert.equal(scopeItems.filter((item) => /Pittosporum top by 50cm/i.test(item)).length, 1)
  assert.equal(scopeItems.some((item) => /chainsaw|silkies|loppers/i.test(item)), false)
  assert.equal(scopeItems.some((item) => item === "[]"), false)

  assert.equal(quote.internal_notes.some((note) => /pole chainsaw|silkies|loppers/i.test(note)), true)
})
