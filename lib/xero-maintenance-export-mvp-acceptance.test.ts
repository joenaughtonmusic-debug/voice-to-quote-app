import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { extractPricing } from "./core/pricing-extraction"
import { assembleMaintenanceCustomerQuote } from "./customer-quote-assembly/maintenance"
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
    if (!lineItem.Description.startsWith("Ongoing Garden Maintenance")) {
      failures.push(`Line item description started with "${lineItem.Description.split("\n")[0]}", expected "Ongoing Garden Maintenance".`)
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

    for (const expectedDescriptionText of [
      "Main focus:",
      "- Weeding",
      "- Pruning",
      "- Removal of self-seeded plants",
      "Includes:",
      "- Greenwaste removal",
      "- Herbicide spraying",
      "- Standard maintenance materials",
      "Ongoing maintenance:",
      "Each visit may include weeding, pruning, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required",
    ]) {
      if (!includesText(lineItem.Description, expectedDescriptionText)) {
        failures.push(`Line item description did not include "${expectedDescriptionText}".`)
      }
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

// ── M5 — Xero parity: the itemised export total equals the customer-draft TOTAL ──────────────
// Nadia (QU-0521) and Brett (QU-0569) are representative transcripts built from the answer keys.

const M5_NADIA_TRANSCRIPT =
  "Six-weekly garden maintenance for Nadia at 1a Meyrick Place, Meadowbank. $285 per visit. " +
  "Removal of greenwaste is charged separately at $26.50 per visit, ranging from $26.50 up to $66.25. " +
  "Sprays and extras roughly $10. Tool maintenance and servicing $12. " +
  "Main focus will be hedge trimming, weeding beds, and removal of self-seeded plants."

const M5_BRETT_TRANSCRIPT =
  "Ongoing lawns and garden maintenance for Brett at 19a Blockhouse Bay Road, two-monthly. " +
  "$467.50 per visit, with lawn mowing carried out between visits, increasing over summer. " +
  "A standard amount of greenwaste removal is included within the service. " +
  "Petrol for the mower is $7 per visit."

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function maintenanceQuoteFor(transcript: string, title: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: title,
    job_type: "maintenance",
    selected_template_id: maintenanceTemplate.id,
    selected_template_name: maintenanceTemplate.template_name ?? "",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: title,
      job_type: "maintenance",
    },
  }
}

/** The customer-draft per-visit TOTAL (from the M5 Totals block). */
function customerDraftTotal(transcript: string): number {
  const assembly = assembleMaintenanceCustomerQuote({ quote: EMPTY_PROCESSED_QUOTE, rawTranscript: transcript })
  const totalLine = assembly.sections.find((s) => s.title === "Totals")?.items.find((i) => i.startsWith("Total (NZD)")) ?? ""
  const m = totalLine.match(/\$([\d,]+\.\d{2})/)
  return m ? Number((m[1] ?? "").replace(/,/g, "")) : NaN
}

/** The Xero export total = sum of the itemised line UnitAmounts (all GST-inclusive, quantity 1). */
function xeroExportTotal(transcript: string, title: string): number {
  const exportQuote = buildCustomerPreviewQuoteInput({
    processedQuote: maintenanceQuoteFor(transcript, title),
    rawTranscript: transcript,
    selectedTemplate: maintenanceTemplate,
    pricingFacts: extractPricing(transcript).pricing,
  })
  const payload = buildXeroQuotePayload(exportQuote, { now: new Date("2026-06-14T00:00:00.000Z") })
  return round2(
    payload.quote.xeroLineItemsArray.reduce((sum, li) => sum + (li.UnitAmount ?? 0) * (li.Quantity ?? 1), 0),
  )
}

test("M5 Nadia — Xero export total ($333.50) equals the customer-draft TOTAL (parity)", () => {
  const draft = customerDraftTotal(M5_NADIA_TRANSCRIPT)
  assert.equal(draft, 333.5, "customer draft TOTAL")
  assert.equal(xeroExportTotal(M5_NADIA_TRANSCRIPT, "6-Weekly Maintenance"), draft, "Xero total must equal the draft total")
})

test("M5 Brett — Xero export total ($474.50) equals the customer-draft TOTAL (parity)", () => {
  const draft = customerDraftTotal(M5_BRETT_TRANSCRIPT)
  assert.equal(draft, 474.5, "customer draft TOTAL")
  assert.equal(xeroExportTotal(M5_BRETT_TRANSCRIPT, "2-Monthly Maintenance"), draft, "Xero total must equal the draft total")
})
