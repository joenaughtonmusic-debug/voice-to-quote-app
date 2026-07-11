import assert from "node:assert/strict"
import test from "node:test"

import type { QuoteFact, QuoteFactCategory } from "./core/quote-facts"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import {
  isMissingOptionalTemplateColumnError,
  TEMPLATE_RECOMMENDATION_FALLBACK_SELECT,
  TEMPLATE_RECOMMENDATION_SELECT,
} from "./template-recommendation-loading"
import { buildReviewedTemplateUpdatePayload, buildReviewTemplateCreatePayload } from "./template-review-metadata"
import { customerVisibleTemplateRecommendation, recommendTemplateForQuote, scoreTemplatesForQuote } from "./template-recommendation"
import { resolveTemplateSelection } from "./template-selection"

function fact(category: QuoteFactCategory, description: string): QuoteFact {
  return {
    id: `${category}-${description}`,
    category,
    description,
    sourceField: "test",
    confidence: "high",
    customerFacing: true,
    internalVisible: true,
    exportable: false,
  }
}

const maintenanceTemplate: QuoteTemplateLibraryItem = {
  id: "ongoing-maintenance",
  template_name: "Ongoing Garden Maintenance Template",
  category: "maintenance",
  document_type: "quote_template",
  common_line_items: ["Ongoing Garden Maintenance", "Greenwaste removal", "Spraying", "General weeding", "Leaf litter removal"],
  template_content: {
    reusable_customer_wording: ["Ongoing garden maintenance visit with tidy up and greenwaste removal."],
  },
  status: "active",
}

const plantingTemplate: QuoteTemplateLibraryItem = {
  id: "planting",
  template_name: "Planting Template",
  category: "planting",
  document_type: "quote_template",
  common_line_items: ["Plant supply", "Ficus Tuffi 25L", "Garden mix", "Planting labour"],
  template_content: {
    reusable_customer_wording: ["Supply and install selected plants as agreed."],
  },
  status: "active",
}

const deckingTemplate: QuoteTemplateLibraryItem = {
  id: "decking",
  template_name: "Decking Template",
  category: "decking",
  document_type: "quote_template",
  common_line_items: ["Decking boards", "Decking labour", "Fixings", "Waste removal"],
  status: "active",
}

const gardenTidyTemplate: QuoteTemplateLibraryItem = {
  id: "one-off-garden-tidy",
  template_name: "One-Off Garden Tidy",
  category: "maintenance",
  job_type: "one_off_tidy",
  document_type: "quote_template",
  common_line_items: ["Garden tidy", "Greenwaste removal", "Weeding", "Shrub cut back"],
  status: "active",
}

test("template recommendation loading does not require document_type column", () => {
  assert.equal(TEMPLATE_RECOMMENDATION_SELECT.includes("document_type"), false)
  assert.equal(TEMPLATE_RECOMMENDATION_FALLBACK_SELECT.includes("document_type"), false)
  assert.match(TEMPLATE_RECOMMENDATION_SELECT, /\btemplate_content\b/)
  assert.match(TEMPLATE_RECOMMENDATION_SELECT, /\bcategory\b/)
})

test("template recommendation loading can retry missing optional column errors", () => {
  assert.equal(
    isMissingOptionalTemplateColumnError({
      code: "42703",
      message: "column quote_templates.some_optional_field does not exist",
    }),
    true,
  )
  assert.equal(isMissingOptionalTemplateColumnError(new Error("network failed")), false)
})

test("reviewed maintenance template creation preserves available name category and inferred job type", () => {
  const payload = buildReviewTemplateCreatePayload({
    userId: "user-1",
    importName: "",
    importFilename: "",
    sourceText: "Ongoing Garden Maintenance Template\nService includes monthly weeding and greenwaste removal.",
    sectionCount: 3,
    existingTemplates: [
      {
        id: "legacy-maintenance",
        template_name: "Ongoing Garden Maintenance Template",
        category: "maintenance",
        default_scope: ["Monthly garden maintenance"],
        default_exclusions: ["Irrigation repairs"],
        default_pricing_structure: ["Ongoing Garden Maintenance", "Greenwaste removal"],
        template_content: {
          template_name: "Ongoing Garden Maintenance Template",
          category: "maintenance",
          reusable_customer_wording: ["Monthly garden maintenance visit."],
        },
        source_text: "Ongoing Garden Maintenance Template\nService includes monthly weeding and greenwaste removal.",
      },
    ],
  })

  assert.equal(payload.template_name, "Ongoing Garden Maintenance Template")
  assert.equal(payload.name, "Ongoing Garden Maintenance Template")
  assert.equal(payload.category, "maintenance")
  assert.equal(payload.job_type, "maintenance")
  assert.equal(payload.trade, "maintenance")
  assert.deepEqual(payload.default_scope, ["Monthly garden maintenance"])
})

test("reviewed template save merges rich template content instead of replacing it", () => {
  const payload = buildReviewedTemplateUpdatePayload({
    template: {
      id: "reviewed-maintenance",
      template_name: "Ongoing Garden Maintenance Template",
      category: "maintenance",
      template_content: {
        template_name: "Ongoing Garden Maintenance Template",
        category: "maintenance",
        reusable_customer_wording: ["Monthly garden maintenance visit."],
      },
    },
    sectionCount: 4,
    reviewedAt: "2026-06-13T00:00:00.000Z",
  })

  assert.equal(payload.status, "reviewed")
  assert.equal(payload.template_name, "Ongoing Garden Maintenance Template")
  assert.equal(payload.category, "maintenance")
  assert.equal(payload.job_type, "maintenance")
  assert.equal(payload.trade, "maintenance")
  assert.deepEqual((payload.template_content as any).reusable_customer_wording, ["Monthly garden maintenance visit."])
  assert.equal((payload.template_content as any).template_review.section_count, 4)
  assert.equal((payload.template_content as any).template_review.reviewed_at, "2026-06-13T00:00:00.000Z")
})

test("reviewed template metadata falls back safely when no metadata is available", () => {
  const payload = buildReviewTemplateCreatePayload({
    userId: "user-1",
    importName: "",
    importFilename: "",
    sourceText: "Scope:\nDo the work.\nPricing:\nTo be confirmed.",
    sectionCount: 2,
    existingTemplates: [],
  })

  assert.equal(payload.template_name, "Imported Quote Template")
  assert.equal(payload.category, "custom")
  assert.equal(payload.job_type, null)
  assert.equal(payload.trade, null)
  assert.equal((payload.template_content as any).template_review.section_count, 2)
})

test("maintenance quotes recommend the stored maintenance template even when reviewed sections are empty", () => {
  const recommendation = recommendTemplateForQuote({
    facts: [
      fact("job_scope", "Monthly garden maintenance visit for pruning, weeding and plant health checks."),
      fact("waste", "Green waste removal included."),
      fact("labour", "Allow two hours per monthly visit."),
    ],
    templates: [plantingTemplate, maintenanceTemplate],
    sectionsByTemplateId: {
      [maintenanceTemplate.id]: [],
      [plantingTemplate.id]: [],
    },
    jobType: "maintenance",
    trade: "gardening",
  })

  assert.equal(recommendation?.template.id, maintenanceTemplate.id)
  assert.notEqual(recommendation?.template.id, plantingTemplate.id)
})

test("maintenance wording with plant health, pruning, weeding and green waste does not recommend planting", () => {
  const recommendation = recommendTemplateForQuote({
    facts: [
      fact("job_scope", "Monthly garden maintenance including plant health checks, pruning and weeding."),
      fact("waste", "Green waste removal after each visit."),
    ],
    templates: [plantingTemplate, maintenanceTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "garden maintenance",
  })

  assert.equal(recommendation?.template.id, maintenanceTemplate.id)

  const scores = scoreTemplatesForQuote({
    facts: [fact("job_scope", "Plant health, pruning, weeding and green waste for a monthly maintenance visit.")],
    templates: [plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "garden maintenance",
  })

  assert.notEqual(scores[0]?.confidence, "high")
  assert.ok((scores[0]?.score ?? 0) < 0)
})

test("maintenance plant references do not count as planting intent", () => {
  const facts = [
    fact("job_scope", "Monthly maintenance with weeding, pruning, herbicide spraying and plant health checks."),
    fact("plants", "Remove self-seeded plants from the garden beds and check plant health."),
    fact("waste", "Green waste removal from pruning and weeding."),
  ]

  const recommendation = recommendTemplateForQuote({
    facts,
    templates: [plantingTemplate, maintenanceTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "maintenance",
  })

  assert.equal(recommendation?.template.id, maintenanceTemplate.id)

  const plantingOnlyRecommendation = recommendTemplateForQuote({
    facts,
    templates: [plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "maintenance",
  })

  assert.equal(plantingOnlyRecommendation, null)

  const [plantingScore] = scoreTemplatesForQuote({
    facts,
    templates: [plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "maintenance",
  })

  assert.equal(plantingScore?.matchedKeywords.includes("plant"), false)
  assert.ok((plantingScore?.score ?? 0) < 0)
})

test("customer view hides competing suggestions when a template is already selected", () => {
  const plantingRecommendation = recommendTemplateForQuote({
    facts: [
      fact("job_scope", "Supply and install a Ficus Tuffi hedge along the boundary."),
      fact("plants", "Ficus Tuffi 25L plants for hedge planting."),
    ],
    templates: [plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "planting",
    trade: "landscaping",
  })

  assert.equal(plantingRecommendation?.template.id, plantingTemplate.id)
  assert.equal(
    customerVisibleTemplateRecommendation({
      recommendation: plantingRecommendation,
      selectedTemplateId: maintenanceTemplate.id,
    }),
    null,
  )
})

test("Amy hedge quote still recommends planting", () => {
  const recommendation = recommendTemplateForQuote({
    facts: [
      fact("job_scope", "Supply and install a Ficus Tuffi hedge along the boundary."),
      fact("plants", "Ficus Tuffi 25L plants for hedge planting."),
      fact("materials", "Garden mix and mulch for planting."),
    ],
    templates: [maintenanceTemplate, plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "planting",
    trade: "landscaping",
  })

  assert.equal(recommendation?.template.id, plantingTemplate.id)
})

test("Sarah multi-area planting quote still recommends planting", () => {
  const recommendation = recommendTemplateForQuote({
    facts: [
      fact("job_scope", "Planting across upper and lower garden areas with plant options."),
      fact("plants", "Ficus Tuffi, Lomandra and Griselinia plant options."),
      fact("materials", "Planting compost and bark mulch."),
    ],
    templates: [maintenanceTemplate, plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "planting",
    trade: "landscaping",
  })

  assert.equal(recommendation?.template.id, plantingTemplate.id)
})

test("decking quotes still recommend decking", () => {
  const recommendation = recommendTemplateForQuote({
    facts: [
      fact("job_scope", "Build a 4m by 5m deck with existing posts retained."),
      fact("materials", "Pine decking boards and fixings."),
      fact("waste", "Remove old decking waste."),
    ],
    templates: [maintenanceTemplate, plantingTemplate, deckingTemplate],
    sectionsByTemplateId: {},
    jobType: "decking",
    trade: "decking",
  })

  assert.equal(recommendation?.template.id, deckingTemplate.id)
})

test("one off garden tidy prefers garden tidy template over ongoing maintenance", () => {
  const facts = [
    fact("job_scope", "One-off garden tidy with overgrowth removal, shrub cut back and weeding."),
    fact("waste", "Greenwaste removal included."),
  ]
  const templates = [maintenanceTemplate, gardenTidyTemplate, plantingTemplate]
  const recommendation = recommendTemplateForQuote({
    facts,
    templates,
    sectionsByTemplateId: {},
    jobType: "one_off_tidy",
    trade: "one_off_tidy",
  })
  const selection = resolveTemplateSelection({
    templates,
    recommendation,
    facts,
    jobType: "one_off_tidy",
    trade: "one_off_tidy",
  })

  assert.equal(recommendation?.template.id, gardenTidyTemplate.id)
  assert.notEqual(recommendation?.template.id, maintenanceTemplate.id)
  assert.deepEqual(selection, { templateId: gardenTidyTemplate.id, source: "deterministic" })
})

test("stored templates with metadata and empty reviewed sections remain eligible candidates", () => {
  const scores = scoreTemplatesForQuote({
    facts: [fact("job_scope", "Monthly garden maintenance with weeding and leaf litter removal.")],
    templates: [maintenanceTemplate],
    sectionsByTemplateId: {
      [maintenanceTemplate.id]: [],
    },
    jobType: "maintenance",
    trade: "gardening",
  })

  assert.equal(scores.length, 1)
  assert.equal(scores[0]?.template.id, maintenanceTemplate.id)
  assert.ok((scores[0]?.score ?? 0) >= 8)
  assert.notEqual(scores[0]?.confidence, "low")
})

test("template selection exposes all eligible templates for manual selection", () => {
  const templates = [maintenanceTemplate, plantingTemplate, deckingTemplate]

  assert.deepEqual(
    templates.map((template) => template.template_name),
    ["Ongoing Garden Maintenance Template", "Planting Template", "Decking Template"],
  )
})

test("manual template selection persists and is not overwritten by recommendation", () => {
  const recommendation = recommendTemplateForQuote({
    facts: [fact("job_scope", "Monthly garden maintenance with weeding.")],
    templates: [maintenanceTemplate, plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "maintenance",
  })

  const selection = resolveTemplateSelection({
    templates: [maintenanceTemplate, plantingTemplate],
    recommendation,
    currentTemplateId: plantingTemplate.id,
    currentSource: "manual",
    jobType: "maintenance",
    trade: "maintenance",
  })

  assert.deepEqual(selection, { templateId: plantingTemplate.id, source: "manual" })
})

test("manual no-template selection persists and is not overwritten", () => {
  const recommendation = recommendTemplateForQuote({
    facts: [fact("job_scope", "Monthly garden maintenance with weeding.")],
    templates: [maintenanceTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "maintenance",
  })

  const selection = resolveTemplateSelection({
    templates: [maintenanceTemplate],
    recommendation,
    currentTemplateId: "",
    currentSource: "manual",
    jobType: "maintenance",
    trade: "maintenance",
  })

  assert.deepEqual(selection, { templateId: "", source: "manual" })
})

test("deterministic recommendation replaces stale AI-selected planting template", () => {
  const facts = [
    fact("job_scope", "Monthly garden maintenance with weeding, pruning and green waste."),
    fact("waste", "Green waste removal included."),
  ]
  const recommendation = recommendTemplateForQuote({
    facts,
    templates: [plantingTemplate, maintenanceTemplate],
    sectionsByTemplateId: {},
    jobType: "maintenance",
    trade: "maintenance",
  })

  const selection = resolveTemplateSelection({
    templates: [plantingTemplate, maintenanceTemplate],
    selectedTemplateName: "Planting Template",
    recommendation,
    facts,
    jobType: "maintenance",
    trade: "maintenance",
    currentSource: "stale_ai",
  })

  assert.equal(recommendation?.template.id, maintenanceTemplate.id)
  assert.deepEqual(selection, { templateId: maintenanceTemplate.id, source: "deterministic" })
})

test("stale AI planting selection is ignored for maintenance without strong planting facts", () => {
  const selection = resolveTemplateSelection({
    templates: [plantingTemplate, maintenanceTemplate],
    selectedTemplateName: "Planting Template",
    facts: [
      fact("job_scope", "Monthly maintenance with weeding, pruning, plant health checks and self-seeded plant removal."),
    ],
    jobType: "maintenance",
    trade: "maintenance",
  })

  assert.deepEqual(selection, { templateId: "", source: "stale_ai" })
})

test("existing planting selection is allowed when strong planting evidence exists", () => {
  const selection = resolveTemplateSelection({
    templates: [plantingTemplate, maintenanceTemplate],
    selectedTemplateName: "Planting Template",
    facts: [
      fact("job_scope", "Supply and install plants for new hedge planting."),
      fact("plants", "Ficus Tuffi 25L plant options."),
    ],
    jobType: "planting",
    trade: "landscaping",
  })

  assert.deepEqual(selection, { templateId: plantingTemplate.id, source: "existing_quote" })
})

const shirleyHedgeTrimmingFacts = [
  fact("job_scope", "Prune back Mexican elder trees on right boundary"),
  fact("job_scope", "Trim back side and top"),
  fact("job_scope", "Blowdown and tidy"),
  fact("labour", "Two people for one and a quarter days"),
  fact("waste", "Two trailer loads of green waste and three quarters of a trailer load"),
]

test("hedge_trimming Shirley transcript recommends One-Off Garden Tidy not Decking", () => {
  const templates = [maintenanceTemplate, plantingTemplate, deckingTemplate, gardenTidyTemplate]
  const recommendation = recommendTemplateForQuote({
    facts: shirleyHedgeTrimmingFacts,
    templates,
    sectionsByTemplateId: {},
    jobType: "hedge_trimming",
    trade: "hedge_trimming",
  })
  const scores = scoreTemplatesForQuote({
    facts: shirleyHedgeTrimmingFacts,
    templates,
    sectionsByTemplateId: {},
    jobType: "hedge_trimming",
    trade: "hedge_trimming",
  })

  assert.equal(recommendation?.template.id, gardenTidyTemplate.id)
  assert.notEqual(recommendation?.template.id, deckingTemplate.id)
  const deckingScore = scores.find((score) => score.template.id === deckingTemplate.id)?.score ?? 0
  const gardenTidyScore = scores.find((score) => score.template.id === gardenTidyTemplate.id)?.score ?? 0
  assert.ok(gardenTidyScore > deckingScore)
})

test("hedge_trimming deterministic selection prefers One-Off Garden Tidy", () => {
  const templates = [maintenanceTemplate, deckingTemplate, gardenTidyTemplate]
  const recommendation = recommendTemplateForQuote({
    facts: shirleyHedgeTrimmingFacts,
    templates,
    sectionsByTemplateId: {},
    jobType: "hedge_trimming",
    trade: "hedge_trimming",
  })
  const selection = resolveTemplateSelection({
    templates,
    recommendation,
    facts: shirleyHedgeTrimmingFacts,
    jobType: "hedge_trimming",
    trade: "hedge_trimming",
  })

  assert.deepEqual(selection, { templateId: gardenTidyTemplate.id, source: "deterministic" })
})

test("stale AI-selected Decking template is ignored for hedge_trimming one-off tidy", () => {
  const selection = resolveTemplateSelection({
    templates: [deckingTemplate, gardenTidyTemplate],
    selectedTemplateName: "Decking Template",
    facts: shirleyHedgeTrimmingFacts,
    jobType: "hedge_trimming",
    trade: "hedge_trimming",
  })

  assert.deepEqual(selection, { templateId: "", source: "stale_ai" })
})

const clientAPlantingFacts = [
  fact("job_scope", "14.2 metre planting area of Michaelia gracipes"),
  fact("materials", "Five bags of garden mix"),
  fact("labour", "One person, 1.5 days labour"),
  {
    ...fact("plants", "Michelia gracipes 4L"),
    metadata: { option_category: "planting" },
  },
]

const clientAPlantingSignals = {
  hasPlantCalculatorResults: true,
  hasPlantingQuoteOptions: true,
  hasPlantNameOrLength: true,
}

test("Client A planting quote recommends Planting not One-Off Garden Tidy", () => {
  const templates = [maintenanceTemplate, gardenTidyTemplate, plantingTemplate]
  const recommendation = recommendTemplateForQuote({
    facts: clientAPlantingFacts,
    templates,
    sectionsByTemplateId: {},
    jobType: "planting",
    trade: "planting",
    plantingSignals: clientAPlantingSignals,
  })
  const scores = scoreTemplatesForQuote({
    facts: clientAPlantingFacts,
    templates,
    sectionsByTemplateId: {},
    jobType: "planting",
    trade: "planting",
    plantingSignals: clientAPlantingSignals,
  })

  assert.equal(recommendation?.template.id, plantingTemplate.id)
  assert.notEqual(recommendation?.template.id, gardenTidyTemplate.id)
  const plantingScore = scores.find((score) => score.template.id === plantingTemplate.id)?.score ?? 0
  const gardenTidyScore = scores.find((score) => score.template.id === gardenTidyTemplate.id)?.score ?? 0
  assert.ok(plantingScore > gardenTidyScore, `${plantingScore} vs ${gardenTidyScore}`)
})

test("planting quote with quote_options category planting selects Planting template", () => {
  const facts = [
    fact("job_scope", "Plant 11.5 metres of Ficus Tuffi hedge."),
    {
      ...fact("plants", "Ficus Tuffi 14L"),
      metadata: { option_category: "planting" },
    },
  ]
  const recommendation = recommendTemplateForQuote({
    facts,
    templates: [gardenTidyTemplate, plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "planting",
    trade: "planting",
    plantingSignals: {
      hasPlantCalculatorResults: false,
      hasPlantingQuoteOptions: true,
      hasPlantNameOrLength: false,
    },
  })

  assert.equal(recommendation?.template.id, plantingTemplate.id)
})

test("planting quote with plant_calculator_results selects Planting template", () => {
  const facts = [fact("job_scope", "14.2 metre planting area")]
  const recommendation = recommendTemplateForQuote({
    facts,
    templates: [gardenTidyTemplate, plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "planting",
    trade: "planting",
    plantingSignals: {
      hasPlantCalculatorResults: true,
      hasPlantingQuoteOptions: false,
      hasPlantNameOrLength: true,
    },
  })

  assert.equal(recommendation?.template.id, plantingTemplate.id)
})

test("stale AI-selected One-Off Garden Tidy is ignored for planting workflow", () => {
  const selection = resolveTemplateSelection({
    templates: [gardenTidyTemplate, plantingTemplate],
    selectedTemplateName: "One-Off Garden Tidy",
    facts: clientAPlantingFacts,
    jobType: "planting",
    trade: "planting",
  })

  assert.deepEqual(selection, { templateId: "", source: "stale_ai" })
})

test("manual Planting template selection still wins over garden tidy recommendation context", () => {
  const recommendation = recommendTemplateForQuote({
    facts: clientAPlantingFacts,
    templates: [gardenTidyTemplate, plantingTemplate],
    sectionsByTemplateId: {},
    jobType: "planting",
    trade: "planting",
    plantingSignals: clientAPlantingSignals,
  })
  const selection = resolveTemplateSelection({
    templates: [gardenTidyTemplate, plantingTemplate],
    recommendation,
    facts: clientAPlantingFacts,
    jobType: "planting",
    trade: "planting",
    currentTemplateId: gardenTidyTemplate.id,
    currentSource: "manual",
  })

  assert.equal(recommendation?.template.id, plantingTemplate.id)
  assert.deepEqual(selection, { templateId: gardenTidyTemplate.id, source: "manual" })
})
