import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { extractPricing } from "./core/pricing-extraction"
import { buildCustomerPreviewQuoteInput } from "./customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "./customer-preview-render"
import { buildCustomerQuotePreview } from "./customer-quote-preview"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import { buildXeroQuotePayload } from "./xero-quote-payload"

const ACCEPTANCE_DOC = "docs/XERO_MAINTENANCE_EXPORT_MVP_ACCEPTANCE.md"

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

function acceptanceTranscript() {
  const doc = readFileSync(ACCEPTANCE_DOC, "utf8")
  const match = doc.match(/## Acceptance Transcript\s+```text\s+([\s\S]+?)\s+```/)
  assert.ok(match?.[1], "Acceptance transcript must remain documented in docs/XERO_MAINTENANCE_EXPORT_MVP_ACCEPTANCE.md")
  return match[1].trim()
}

function maintenanceExportProcessedQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "Monthly Maintenance",
    job_type: "maintenance",
    selected_template_id: maintenanceTemplate.id,
    selected_template_name: maintenanceTemplate.template_name ?? "Ongoing Garden Maintenance Template",
    template_match_confidence: "high",
    primary_quote: {
      quote_title: "Monthly Maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: ["Weeding", "Pruning", "Removal of self-seeded plants", "Garden maintenance"],
      notes: ["Greenwaste bin can be filled up to approximately two-thirds full each visit."],
    },
    customer_scope: [
      "Main focus of visits will be weeding, pruning, and removal of self-seeded plants.",
      "Each visit may include weeding, pruning, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required.",
    ],
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

function liveEquivalentDraftText(transcript: string, processedQuote: ProcessedQuote) {
  const pricing = extractPricing(transcript)
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote,
    rawTranscript: transcript,
    selectedTemplate: maintenanceTemplate,
    pricingFacts: pricing.pricing,
  })
  const preview = buildCustomerQuotePreview(previewInput)
  const model = buildCustomerDraftPreviewModel({
    processedQuote,
    customerPreview: preview,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })

  return renderCustomerDraftPreviewText(model)
}

function includesText(text: string, expected: string) {
  return text.toLowerCase().includes(expected.toLowerCase())
}

function taxLabel(taxType: string | undefined) {
  return taxType === "OUTPUT2" ? "15% GST" : (taxType ?? "")
}

test("Xero maintenance export MVP customer draft path remains customer-ready", () => {
  const transcript = acceptanceTranscript()
  const processedQuote = maintenanceExportProcessedQuote(transcript)
  const renderedText = liveEquivalentDraftText(transcript, processedQuote)

  for (const expected of [
    "Monthly Maintenance",
    "$405 per visit",
    "greenwaste removal",
    "herbicide spraying",
    "standard maintenance materials",
  ]) {
    assert.equal(includesText(renderedText, expected), true, renderedText)
  }
})

test("Xero maintenance export MVP payload uses the spoken customer price and inclusions", () => {
  const transcript = acceptanceTranscript()
  const processedQuote = maintenanceExportProcessedQuote(transcript)
  const pricing = extractPricing(transcript)
  const exportQuote = buildCustomerPreviewQuoteInput({
    processedQuote,
    rawTranscript: transcript,
    selectedTemplate: maintenanceTemplate,
    pricingFacts: pricing.pricing,
  })
  const payload = buildXeroQuotePayload(exportQuote, { now: new Date("2026-06-14T00:00:00.000Z") })
  const [lineItem] = payload.quote.xeroLineItemsArray
  const failures: string[] = []

  if (payload.quote.title !== "Monthly Maintenance") {
    failures.push(`Quote title was "${payload.quote.title}", expected "Monthly Maintenance".`)
  }
  if (!lineItem) {
    failures.push("Xero export payload did not contain a maintenance line item.")
  } else {
    if (lineItem.Description !== "Ongoing Garden Maintenance") {
      failures.push(`Line item description was "${lineItem.Description}", expected "Ongoing Garden Maintenance".`)
    }
    if (lineItem.Quantity !== 1) {
      failures.push(`Line item quantity was ${lineItem.Quantity}, expected 1.`)
    }
    if (lineItem.UnitAmount !== 405) {
      failures.push(`Line item unit price was ${lineItem.UnitAmount}, expected 405.`)
    }
    if (taxLabel(lineItem.TaxType) !== "15% GST") {
      failures.push(`Line item tax was "${taxLabel(lineItem.TaxType)}", expected "15% GST".`)
    }
  }

  const payloadText = JSON.stringify(payload)
  for (const expected of ["greenwaste removal", "herbicide spraying", "standard maintenance materials"]) {
    if (!includesText(payloadText, expected)) failures.push(`Payload did not include "${expected}".`)
  }

  for (const forbidden of [
    "4.5 hours",
    "internal labour allowance",
    "360",
    "Planting labour",
    "raw calculator",
  ]) {
    if (includesText(payloadText, forbidden)) failures.push(`Payload included forbidden text "${forbidden}".`)
  }

  assert.deepEqual(failures, [], JSON.stringify(payload, null, 2))
})
