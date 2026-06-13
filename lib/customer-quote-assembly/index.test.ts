import assert from "node:assert/strict"
import test from "node:test"

import { extractAddressDetails } from "../address-extraction"
import { extractClientNameFromTranscript } from "../client-name-extraction"
import { extractPricing } from "../core/pricing-extraction"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import { assembleCustomerQuote } from "./index"

const transcript = `Monthly maintenance for Stella at 6 Tarawera Terrace, St Heliers.
Allow 4.5 hours labour per visit.
Price per visit $405 including greenwaste removal, herbicide spraying, and standard maintenance materials.
Main focus of visits will be weeding, pruning, and removal of self-seeded plants.
Each visit may include weeding, pruning, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required.
There is a greenwaste bin on site which can be filled up to approximately two-thirds full each visit.`

function maintenanceQuote(): ProcessedQuote {
  const address = extractAddressDetails(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "Monthly Maintenance",
    job_type: "maintenance",
    primary_quote: {
      quote_title: "Monthly Maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: ["Weeding", "Pruning", "Removal of self-seeded plants"],
      notes: ["Greenwaste bin on site may be filled up to approximately two-thirds full each visit."],
    },
  }
}

function sectionItems(title: string, assembly: NonNullable<ReturnType<typeof assembleCustomerQuote>>) {
  return assembly.sections.find((section) => section.title === title)?.items ?? []
}

test("maintenance MVP transcript assembles customer quote sections", () => {
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuote(),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
    selectedTemplate: {
      template_content: {
        reusable_customer_wording: ["Ongoing garden maintenance visit with tidy up and greenwaste removal."],
      },
      default_scope: null,
    },
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "Monthly Maintenance")
  assert.equal(assembly.customer_name, "Stella")
  assert.equal(assembly.site_address, "6 Tarawera Terrace, St Heliers")
  assert.deepEqual(sectionItems("Main Focus", assembly), [
    "Weeding",
    "Pruning",
    "Removal of self-seeded plants",
  ])
  assert.deepEqual(sectionItems("Service Includes", assembly), [
    "Greenwaste removal",
    "Herbicide spraying",
    "Standard maintenance materials",
  ])
  assert.deepEqual(sectionItems("Price", assembly), ["$405 per visit"])
  assert.equal(sectionItems("Ongoing Maintenance", assembly).some((item) => /general garden maintenance/i.test(item)), true)
  assert.equal(sectionItems("Ongoing Maintenance", assembly).some((item) => /Ongoing garden maintenance/i.test(item)), true)
  assert.equal(sectionItems("Site Notes", assembly).some((item) => /two-thirds full/i.test(item)), true)

  const rendered = [
    assembly.title,
    assembly.customer_name,
    assembly.site_address,
    ...assembly.sections.flatMap((section) => [section.title, ...section.items]),
  ].join("\n")

  assert.equal(/Planting labour|Planting template|Supply and install selected plants/i.test(rendered), false)
})

test("non-maintenance quotes keep existing preview behavior for now", () => {
  const assembly = assembleCustomerQuote({
    quote: {
      ...EMPTY_PROCESSED_QUOTE,
      quote_title: "Decking Quote",
      job_type: "decking",
    },
    rawTranscript: "Build a deck.",
    pricingFacts: [],
  })

  assert.equal(assembly, null)
})
