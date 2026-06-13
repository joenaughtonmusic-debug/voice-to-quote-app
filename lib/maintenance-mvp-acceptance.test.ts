import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { buildPricingReviewNotices, extractPricing } from "./core/pricing-extraction"
import type { QuoteFact, QuoteFactCategory } from "./core/quote-facts"
import { quoteFactsFromProcessedQuote } from "./core/quote-facts"
import { buildCustomerPreviewQuoteInput } from "./customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "./customer-preview-render"
import { buildCustomerQuotePreview, type CustomerPreviewLineItem, type CustomerPreviewQuote } from "./customer-quote-preview"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import type { QuoteTemplateLibraryItem, QuoteTemplateSectionDraft } from "./template-import-learning"
import { renderTemplatePreviewSections } from "./template-preview-sandbox"
import { resolveInitialTemplateSelection } from "./template-selection"
import {
  customerVisibleTemplateRecommendation,
  recommendTemplateForQuote,
  scoreTemplatesForQuote,
} from "./template-recommendation"

const ACCEPTANCE_DOC = "docs/MAINTENANCE_MVP_ACCEPTANCE.md"

function acceptanceTranscript() {
  const doc = readFileSync(ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Acceptance transcript must remain documented in docs/MAINTENANCE_MVP_ACCEPTANCE.md")
  return match[1].trim()
}

function fact(category: QuoteFactCategory, description: string): QuoteFact {
  return {
    id: `${category}-${description}`,
    category,
    description,
    sourceField: "maintenance-mvp-acceptance",
    confidence: "high",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
  }
}

function lineItem(overrides: Partial<CustomerPreviewLineItem>): CustomerPreviewLineItem {
  return {
    item_code: "",
    item_name: "",
    item_type: "",
    description: "",
    quantity: null,
    unit: "",
    rate: null,
    knowledge_base_rate: null,
    override_rate: null,
    final_rate_used: null,
    total: null,
    match_confidence: "",
    match_reason: "",
    needs_review: false,
    warning: "",
    ...overrides,
  }
}

const maintenanceTemplate: QuoteTemplateLibraryItem = {
  id: "ongoing-maintenance",
  template_name: "Ongoing Garden Maintenance Template",
  category: "maintenance",
  trade: "maintenance",
  job_type: "maintenance",
  document_type: "quote_template",
  common_line_items: [
    "Ongoing Garden Maintenance",
    "Greenwaste removal",
    "Spraying",
    "General weeding",
    "Leaf litter removal",
  ],
  template_content: {
    reusable_customer_wording: ["Ongoing garden maintenance visit with tidy up and greenwaste removal."],
  },
  status: "active",
}

const plantingTemplate: QuoteTemplateLibraryItem = {
  id: "planting",
  template_name: "Planting Template",
  category: "planting",
  trade: "planting",
  job_type: "planting",
  document_type: "quote_template",
  common_line_items: ["Plant supply", "Ficus Tuffi 25L", "Garden mix", "Planting labour"],
  template_content: {
    reusable_customer_wording: ["Supply and install selected plants as agreed."],
  },
  status: "active",
}

function detectedJobType(transcript: string) {
  return /\b(monthly|weekly|fortnightly|ongoing|regular)?\s*(garden\s+)?maintenance\b/i.test(transcript)
    ? "maintenance"
    : "unknown"
}

function detectedCadence(transcript: string) {
  if (/\bmonthly\b/i.test(transcript)) return "monthly"
  if (/\bweekly\b/i.test(transcript)) return "weekly"
  if (/\bfortnightly\b/i.test(transcript)) return "fortnightly"
  return ""
}

function labourHoursPerVisit(transcript: string) {
  const match = transcript.match(/\ballow\s+(\d+(?:\.\d+)?)\s+hours?\s+labou?r\s+per\s+visit\b/i)
  return match?.[1] ? Number(match[1]) : null
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

function maintenanceMvpProcessedQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "Monthly Maintenance",
    job_type: "maintenance",
    selected_template_name: "Planting Template",
    template_match_confidence: "high",
    primary_quote: {
      quote_title: "Monthly Maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: ["Weeding", "Pruning", "Removal of self-seeded plants", "Herbicide spraying", "Garden maintenance"],
      notes: ["Greenwaste bin can be filled up to approximately two-thirds full each visit."],
    },
    customer_scope: ["Weeding", "Pruning", "Removal of self-seeded plants", "Herbicide spraying", "Garden maintenance"],
    labour_allowance: "Allow 4.5 hours labour per visit.",
    line_items: [
      {
        item_code: "",
        item_name: "Garden Labour",
        item_type: "labour",
        description: "Garden maintenance labour for weeding, pruning and herbicide spraying.",
        quantity: "4.5",
        unit: "hours",
        rate: "80",
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: "80",
        total: "360.00",
        match_confidence: "high",
        match_reason: "Matched labour allowance.",
        needs_review: false,
        warning: "",
      },
    ],
  }
}

const maintenanceTemplateSections: QuoteTemplateSectionDraft[] = [
  {
    id: "maintenance-job-scope",
    template_id: maintenanceTemplate.id,
    display_order: 1,
    section_name: "Job Scope",
    section_category: "job_scope",
    raw_text: "{{job_scope}}",
    template_text: "{{job_scope}}",
    placeholders: ["{{job_scope}}"],
    customer_facing: true,
    exportable: false,
  },
]

test("maintenance MVP transcript meets deterministic acceptance criteria", () => {
  const transcript = acceptanceTranscript()
  const address = extractAddressDetails(transcript)
  const pricing = extractPricing(transcript)
  const fixedPrice = pricing.pricing.find((fact) => fact.type === "fixed_price")
  const labourTotalLineItems = [
    lineItem({
      item_name: "Garden Labour",
      item_type: "labour",
      description: "Garden maintenance labour for weeding, pruning and herbicide spraying.",
      quantity: "4.5",
      unit: "hours",
      rate: "80",
      final_rate_used: "80",
      total: "360.00",
    }),
  ]
  const mismatchNotices = buildPricingReviewNotices({
    pricing: pricing.pricing,
    lineItems: labourTotalLineItems,
  })
  const facts = [
    fact("job_scope", "Monthly garden maintenance visit."),
    fact("labour", "Allow 4.5 hours labour per visit."),
    fact("waste", "Greenwaste removal included."),
    fact("materials", "Herbicide spraying and standard maintenance materials included."),
    fact("job_scope", "Main focus is weeding, pruning and removal of self-seeded plants."),
  ]
  const recommendation = recommendTemplateForQuote({
    facts,
    templates: [plantingTemplate, maintenanceTemplate],
    sectionsByTemplateId: {
      [maintenanceTemplate.id]: [],
      [plantingTemplate.id]: [],
    },
    jobType: "maintenance",
    trade: "maintenance",
  })
  const plantingScores = scoreTemplatesForQuote({
    facts,
    templates: [plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "maintenance",
  })
  const customerSuggestion = customerVisibleTemplateRecommendation({
    recommendation: plantingScores[0]?.confidence === "high" ? recommendation : null,
    selectedTemplateId: maintenanceTemplate.id,
  })
  const previewQuote = {
    client_name: "Stella",
    site_address: "6 Tarawera Terrace, St Heliers",
    quote_title: "Monthly Maintenance",
    job_type: "maintenance",
    selected_template: {
      template_content: maintenanceTemplate.template_content,
      default_scope: "Ongoing garden maintenance visit with tidy up and greenwaste removal.",
    },
    line_items: labourTotalLineItems,
    primary_quote: {
      quote_title: "Monthly Maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: ["Weeding", "Pruning", "Removal of self-seeded plants"],
      notes: ["Greenwaste bin can be filled up to approximately two-thirds full each visit."],
    },
    customer_scope: [
      "Main focus of visits will be weeding, pruning, and removal of self-seeded plants.",
      "Each visit may include weeding, pruning, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required.",
    ],
  } as CustomerPreviewQuote & {
    client_name: string
    site_address: string
    quote_title: string
    job_type: string
  }
  const preview = buildCustomerQuotePreview(previewQuote)
  const transcriptLower = transcript.toLowerCase()

  assert.equal(extractClientNameFromTranscript(transcript), "Stella")
  assert.equal(address.cleaned_address, "6 Tarawera Terrace, St Heliers")
  assert.equal(address.confidence, "high")
  assert.equal(address.needs_address_confirmation, false)
  assert.deepEqual(address.address_warnings, [])

  assert.equal(detectedJobType(transcript), "maintenance")
  assert.equal(detectedCadence(transcript), "monthly")
  assert.equal(labourHoursPerVisit(transcript), 4.5)

  assert.equal(fixedPrice?.amount, 405)
  assert.equal(fixedPrice?.cadence, "per_visit")
  assert.deepEqual(fixedPrice?.inclusions, [
    "greenwaste removal",
    "herbicide spraying",
    "standard maintenance materials",
  ])
  assert.equal(fixedPrice?.confidence, "high")

  assert.equal(includesText(transcriptLower, "weeding"), true)
  assert.equal(includesText(transcriptLower, "pruning"), true)
  assert.equal(includesText(transcriptLower, "removal of self-seeded plants"), true)
  assert.equal(includesText(transcriptLower, "greenwaste bin on site"), true)
  assert.equal(includesText(transcriptLower, "two-thirds full"), true)

  assert.equal(recommendation?.template.id, maintenanceTemplate.id)
  assert.equal(recommendation?.templateName, "Ongoing Garden Maintenance Template")
  assert.notEqual(recommendation?.template.id, plantingTemplate.id)
  assert.ok((plantingScores[0]?.score ?? 0) < 0)
  assert.equal(customerSuggestion, null)

  assert.equal(previewQuote.client_name, "Stella")
  assert.equal(previewQuote.site_address, "6 Tarawera Terrace, St Heliers")
  assert.equal(previewQuote.quote_title, "Monthly Maintenance")
  assert.equal(preview.scopeItems.some((item) => includesText(item, "weeding")), true)
  assert.equal(preview.scopeItems.some((item) => includesText(item, "pruning")), true)
  assert.equal(preview.scopeItems.some((item) => includesText(item, "removal of self-seeded plants")), true)
  assert.equal(preview.scopeItems.some((item) => includesText(item, "general garden maintenance")), true)
  assert.equal(preview.labourLine?.label, "Garden maintenance labour")
  assert.notEqual(preview.labourLine?.label, "Planting labour")

  assert.equal(mismatchNotices.length, 1)
  assert.equal(mismatchNotices[0].id, "pricing.spoken-price-mismatch")
  assert.match(mismatchNotices[0].message, /Spoken price is \$405 per visit, but matched labour total is \$360/)
})

test("maintenance MVP uses the real customer preview/template path", () => {
  const transcript = acceptanceTranscript()
  const processedQuote = maintenanceMvpProcessedQuote(transcript)
  const quoteFacts = quoteFactsFromProcessedQuote(processedQuote)
  const pricing = extractPricing(transcript)
  const recommendation = recommendTemplateForQuote({
    facts: quoteFacts,
    templates: [plantingTemplate, maintenanceTemplate],
    sectionsByTemplateId: {
      [maintenanceTemplate.id]: [],
      [plantingTemplate.id]: [],
    },
    jobType: processedQuote.primary_quote.job_type || processedQuote.job_type,
    trade: processedQuote.job_type,
  })
  const selectedTemplateId = resolveInitialTemplateSelection({
    templates: [plantingTemplate, maintenanceTemplate],
    selectedTemplateId: processedQuote.selected_template_id,
    selectedTemplateName: processedQuote.selected_template_name,
    recommendation,
  })
  const selectedTemplate = [plantingTemplate, maintenanceTemplate].find((template) => template.id === selectedTemplateId) ?? null
  const displayedCustomerSuggestion = customerVisibleTemplateRecommendation({
    recommendation,
    selectedTemplateId,
  })
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote,
    rawTranscript: transcript,
    selectedTemplate,
    pricingFacts: pricing.pricing,
  })
  const preview = buildCustomerQuotePreview(previewInput)
  const renderedTemplateSections = renderTemplatePreviewSections(
    maintenanceTemplateSections,
    previewInput as ProcessedQuote,
    preview,
    selectedTemplate,
  )
  const standardPreviewModel = buildCustomerDraftPreviewModel({
    processedQuote,
    customerPreview: preview,
    mode: "standard",
    templateSections: renderedTemplateSections,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })
  const templatePreviewModel = buildCustomerDraftPreviewModel({
    processedQuote,
    customerPreview: preview,
    mode: "template",
    templateSections: renderedTemplateSections,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })
  const standardRenderedText = renderCustomerDraftPreviewText(standardPreviewModel)
  const templateRenderedText = renderCustomerDraftPreviewText(templatePreviewModel)
  const mismatchNotices = buildPricingReviewNotices({
    pricing: pricing.pricing,
    lineItems: processedQuote.line_items,
  })

  assert.equal(recommendation?.template.id, maintenanceTemplate.id)
  assert.equal(selectedTemplate?.id, maintenanceTemplate.id)
  assert.notEqual(selectedTemplate?.id, plantingTemplate.id)
  assert.equal(displayedCustomerSuggestion, null)
  assert.deepEqual(previewInput.selected_template?.template_content, maintenanceTemplate.template_content)
  assert.equal(preview.pricingFacts.length, 1)
  assert.ok(standardPreviewModel.assembly, "standard draft preview should use customer quote assembly")
  assert.ok(templatePreviewModel.assembly, "template draft preview should still use customer quote assembly")

  for (const model of [standardPreviewModel, templatePreviewModel]) {
    const sectionTitles = model.assembly?.sections.map((section) => section.title) ?? []
    assert.deepEqual(sectionTitles, ["Main Focus", "Service Includes", "Ongoing Maintenance", "Price", "Site Notes"])
    assert.deepEqual(model.assembly?.sections.find((section) => section.title === "Main Focus")?.items, [
      "Weeding",
      "Pruning",
      "Removal of self-seeded plants",
    ])
  }

  for (const renderedText of [standardRenderedText, templateRenderedText]) {
    assert.equal(includesText(renderedText, "Main Focus"), true, renderedText)
    assert.equal(includesText(renderedText, "Service Includes"), true, renderedText)
    assert.equal(includesText(renderedText, "Ongoing Maintenance"), true, renderedText)
    assert.equal(includesText(renderedText, "Price"), true, renderedText)
    assert.equal(includesText(renderedText, "Stella"), true, renderedText)
    assert.equal(includesText(renderedText, "6 Tarawera Terrace, St Heliers"), true, renderedText)
    assert.equal(includesText(renderedText, "Monthly Maintenance"), true, renderedText)
    assert.equal(includesText(renderedText, "$405"), true, renderedText)
    assert.equal(includesText(renderedText, "per visit"), true, renderedText)
    assert.equal(includesText(renderedText, "greenwaste removal"), true, renderedText)
    assert.equal(includesText(renderedText, "herbicide spraying"), true, renderedText)
    assert.equal(includesText(renderedText, "standard maintenance materials"), true, renderedText)
    assert.equal(includesText(renderedText, "Weeding"), true, renderedText)
    assert.equal(includesText(renderedText, "Pruning"), true, renderedText)
    assert.equal(includesText(renderedText, "Removal of self-seeded plants"), true, renderedText)
    assert.equal(includesText(renderedText, "general garden maintenance"), true, renderedText)
    assert.equal(includesText(renderedText, "Ongoing garden maintenance"), true, renderedText)
    assert.equal(includesText(renderedText, "Planting labour"), false, renderedText)
    assert.equal(includesText(renderedText, "Planting Template"), false, renderedText)
    assert.equal(includesText(renderedText, "Supply and install selected plants"), false, renderedText)
  }

  assert.equal(preview.pricingFacts[0]?.amountText, "$405")
  assert.equal(preview.pricingFacts[0]?.cadenceText, "per visit")
  assert.deepEqual(preview.pricingFacts[0]?.inclusions, [
    "greenwaste removal",
    "herbicide spraying",
    "standard maintenance materials",
  ])
  assert.equal(mismatchNotices[0]?.id, "pricing.spoken-price-mismatch")
  assert.match(mismatchNotices[0]?.message ?? "", /Spoken price is \$405 per visit, but matched labour total is \$360/)
})

test("maintenance draft preview handoff uses edited quote instead of stale parent quote", () => {
  const transcript = acceptanceTranscript()
  const editedQuoteForReview = maintenanceMvpProcessedQuote(transcript)
  const staleParentQuote = {
    ...editedQuoteForReview,
    quote_title: "Planting",
    job_type: "planting",
    selected_template_name: "Planting Template",
    primary_quote: {
      ...editedQuoteForReview.primary_quote,
      quote_title: "Planting",
      job_type: "planting",
    },
  } as ProcessedQuote
  const pricing = extractPricing(transcript)

  const stalePreviewInput = buildCustomerPreviewQuoteInput({
    processedQuote: staleParentQuote,
    rawTranscript: transcript,
    selectedTemplate: plantingTemplate,
    pricingFacts: pricing.pricing,
  })
  const stalePreview = buildCustomerQuotePreview(stalePreviewInput)
  const staleModel = buildCustomerDraftPreviewModel({
    processedQuote: staleParentQuote,
    customerPreview: stalePreview,
    mode: "standard",
    rawTranscript: transcript,
    selectedTemplate: stalePreviewInput.selected_template,
  })
  assert.equal(staleModel.assembly, null, "stale non-maintenance parent quote would force the legacy draft branch")

  const previewDraftOptions = {
    processedQuote: editedQuoteForReview,
    selectedTemplate: maintenanceTemplate,
    pricingFacts: pricing.pricing,
  }
  const editedPreviewInput = buildCustomerPreviewQuoteInput({
    processedQuote: previewDraftOptions.processedQuote,
    rawTranscript: transcript,
    selectedTemplate: previewDraftOptions.selectedTemplate,
    pricingFacts: previewDraftOptions.pricingFacts,
  })
  const editedPreview = buildCustomerQuotePreview(editedPreviewInput)
  const editedModel = buildCustomerDraftPreviewModel({
    processedQuote: previewDraftOptions.processedQuote,
    customerPreview: editedPreview,
    mode: "standard",
    rawTranscript: transcript,
    selectedTemplate: editedPreviewInput.selected_template,
  })
  const renderedText = renderCustomerDraftPreviewText(editedModel)

  assert.equal(previewDraftOptions.processedQuote.job_type, "maintenance")
  assert.equal(previewDraftOptions.processedQuote.primary_quote.job_type, "maintenance")
  assert.ok(editedModel.assembly, "edited maintenance quote should use customer quote assembly")
  assert.equal(includesText(renderedText, "Main Focus"), true, renderedText)
  assert.equal(includesText(renderedText, "Service Includes"), true, renderedText)
  assert.equal(includesText(renderedText, "$405 per visit"), true, renderedText)
  assert.equal(includesText(renderedText, "Planting labour"), false, renderedText)
})
