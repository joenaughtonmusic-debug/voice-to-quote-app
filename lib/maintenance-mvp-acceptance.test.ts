import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { assembleMaintenanceCustomerQuote } from "./customer-quote-assembly/maintenance"
import { extractMaintenancePricingFacts } from "./export/maintenance-pricing-facts"
import { resolveMaintenanceVisitPrice } from "./export/maintenance-visit-price"
import { buildPricingReviewNotices, extractPricing } from "./core/pricing-extraction"
import type { QuoteFact, QuoteFactCategory } from "./core/quote-facts"
import { quoteFactsFromProcessedQuote } from "./core/quote-facts"
import { isTeamSiteNote } from "./customer-quote-assembly/internal-scope-signals"
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

test("Sarah maintenance rendered draft uses assembled customer-facing content", () => {
  const sarahTranscript = `Monthly maintenance for Sarah at 28 Rata Street, Mount Eden.
Main focus will be hedge trimming, weeding, and keeping pathways clear.
Price per visit $365 including green waste removal and standard maintenance materials.
Each visit may include hedge trimming, pruning, weeding, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required.
A green waste bin is available on site.
Please keep the side gate shut as dog on the property.`
  const address = extractAddressDetails(sarahTranscript)
  const processedQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(sarahTranscript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "maintenance",
    job_type: "maintenance",
    primary_quote: {
      quote_title: "maintenance",
      job_type: "maintenance",
      cadence: "",
      scope: [
        "Hedge trimming",
        "Weeding",
        "Scope: General garden maintenance as required",
      ],
      notes: [
        "Title: maintenance",
        "Job type: maintenance",
        "Cadence: monthly",
        "Scope: General garden maintenance as required",
        "Scope: Each visit may include hedge trimming, pruning, weeding, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required",
        "Note: A green waste bin is available on site",
        "Note: Please keep the side gate shut as dog on the property",
      ],
    },
    customer_scope: [
      "Hedge trimming",
      "Weeding",
      "Scope: General garden maintenance as required",
    ],
  }
  const pricing = extractPricing(sarahTranscript)
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote,
    rawTranscript: sarahTranscript,
    pricingFacts: pricing.pricing,
  })
  const preview = buildCustomerQuotePreview(previewInput)
  const model = buildCustomerDraftPreviewModel({
    processedQuote,
    customerPreview: preview,
    mode: "standard",
    rawTranscript: sarahTranscript,
    selectedTemplate: previewInput.selected_template,
  })
  const renderedText = renderCustomerDraftPreviewText(model)

  assert.ok(model.assembly, "Sarah maintenance draft should use customer quote assembly")
  assert.equal(model.quoteTitle, "Monthly Maintenance")
  assert.equal(includesText(renderedText, "Monthly Maintenance"), true, renderedText)
  assert.equal(/Quote\s+Monthly Maintenance\s+maintenance\b/i.test(renderedText), false, renderedText)
  assert.equal(includesText(renderedText, "Hedge trimming"), true, renderedText)
  assert.equal(includesText(renderedText, "Weeding"), true, renderedText)
  assert.equal(includesText(renderedText, "Keeping pathways clear"), true, renderedText)
  assert.equal(
    includesText(
      renderedText,
      "Each visit may include hedge trimming, pruning, weeding, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required",
    ),
    true,
    renderedText,
  )
  assert.equal(includesText(renderedText, "$365 per visit"), true, renderedText)
  assert.equal(includesText(renderedText, "Greenwaste removal"), true, renderedText)
  assert.equal(includesText(renderedText, "Standard maintenance materials"), true, renderedText)
  assert.equal(includesText(renderedText, "A green waste bin is available on site"), true, renderedText)
  // B3: the team/access advisory (gate shut / dog) is NOT customer-facing — it stays internal.
  assert.equal(includesText(renderedText, "Please keep the side gate shut as dog on the property"), false, renderedText)
  assert.equal(/\bdog\b|side gate/i.test(renderedText), false, renderedText)
  assert.equal((renderedText.match(/^General garden maintenance(?: as required)?$/gim) ?? []).length, 0, renderedText)
  assert.equal((renderedText.match(/green waste bin available on site|green waste bin is available on site/gi) ?? []).length, 1, renderedText)
  assert.equal(/Title:|Job type:|Cadence:|Scope:|Note:/i.test(renderedText), false, renderedText)
  assert.equal(includesText(renderedText, "Planting labour"), false, renderedText)
  assert.equal(/\$320(?:\.00)?/.test(renderedText), false, renderedText)
})

// B3 — team/site notes (dog, gates, access, hazards, parking, steep driveway) must never
// reach the customer quote; they stay in the internal notes. Deterministic fixtures.

function b3MaintenanceModel(quote: ProcessedQuote) {
  const previewInput = buildCustomerPreviewQuoteInput({ processedQuote: quote, rawTranscript: "" })
  const preview = buildCustomerQuotePreview(previewInput)
  return buildCustomerDraftPreviewModel({ processedQuote: quote, customerPreview: preview, rawTranscript: "" })
}

test("B3 Fiona maintenance — dog/gates team note stays out of the customer quote, retained internally", () => {
  const fiona: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Fiona",
    site_address: "4 Wiriki Road, Mount Eden",
    quote_title: "maintenance",
    job_type: "maintenance",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "maintenance",
      job_type: "maintenance",
      cadence: "two-monthly",
      scope: ["Garden maintenance", "Weeding", "Pruning"],
      notes: ["Note: Need to ensure gates are closed when visiting due to a dog on the property"],
    },
  }

  const model = b3MaintenanceModel(fiona)
  const rendered = renderCustomerDraftPreviewText(model)

  assert.equal(/\bdog\b|\bgates?\b/i.test(rendered), false, `Team note leaked to rendered quote: ${rendered}`)
  assert.equal(model.scopeItems.some((i) => /dog|gate/i.test(i)), false, `Team note in customer scope field: ${model.scopeItems.join(" | ")}`)
  const siteNotes = model.assembly?.sections.find((s) => s.title === "Site Notes")?.items ?? []
  assert.equal(siteNotes.some((i) => /dog|gate/i.test(i)), false, `Team note in customer Site Notes: ${siteNotes.join(" | ")}`)
  // Retained internally so the crew still gets it.
  assert.ok(fiona.primary_quote.notes.some((n) => /dog|gate/i.test(n)), "team note must remain in internal notes")
})

test("B3 Rachel maintenance — steep driveway / park on street stays out of customer scope", () => {
  const rachel: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Rachel",
    site_address: "18 Arnie Road, Remuera",
    quote_title: "maintenance",
    job_type: "maintenance",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: ["Monthly maintenance", "Small sprays as needed"],
      notes: ["Steep driveway", "Park on street"],
    },
  }

  const model = b3MaintenanceModel(rachel)
  const rendered = renderCustomerDraftPreviewText(model)

  assert.equal(/steep driveway|park on street/i.test(rendered), false, `Team note leaked to rendered quote: ${rendered}`)
  assert.equal(
    model.scopeItems.some((i) => /steep driveway|park on street/i.test(i)),
    false,
    `Team note in customer scope field: ${model.scopeItems.join(" | ")}`,
  )
  assert.ok(rachel.primary_quote.notes.some((n) => /steep|park/i.test(n)), "team note must remain in internal notes")
})

test("B3 guard — a genuine work item with an access noun is NOT treated as a team note", () => {
  // "install a gate" and "improve access path" are work items, not advisories — they must survive.
  assert.equal(isTeamSiteNote("Install a new side gate"), false)
  assert.equal(isTeamSiteNote("Improve the access path to the back garden"), false)
  // Advisories are team notes.
  assert.equal(isTeamSiteNote("Please keep the side gate shut as there is a dog"), true)
  assert.equal(isTeamSiteNote("Steep driveway, park on street"), true)
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

// ── M1 — deterministic maintenance pricing-facts layer ─────────────────────
// Foundation for the maintenance send-ready series (M2 per-visit price, M3 greenwaste line,
// M4 priced extras, M5 frequency). Parsed straight from the RAW transcript so figures are stable
// run-to-run. Stella is the real MVP-acceptance transcript; Nadia (QU-0521) and Brett (QU-0569)
// are representative transcripts built from the answer keys (no raw transcripts on file) — graded
// on the SPOKEN facts + the rules, matching how the tidy series was graded.

const M1_NADIA_TRANSCRIPT =
  "Six-weekly garden maintenance for Nadia at 1a Meyrick Place, Meadowbank. $285 per visit. " +
  "Removal of greenwaste is charged separately at $26.50 per visit, ranging from $26.50 up to $66.25. " +
  "Sprays and extras roughly $10. Tool maintenance and servicing $12. " +
  "Main focus will be hedge trimming, weeding beds, and removal of self-seeded plants."

const M1_BRETT_TRANSCRIPT =
  "Ongoing lawns and garden maintenance for Brett at 19a Blockhouse Bay Road, two-monthly. " +
  "$467.50 per visit, with lawn mowing carried out between visits, increasing over summer. " +
  "A standard amount of greenwaste removal is included within the service. " +
  "Petrol for the mower is $7 per visit."

test("M1 Stella — parses per-visit price, monthly cadence and greenwaste-included from the real transcript", () => {
  const facts = extractMaintenancePricingFacts(acceptanceTranscript())
  assert.equal(facts.spokenPerVisitPrice, 405, "'Price per visit $405'")
  assert.equal(facts.cadence, "monthly")
  assert.equal(facts.labourHours, 4.5, "'4.5 hours labour per visit'")
  assert.equal(facts.greenwasteIncluded, true, "'$405 including greenwaste removal' folds greenwaste in")
  assert.equal(facts.spokenGreenwasteTotal, null, "no separate greenwaste figure when it is included")
})

test("M1 Nadia — per-visit $285, six-weekly, greenwaste its own $26.50, sprays and tool servicing captured", () => {
  const facts = extractMaintenancePricingFacts(M1_NADIA_TRANSCRIPT)
  assert.equal(facts.spokenPerVisitPrice, 285)
  assert.equal(facts.cadence, "six_weekly")
  assert.equal(facts.greenwasteIncluded, false, "charged separately, not folded in")
  assert.equal(facts.spokenGreenwasteTotal, 26.5, "trailing-$ greenwaste total is captured")
  assert.deepEqual(
    facts.extras.map((e) => e.name).sort(),
    ["Sprays / extras", "Tool servicing"],
    "sprays and tool servicing captured as extras (pricing/classification is M4)",
  )
})

test("M1 Brett — per-visit $467.50, two-monthly, greenwaste included, petrol captured as an extra", () => {
  const facts = extractMaintenancePricingFacts(M1_BRETT_TRANSCRIPT)
  assert.equal(facts.spokenPerVisitPrice, 467.5)
  assert.equal(facts.cadence, "two_monthly")
  assert.equal(facts.greenwasteIncluded, true)
  assert.equal(facts.spokenGreenwasteTotal, null, "included greenwaste yields no separate figure")
  assert.deepEqual(facts.extras.map((e) => e.name), ["Petrol"])
})

test("M1 — the same transcript yields identical facts across repeated runs (deterministic)", () => {
  for (const _ of [1, 2, 3, 4, 5]) {
    assert.deepEqual(extractMaintenancePricingFacts(M1_NADIA_TRANSCRIPT), extractMaintenancePricingFacts(M1_NADIA_TRANSCRIPT))
    assert.deepEqual(extractMaintenancePricingFacts(M1_BRETT_TRANSCRIPT), extractMaintenancePricingFacts(M1_BRETT_TRANSCRIPT))
  }
})

// ── M2 — per-visit price anchor (reuses the tidy labour engine) ─────────────
// A spoken per-visit total wins; otherwise the tidy engine computes hours × people × rate. The
// computed rule number is graded on correct computation + being editable (Joe adjusts by feel).

function resolveVisitPrice(transcript: string) {
  return resolveMaintenanceVisitPrice(extractMaintenancePricingFacts(transcript), transcript)
}

function priceLine(transcript: string) {
  const assembly = assembleMaintenanceCustomerQuote({ quote: EMPTY_PROCESSED_QUOTE, rawTranscript: transcript })
  return assembly.sections.find((s) => s.title === "Price")?.items ?? []
}

test("M2 — a spoken per-visit total wins (Stella $405, Nadia $285, Brett $467.50)", () => {
  const stella = resolveVisitPrice(acceptanceTranscript())
  assert.deepEqual([stella.pricingSource, stella.amount], ["spoken_per_visit", 405])
  const nadia = resolveVisitPrice(M1_NADIA_TRANSCRIPT)
  assert.deepEqual([nadia.pricingSource, nadia.amount], ["spoken_per_visit", 285])
  const brett = resolveVisitPrice(M1_BRETT_TRANSCRIPT)
  assert.deepEqual([brett.pricingSource, brett.amount], ["spoken_per_visit", 467.5])
})

test("M2 — with no spoken total, the price is computed as hours × rate via the tidy engine", () => {
  // "3 hours per visit at $75 an hour" → 3 × 1 × 75 = $225. The "$75 an hour" is the rate, not the
  // per-visit total, so it must NOT be read as a spoken price.
  const resolved = resolveVisitPrice("Fortnightly maintenance for Tom. Allow 3 hours per visit at $75 an hour.")
  assert.equal(resolved.pricingSource, "computed_day_rate")
  assert.equal(resolved.amount, 225)
})

test("M2 — a per-visit rate PER PERSON multiplies by crew size (full-day rule reused)", () => {
  // "full day, two people at $80/hr" → 7.5h × 2 × $80 = $1,200 (the tidy day-rate rule, reused).
  const resolved = resolveVisitPrice("Weekly maintenance. Full day, two people at $80 an hour.")
  assert.equal(resolved.pricingSource, "computed_day_rate")
  assert.equal(resolved.amount, 1200)
})

test("M2 — no spoken total and no rate stays unpriced (flagged, never guessed)", () => {
  // Stella's "4.5 hours labour per visit" alone (no rate) computes nothing — but she DOES state a
  // spoken $405, so isolate the rate-less case here.
  const resolved = resolveVisitPrice("Monthly maintenance for Kate. Allow 4.5 hours labour per visit.")
  assert.equal(resolved.pricingSource, "unpriced")
  assert.equal(resolved.amount, 0)
})

test("M2 — the assembled customer quote shows a deterministic '$X per visit' line", () => {
  assert.deepEqual(priceLine(M1_NADIA_TRANSCRIPT), ["$285 per visit"])
  assert.deepEqual(priceLine(M1_BRETT_TRANSCRIPT), ["$467.50 per visit"])
  assert.deepEqual(priceLine(acceptanceTranscript()), ["$405 per visit"])
})

test("M2 — the resolved per-visit price is identical across repeat runs (deterministic)", () => {
  for (const _ of [1, 2, 3, 4, 5]) {
    assert.equal(resolveVisitPrice(M1_NADIA_TRANSCRIPT).amount, 285)
    assert.equal(resolveVisitPrice("Fortnightly maintenance. Allow 3 hours per visit at $75 an hour.").amount, 225)
  }
})
