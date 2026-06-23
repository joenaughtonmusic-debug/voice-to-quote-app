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
  return { handoffQuote, model, customerPreview }
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
  assert.match(rendered, /Scope of Work/i)
  assert.match(rendered, /Labour Allowance/i)
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
  const scope = assemblySectionItems("Scope of Work", model)
  const labour = assemblySectionItems("Labour Allowance", model)
  const greenwaste = assemblySectionItems("Green Waste", model)
  const includes = assemblySectionItems("Service Includes", model)

  assert.equal(scope.length, 3, `Scope of Work should contain work items only. Got: ${scope.join(" | ")}`)
  assert.ok(scope.some((item) => /mexican elder/i.test(item)))
  assert.ok(scope.some((item) => /trim/i.test(item)))
  assert.ok(scope.some((item) => /blowdown|tidy/i.test(item)))
  assert.ok(!scope.some((item) => /two people|one and a quarter days/i.test(item)), `Labour must not appear in Scope of Work: ${scope.join(" | ")}`)
  assert.ok(!scope.some((item) => /trailer load/i.test(item)), `Greenwaste quantities must not appear in Scope of Work: ${scope.join(" | ")}`)
  assert.ok(
    !scope.some((item) => /including greenwaste removal/i.test(item)),
    `Service include boilerplate must not appear in Scope of Work: ${scope.join(" | ")}`,
  )

  assert.ok(labour.length > 0)
  assert.ok(labour.some((item) => /two people/i.test(item)))
  assert.ok(greenwaste.length > 0)
  assert.ok(greenwaste.some((item) => /trailer/i.test(item)))
  assert.ok(includes.some((item) => /greenwaste removal/i.test(item)))
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
  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
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

  // Labour allowance from the MVP acceptance transcript ("1 day, 2 staff") now
  // appears as a Labour Allowance section in the rendered draft.
  const expected = [
    "Prepared for",
    "Sarah",
    "44 Amy Street",
    "Quote",
    "One-Off Garden Tidy",
    "Scope of Work",
    "Remove overgrowth around boundary",
    "Cut back shrubs",
    "Weed garden beds",
    "Remove self-seeded plants",
    "Labour Allowance",
    "1 day, 2 staff",
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
  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
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
  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
  assert.equal(includesText(renderedText, "Mexican elder"), true, renderedText)
  assert.equal(includesText(renderedText, "Trim hedge"), true, renderedText)
  assert.equal(includesText(renderedText, "Blowdown"), true, renderedText)
})

test("Shirley one-off tidy — live path renders Labour Allowance section", () => {
  const quote = shirleyProcessedQuote()
  const renderedText = currentRenderedDraft(shirleyRawTranscript, quote)

  assert.equal(includesText(renderedText, "Labour Allowance"), true, renderedText)
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

  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
  assert.equal(includesText(renderedText, "Mexican elder"), true, renderedText)
  assert.equal(includesText(renderedText, "Trim hedge"), true, renderedText)
  assert.equal(includesText(renderedText, "Blowdown"), true, renderedText)
})

test("Shirley Use-Template-As-Quote — Labour Allowance and Green Waste appear in template path", () => {
  const quote = shirleyProcessedQuote()
  const renderedText = renderCustomerDraftPreviewText(currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate))

  assert.equal(includesText(renderedText, "Labour Allowance"), true, renderedText)
  assert.equal(includesText(renderedText, "two people"), true, renderedText)
  assert.equal(includesText(renderedText, "Green Waste"), true, renderedText)
  assert.equal(includesText(renderedText, "trailer"), true, renderedText)
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

  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
  assert.equal(includesText(renderedText, "Mexican elder"), true, renderedText)
  assert.equal(includesText(renderedText, "Trim hedge"), true, renderedText)
  assert.equal(includesText(renderedText, "Blowdown"), true, renderedText)
})

test("Shirley thin-extraction — Labour Allowance from primary_quote.notes fallback", () => {
  const quote = shirleyThinProcessedQuote()
  const renderedText = currentRenderedDraft(shirleyRawTranscript, quote)

  assert.equal(includesText(renderedText, "Labour Allowance"), true, renderedText)
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
  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
  assert.equal(includesText(renderedText, "Labour Allowance"), true, renderedText)
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

  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
  assert.equal(includesText(renderedText, "Mexican elder"), true, renderedText)
  assert.equal(includesText(renderedText, "Trim back side"), true, renderedText)
  assert.equal(includesText(renderedText, "Blowdown"), true, renderedText)
  assert.equal(includesText(renderedText, "labour note"), false, `Bare label "labour note" must not appear in Scope of Work: ${renderedText}`)
  assert.equal(includesText(renderedText, "greenwaste note"), false, `Bare label "greenwaste note" must not appear in Scope of Work: ${renderedText}`)
})

test("Shirley hedge_trimming + One-Off Garden Tidy template — Labour Allowance from rawTranscript fallback", () => {
  const quote = shirleyHedgeTrimmingProcessedQuote()
  const renderedText = renderCustomerDraftPreviewText(currentDraftPreviewModel(shirleyRawTranscript, quote, gardenTidyTemplate))

  assert.equal(includesText(renderedText, "Labour Allowance"), true, renderedText)
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
  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
  assert.equal(includesText(renderedText, "Labour Allowance"), true, renderedText)
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
  assert.match(rendered, /Scope of Work/i)
  assert.match(rendered, /Labour Allowance/i)
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
  assert.equal(includesText(renderedText, "Scope of Work"), true, renderedText)
  assert.equal(includesText(renderedText, "Labour Allowance"), true, renderedText)
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
