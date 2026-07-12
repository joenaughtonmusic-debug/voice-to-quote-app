import assert from "node:assert/strict"
import test from "node:test"

import { extractAddressDetails } from "../address-extraction"
import { extractClientNameFromTranscript } from "../client-name-extraction"
import { extractPricing } from "../core/pricing-extraction"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import { isLabourFinalLine } from "./garden-tidy"
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

// T7 — the tidy scope work items live on the merged "Labour - main scope" line, before the final
// labour figure ($ amount or crew/duration allowance).
function tidyScope(assembly: NonNullable<ReturnType<typeof assembleCustomerQuote>>) {
  return sectionItems("Labour - main scope", assembly).filter((item) => !isLabourFinalLine(item))
}

function renderedAssembly(assembly: NonNullable<ReturnType<typeof assembleCustomerQuote>>) {
  return [
    assembly.title,
    assembly.customer_name,
    assembly.site_address,
    ...assembly.sections.flatMap((section) => [section.title, ...section.items]),
  ].join("\n")
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

  assert.equal(/Planting labour|Planting template|Supply and install selected plants/i.test(renderedAssembly(assembly)), false)
})

test("James maintenance quote produces grouped customer-facing sections", () => {
  const jamesTranscript = `Monthly maintenance for James at 14 Kowhai Avenue, New Lynn.
Main focus pruning and trimming.
All greenwaste to be removed.
Allow 4 hours labour per visit.
Price per visit $495 including small fertiliser.
Each visit may include weeding, spraying, plant health checks, and general garden maintenance as required.
Keep gates closed due to dog.`
  const address = extractAddressDetails(jamesTranscript)
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(jamesTranscript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "maintenance",
    job_type: "maintenance",
    primary_quote: {
      quote_title: "maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: [
        "Monthly maintenance",
        "Main focus pruning and trimming",
        "All greenwaste to be removed",
        "Allow 4 hours labour per visit",
        "Price per visit $495 including small fertiliser",
        "Each visit may include weeding, spraying, plant health checks, and general garden maintenance as required",
      ],
      notes: [
        "Title: maintenance",
        "Job type: maintenance",
        "Cadence: monthly",
        "Scope: Visits may include weeding, spraying, plant health checks, and general garden maintenance as required",
        "Note: Keep gates closed due to dog.",
      ],
    },
  }
  const assembly = assembleCustomerQuote({
    quote,
    rawTranscript: jamesTranscript,
    pricingFacts: extractPricing(jamesTranscript).pricing,
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "Monthly Maintenance")
  // B3: the only site note is a team/access advisory (dog/gates), so it drops out of the
  // customer quote entirely — no Site Notes section here.
  assert.deepEqual(assembly.sections.map((section) => section.title), [
    "Main Focus",
    "Service Includes",
    "Ongoing Maintenance",
    "Price",
    // M5: the GST-inclusive + TOTAL block (James's $495 shows its GST component).
    "Totals",
  ])
  assert.deepEqual(sectionItems("Main Focus", assembly), ["Pruning", "Trimming"])
  assert.deepEqual(sectionItems("Service Includes", assembly), [
    "Small fertiliser",
    "Greenwaste removal",
  ])
  assert.deepEqual(sectionItems("Ongoing Maintenance", assembly), [
    "Each visit may include weeding, spraying, plant health checks, and general garden maintenance as required",
  ])
  assert.deepEqual(sectionItems("Price", assembly), ["$495 per visit"])
  // Team/access note (dog, gates) is NOT customer-facing.
  assert.deepEqual(sectionItems("Site Notes", assembly), [])

  const rendered = renderedAssembly(assembly)
  assert.equal(/dog|gates?\b/i.test(rendered), false, rendered)
  assert.equal(/4 hours|labou?r per visit/i.test(rendered), false)
  assert.equal(/Title:|Job type:|Cadence:|Scope:/i.test(rendered), false)
})

test("Sarah maintenance quote keeps focus, ongoing wording, and site notes customer-facing", () => {
  const sarahTranscript = `Monthly maintenance for Sarah at 28 Rata Street, Mount Eden.
Main focus will be hedge trimming, weeding, and keeping pathways clear.
Price per visit $365 including greenwaste removal and standard maintenance materials.
Each visit may include hedge trimming, pruning, weeding, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required.
A greenwaste bin is available on site.
Please keep the side gate shut as there is a dog on the property.`
  const address = extractAddressDetails(sarahTranscript)
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(sarahTranscript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "maintenance maintenance",
    job_type: "maintenance",
    primary_quote: {
      quote_title: "maintenance",
      job_type: "maintenance",
      cadence: "monthly",
      scope: [
        "Title: maintenance",
        "Job type: maintenance",
        "Cadence: monthly",
        "Main focus will be hedge trimming, weeding, and keeping pathways clear",
        "Scope: General garden maintenance as required",
        "Scope: Visits may include hedge trimming, pruning, weeding, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required",
      ],
      notes: [
        "Title: maintenance",
        "Job type: maintenance",
        "Cadence: monthly",
        "Scope: General garden maintenance as required",
        "Note: A greenwaste bin is available on site.",
        "Note: Please keep the side gate shut as there is a dog on the property.",
      ],
    },
  }

  const assembly = assembleCustomerQuote({
    quote,
    rawTranscript: sarahTranscript,
    pricingFacts: extractPricing(sarahTranscript).pricing,
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "Monthly Maintenance")
  assert.deepEqual(sectionItems("Main Focus", assembly), [
    "Hedge trimming",
    "Weeding",
    "Keeping pathways clear",
  ])
  assert.deepEqual(sectionItems("Service Includes", assembly), [
    "Greenwaste removal",
    "Standard maintenance materials",
  ])
  assert.deepEqual(sectionItems("Ongoing Maintenance", assembly), [
    "Each visit may include hedge trimming, pruning, weeding, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required",
  ])
  assert.deepEqual(sectionItems("Price", assembly), ["$365 per visit"])
  // B3: the customer Site Notes keep genuinely customer-relevant info (green waste bin) but
  // NOT the team/access advisory (dog/gate), which stays internal.
  assert.deepEqual(sectionItems("Site Notes", assembly), [
    "A green waste bin is available on site",
  ])

  const rendered = renderedAssembly(assembly)
  assert.equal(/dog|side gate/i.test(rendered), false, rendered)
  assert.equal(/Title:|Job type:|Cadence:|Scope:|Note:/i.test(rendered), false)
  assert.equal(/Planting labour|legacy \$ labour total/i.test(rendered), false)
})

test("garden tidy job types activate customer quote assembly", () => {
  const tidyTranscript = `One-off garden tidy for Sarah at 44 Amy Street.
Remove overgrowth around the boundary.
Cut back shrubs.
Weed garden beds.
Remove self-seeded plants.
Price $1,440 including greenwaste removal.
Greenwaste to be removed from site.`

  for (const jobType of ["garden_tidy", "one_off_tidy"]) {
    const quote: ProcessedQuote = {
      ...EMPTY_PROCESSED_QUOTE,
      client_name: "Sarah",
      site_address: "44 Amy Street",
      quote_title: "One-Off Garden Tidy",
      job_type: jobType,
      primary_quote: {
        quote_title: "One-Off Garden Tidy",
        job_type: jobType,
        cadence: "",
        scope: [
          "Scope: Remove overgrowth around boundary",
          "Remove overgrowth around boundary",
          "Cut back shrubs",
          "Weed garden beds",
          "Remove self-seeded plants",
        ],
        notes: ["Greenwaste removed from site"],
      },
      customer_scope: [
        "Remove overgrowth around boundary",
        "Cut back shrubs",
        "Weed garden beds",
        "Remove self-seeded plants",
      ],
      greenwaste: "Greenwaste removed from site",
    }
    const assembly = assembleCustomerQuote({
      quote,
      rawTranscript: tidyTranscript,
      pricingFacts: extractPricing(tidyTranscript).pricing,
    })

    assert.ok(assembly, `${jobType} should use garden tidy assembly`)
    assert.equal(assembly.title, "One-Off Garden Tidy")
    assert.deepEqual(assembly.sections.map((section) => section.title), [
      "Labour - main scope",
      "Service Includes",
      "Price",
      "Site Notes",
    ])
    assert.deepEqual(tidyScope(assembly), [
      "Remove overgrowth around boundary",
      "Cut back shrubs",
      "Weed garden beds",
      "Remove self-seeded plants",
    ])
    assert.equal(renderedAssembly(assembly).includes("Scope:"), false)
    assert.deepEqual(sectionItems("Service Includes", assembly), ["Greenwaste removal"])
    assert.deepEqual(sectionItems("Price", assembly), ["$1,440.00"])
    assert.deepEqual(sectionItems("Site Notes", assembly), ["Greenwaste removed from site"])
  }
})

test("selected garden tidy template can activate assembly when job type is missing", () => {
  const tidyTranscript = `One-off garden tidy for Sarah at 44 Amy Street.
Remove overgrowth around the boundary.
Cut back shrubs.
Weed garden beds.
Remove self-seeded plants.
Price $1,440 including greenwaste removal.
Greenwaste to be removed from site.`
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Sarah",
    site_address: "44 Amy Street",
    quote_title: "",
    job_type: "",
    primary_quote: {
      quote_title: "",
      job_type: "",
      cadence: "",
      scope: [
        "Remove overgrowth around boundary",
        "Cut back shrubs",
        "Weed garden beds",
        "Remove self-seeded plants",
      ],
      notes: ["Greenwaste removed from site"],
    },
    customer_scope: [
      "Remove overgrowth around boundary",
      "Cut back shrubs",
      "Weed garden beds",
      "Remove self-seeded plants",
    ],
    greenwaste: "Greenwaste removed from site",
  }

  const assembly = assembleCustomerQuote({
    quote,
    rawTranscript: tidyTranscript,
    pricingFacts: extractPricing(tidyTranscript).pricing,
    selectedTemplate: {
      template_name: "One-Off Garden Tidy",
      category: "garden_tidy",
      job_type: "garden_tidy",
      template_content: {},
      default_scope: null,
    },
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "One-Off Garden Tidy")
  assert.deepEqual(tidyScope(assembly), [
    "Remove overgrowth around boundary",
    "Cut back shrubs",
    "Weed garden beds",
    "Remove self-seeded plants",
  ])
})

test("selected planting template does not activate garden tidy assembly", () => {
  const assembly = assembleCustomerQuote({
    quote: {
      ...EMPTY_PROCESSED_QUOTE,
      client_name: "Sarah",
      site_address: "44 Amy Street",
      quote_title: "",
      job_type: "",
      primary_quote: {
        quote_title: "",
        job_type: "",
        cadence: "",
        scope: ["Remove overgrowth around boundary"],
        notes: [],
      },
      customer_scope: ["Remove overgrowth around boundary"],
    },
    rawTranscript: "Remove overgrowth around the boundary.",
    pricingFacts: [],
    selectedTemplate: {
      template_name: "Planting Template",
      category: "planting",
      job_type: "planting",
      template_content: {},
      default_scope: null,
    },
  })

  assert.equal(assembly, null)
})

test("planting quotes assemble options materials labour and exclusions", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Amy",
    site_address: "44 Amy Street",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: ["Plant 11.5 metres of Ficus Tuffi hedge", "Garden mix", "Mulch", "Labour included"],
      notes: [],
    },
    customer_scope: ["Plant 11.5 metres of Ficus Tuffi hedge", "Garden mix", "Mulch", "Labour included"],
    materials: ["Garden mix", "Mulch"],
    exclusions: ["No irrigation"],
    quote_options: [
      {
        id: "ficus-12m",
        label: "Option A",
        title: "Ficus Tuffi 1.2m",
        category: "planting",
        source: "plant_calculator",
        lineItems: [
          {
            itemName: "Ficus Tuffi 1.2m",
            quantity: 15,
            unit: "each",
            unitPrice: 34.88,
            total: 523.2,
          },
        ],
        subtotal: 523.2,
      },
      {
        id: "ficus-14l",
        label: "Option B",
        title: "Ficus Tuffi 14L",
        category: "planting",
        source: "plant_calculator",
        lineItems: [
          {
            itemName: "Ficus Tuffi 14L",
            quantity: 15,
            unit: "each",
            unitPrice: 81.25,
            total: 1218.75,
          },
        ],
        subtotal: 1218.75,
      },
      {
        id: "ficus-25l",
        label: "Option C",
        title: "Ficus Tuffi 25L",
        category: "planting",
        source: "plant_calculator",
        lineItems: [
          {
            itemName: "Ficus Tuffi 25L",
            quantity: 15,
            unit: "each",
            unitPrice: 118.75,
            total: 1781.25,
          },
        ],
        subtotal: 1781.25,
      },
    ],
  }

  const assembly = assembleCustomerQuote({
    quote,
    rawTranscript: "Quote for Amy. Plant 11.5 metres of Ficus Tuffi hedge. Include garden mix, mulch, labour. No irrigation.",
    pricingFacts: [],
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "Planting Quote")
  assert.deepEqual(sectionItems("Planting Options", assembly), [
    "Option 1: Ficus Tuffi 1.2m",
    "Option 2: Ficus Tuffi 14L",
    "Option 3: Ficus Tuffi 25L",
  ])
  assert.deepEqual(sectionItems("Materials", assembly), ["Garden mix", "Mulch"])
  assert.deepEqual(sectionItems("Labour", assembly), ["Included"])
  assert.deepEqual(sectionItems("Exclusions", assembly), ["Irrigation not included"])
  assert.equal(/Maintenance|Garden tidy|legacy labour total|Irrigation included/i.test(renderedAssembly(assembly)), false)
})

test("decking quotes assemble project overview details material access programme and exclusions", () => {
  const transcript = `Quote for Susan at 6 Tarawera Terrace.
Deck measures 12.8m by 15.6m.
Remove existing deck.
Use Kwila 140x19 for the entire deck.
Posts are still in good condition and will remain.
Entire project should take approximately 2 weeks with 2 people.
No staining.
Access is poor, allow an additional 10 hours.`
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Susan",
    site_address: "6 Tarawera Terrace",
    quote_title: "Deck Construction / Deck Replacement Quote",
    job_type: "decking",
    primary_quote: {
      quote_title: "Deck Construction / Deck Replacement Quote",
      job_type: "decking",
      cadence: "",
      scope: [
        "Deck measures 12.8m by 15.6m",
        "Remove existing deck",
        "Use Kwila 140x19 for the entire deck",
        "Posts are still in good condition and will remain",
        "Entire project should take approximately 2 weeks with 2 people",
      ],
      notes: ["Access is poor, allow an additional 10 hours"],
    },
    customer_scope: [
      "Deck measures 12.8m by 15.6m",
      "Remove existing deck",
      "Use Kwila 140x19 for the entire deck",
      "Posts are still in good condition and will remain",
      "Entire project should take approximately 2 weeks with 2 people",
    ],
    materials: ["Kwila 140x19"],
    exclusions: ["staining"],
  }

  const assembly = assembleCustomerQuote({
    quote,
    rawTranscript: transcript,
    pricingFacts: [],
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "Deck Construction / Deck Replacement Quote")
  assert.deepEqual(sectionItems("Project Overview", assembly), [
    "Existing deck removed",
    "Existing posts retained",
    "New Kwila 140x19 decking installed",
  ])
  assert.deepEqual(sectionItems("Deck Details", assembly), [
    "12.8m x 15.6m",
    "Approximate area 199.68m²",
  ])
  assert.deepEqual(sectionItems("Material", assembly), ["Kwila 140x19"])
  assert.deepEqual(sectionItems("Access", assembly), ["Poor access conditions"])
  assert.deepEqual(sectionItems("Programme", assembly), ["Approximately 2 weeks"])
  assert.deepEqual(sectionItems("Exclusions", assembly), ["Staining not included"])
  assert.equal(/Planting labour|Maintenance|Garden tidy|Irrigation|legacy labour total/i.test(renderedAssembly(assembly)), false)
})

test("retaining quotes assemble wall scope fence reinstatement materials access and exclusions", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Mary",
    site_address: "12 Hill Road",
    quote_title: "Retaining Wall Quote",
    job_type: "retaining",
    primary_quote: {
      quote_title: "Retaining Wall Quote",
      job_type: "retaining",
      cadence: "",
      scope: [
        "Replace timber retaining wall along the back boundary",
        "Install new retaining wall",
        "Remove old retaining",
        "Remove old fence",
        "Attach new standard paling fence after retaining is complete",
      ],
      notes: ["Reasonable access conditions"],
    },
    customer_scope: [
      "Replace timber retaining wall along the back boundary",
      "Install new retaining wall",
      "Remove old retaining",
      "Remove old fence",
      "Attach new standard paling fence after retaining is complete",
    ],
    materials: ["125x125 H4 posts at 1 metre spacing", "Standard paling fence"],
    exclusions: ["Planting not included"],
  }

  const assembly = assembleCustomerQuote({
    quote,
    rawTranscript: "Replace timber retaining wall. Wall is 12.4 metres long and approximately 1 metre high. Access is reasonable. No planting included.",
    pricingFacts: [],
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "Retaining Wall Quote")
  assert.deepEqual(sectionItems("Retaining Wall Scope", assembly), [
    "Replace timber retaining wall along the back boundary",
    "Install new retaining wall",
    "Remove old retaining",
  ])
  assert.deepEqual(sectionItems("Fence Reinstatement", assembly), [
    "Remove old fence",
    "Attach new standard paling fence after retaining is complete",
  ])
  assert.deepEqual(sectionItems("Materials", assembly), [
    "125x125 H4 posts at 1 metre spacing",
    "Standard paling fence",
  ])
  assert.deepEqual(sectionItems("Access", assembly), ["Reasonable access conditions"])
  assert.deepEqual(sectionItems("Exclusions", assembly), ["Planting not included"])
  assert.equal(/Planting labour|Maintenance|Garden tidy|Decking|Irrigation|legacy labour total/i.test(renderedAssembly(assembly)), false)
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

// ---------------------------------------------------------------------------
// Extended maintenance cadence title tests
// ---------------------------------------------------------------------------

function maintenanceQuoteWithTranscript(transcript: string, jobType = "maintenance", quoteTitle = "maintenance"): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: quoteTitle,
    job_type: jobType,
    primary_quote: {
      quote_title: quoteTitle,
      job_type: jobType,
      cadence: "",
      scope: [],
      notes: [],
    },
  }
}

test("monthly maintenance title remains Monthly Maintenance", () => {
  const transcript = "Monthly maintenance for Kim at 14 Oak Street. Price per visit $120."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  assert.equal(assembly.title, "Monthly Maintenance")
})

test("2-monthly maintenance title is 2-Monthly Maintenance not Monthly Maintenance", () => {
  const transcript = "2-monthly maintenance for Sarah at 12 Hill Road. Price per visit $240 including greenwaste removal."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  assert.equal(assembly.title, "2-Monthly Maintenance")
  assert.notEqual(assembly.title, "Monthly Maintenance")
})

test("two-monthly phrase produces 2-Monthly Maintenance title", () => {
  const transcript = "Two-monthly maintenance for David at 5 Oak Avenue. Price per visit $240."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  assert.equal(assembly.title, "2-Monthly Maintenance")
})

test("3-monthly maintenance title is 3-Monthly Maintenance", () => {
  const transcript = "3-monthly maintenance for Jane at 8 Pine Street. Price per visit $360."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  assert.equal(assembly.title, "3-Monthly Maintenance")
  assert.notEqual(assembly.title, "Monthly Maintenance")
})

test("quarterly maps to 3-Monthly Maintenance title", () => {
  const transcript = "Quarterly maintenance for Tom at 3 Elm Road. Price per visit $360 including greenwaste."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  assert.equal(assembly.title, "3-Monthly Maintenance")
})

test("4-monthly maintenance title is 4-Monthly Maintenance", () => {
  const transcript = "4-monthly maintenance for Pat at 22 River Lane. Price per visit $480."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  assert.equal(assembly.title, "4-Monthly Maintenance")
  assert.notEqual(assembly.title, "Monthly Maintenance")
})

test("6-weekly maintenance title is 6-Weekly Maintenance", () => {
  const transcript = "6-weekly maintenance for Chris at 7 Beach Road. Price per visit $180 including greenwaste."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  assert.equal(assembly.title, "6-Weekly Maintenance")
})

test("every 6 weeks phrase produces 6-Weekly Maintenance title", () => {
  const transcript = "Maintenance every 6 weeks for Alex at 9 Bay Street. Price per visit $180."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  assert.equal(assembly.title, "6-Weekly Maintenance")
})

test("2-monthly price is preserved per-visit from spoken transcript", () => {
  const transcript = "2-monthly maintenance for Sarah at 12 Hill Road. Price per visit $240 including greenwaste removal."
  const assembly = assembleCustomerQuote({
    quote: maintenanceQuoteWithTranscript(transcript),
    rawTranscript: transcript,
    pricingFacts: extractPricing(transcript).pricing,
  })
  assert.ok(assembly)
  const priceItems = assembly.sections.find((s) => s.title === "Price")?.items ?? []
  assert.equal(priceItems.some((item) => item.includes("240") && item.includes("per visit")), true)
})

// ---------------------------------------------------------------------------
// Real-world Shirley quote — assembly quality regression (Pristine Gardens)
// ---------------------------------------------------------------------------

const shirleyTranscript = `Just went to see Shirley at 6 Percival Parade, Freemans Bay. The quote is a one-off tidy, mostly hedge trimming and tree pruning. We need to prune back the Mexican elder trees on the right-hand boundary. That job will take two people one and a quarter days with two trailer loads of green waste. And we also need to trim the side back and then also trim the top back. Form her property on a sharp angle so it's defined. That's probably going to be three quarters of a trailer load for six days green waste, along with the usual blowdown and tidy of things that we want to do.`

function shirleyQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Shirley",
    site_address: "6 Percival Parade, Freemans Bay",
    quote_title: "One-Off Garden Tidy",
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

test("Shirley one-off tidy activates garden tidy workflow", () => {
  const assembly = assembleCustomerQuote({
    quote: shirleyQuote(),
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
  })

  assert.ok(assembly, "garden tidy assembly should activate for one_off_tidy")
  assert.equal(assembly.title, "One-Off Garden Tidy")
})

test("Shirley one-off tidy renders Scope of Work with all three work items", () => {
  const assembly = assembleCustomerQuote({
    quote: shirleyQuote(),
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
  })

  assert.ok(assembly)
  const scope = tidyScope(assembly)
  assert.ok(scope.length > 0, "Scope of Work section must exist")
  assert.ok(
    scope.some((item) => /mexican\s+elder/i.test(item)),
    `Mexican elder pruning must appear in Scope of Work. Got: ${scope.join(", ")}`,
  )
  assert.ok(
    scope.some((item) => /trim/i.test(item)),
    `Hedge trimming must appear in Scope of Work. Got: ${scope.join(", ")}`,
  )
  assert.ok(
    scope.some((item) => /blowdown|blow\s+down/i.test(item)),
    `Blowdown and tidy must appear in Scope of Work. Got: ${scope.join(", ")}`,
  )
  assert.ok(
    !scope.some((item) => /two\s+people|one\s+and\s+a\s+quarter\s+days/i.test(item)),
    `Labour lines must not appear in Scope of Work. Got: ${scope.join(", ")}`,
  )
  assert.ok(
    !scope.some((item) => /trailer\s+load/i.test(item)),
    `Greenwaste quantity lines must not appear in Scope of Work. Got: ${scope.join(", ")}`,
  )
})

test("Shirley one-off tidy renders Labour Allowance section", () => {
  const assembly = assembleCustomerQuote({
    quote: shirleyQuote(),
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
  })

  assert.ok(assembly)
  const labour = sectionItems("Labour - main scope", assembly)
  assert.ok(labour.length > 0, "Labour Allowance section must exist")
  assert.ok(
    labour.some((item) => /two\s+people|2\s+people/i.test(item)),
    `Labour allowance must mention crew size. Got: ${labour.join(", ")}`,
  )
  assert.ok(
    labour.some((item) => /one\s+and\s+a\s+quarter|1\.25/i.test(item)),
    `Labour allowance must mention duration. Got: ${labour.join(", ")}`,
  )
})

test("Shirley one-off tidy renders Green Waste section with trailer-load quantities", () => {
  const assembly = assembleCustomerQuote({
    quote: shirleyQuote(),
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
  })

  assert.ok(assembly)
  const greenwaste = sectionItems("Green Waste", assembly)
  assert.ok(greenwaste.length > 0, "Green Waste section must exist when trailer load data is captured")
  assert.ok(
    greenwaste.some((item) => /two\s+trailer|2\s+trailer/i.test(item)),
    `Green Waste must mention two trailer loads. Got: ${greenwaste.join(", ")}`,
  )
  assert.ok(
    greenwaste.some((item) => /quarter|three\s+quarters/i.test(item)),
    `Green Waste must mention three quarters of a trailer load. Got: ${greenwaste.join(", ")}`,
  )
})

test("Shirley one-off tidy renders Service Includes with Greenwaste removal", () => {
  const assembly = assembleCustomerQuote({
    quote: shirleyQuote(),
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
  })

  assert.ok(assembly)
  const includes = sectionItems("Service Includes", assembly)
  assert.ok(
    includes.some((item) => /greenwaste\s+removal/i.test(item)),
    `Service Includes must contain Greenwaste removal. Got: ${includes.join(", ")}`,
  )
})

test("Shirley one-off tidy is not limited to only Service Includes Greenwaste removal", () => {
  const assembly = assembleCustomerQuote({
    quote: shirleyQuote(),
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
  })

  assert.ok(assembly)
  const rendered = renderedAssembly(assembly)

  assert.ok(
    assembly.sections.length >= 3,
    `Quote must have at least 3 sections (Labour - main scope, Green Waste, Service Includes). Got: ${assembly.sections.map((s) => s.title).join(", ")}`,
  )
  assert.ok(
    assembly.sections.some((s) => s.title === "Labour - main scope"),
    "Labour - main scope section must be present",
  )
  assert.ok(
    /mexican\s+elder/i.test(rendered),
    "Mexican elder pruning must appear in rendered quote",
  )
  assert.ok(
    /two\s+people|labour\s+allowance/i.test(rendered),
    "Labour allowance must appear in rendered quote",
  )
  assert.ok(
    /trailer/i.test(rendered),
    "Greenwaste trailer-load quantities must appear in rendered quote",
  )
})

function shirleyHedgeTrimmingQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Shirley",
    site_address: "6 Percival Parade, Freemans Bay",
    quote_title: "One-Off Garden Tidy",
    job_type: "hedge_trimming",
    selected_template_name: "One-Off Garden Tidy",
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

test("hedge_trimming job type activates garden tidy assembly via subtype routing", () => {
  const assembly = assembleCustomerQuote({
    quote: shirleyHedgeTrimmingQuote(),
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "One-Off Garden Tidy")
  assert.ok(
    assembly.sections.length > 1,
    `hedge_trimming must produce more than 1 section. Got: ${assembly.sections.map((s) => s.title).join(", ")}`,
  )
})

test("hedge_trimming + One-Off Garden Tidy selectedTemplate object activates garden tidy assembly", () => {
  const assembly = assembleCustomerQuote({
    quote: shirleyHedgeTrimmingQuote(),
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
    selectedTemplate: {
      template_name: "One-Off Garden Tidy",
      category: "garden_tidy",
      job_type: "garden_tidy",
      trade: "maintenance",
    },
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "One-Off Garden Tidy")
  assert.ok(tidyScope(assembly).some((item) => /mexican\s+elder/i.test(item)))
  assert.ok(sectionItems("Labour - main scope", assembly).some((item) => /two\s+people/i.test(item)))
  assert.ok(sectionItems("Green Waste", assembly).some((item) => /trailer/i.test(item)))
  assert.ok(sectionItems("Service Includes", assembly).some((item) => /greenwaste\s+removal/i.test(item)))
})

test("hedge_trimming + selected_template_name only (no template object) still activates garden tidy assembly", () => {
  const assembly = assembleCustomerQuote({
    quote: {
      ...shirleyHedgeTrimmingQuote(),
      selected_template_name: "One-Off Garden Tidy",
    },
    rawTranscript: shirleyTranscript,
    pricingFacts: [],
  })

  assert.ok(assembly)
  assert.equal(assembly.title, "One-Off Garden Tidy")
  assert.ok(
    assembly.sections.length > 1,
    `selected_template_name fallback must produce more than 1 section. Got: ${assembly.sections.map((s) => s.title).join(", ")}`,
  )
  assert.ok(tidyScope(assembly).some((item) => /blowdown/i.test(item)))
  assert.equal(
    tidyScope(assembly).some((item) => /^labour note$/i.test(item)),
    false,
    "Bare labour note placeholder must not appear in Scope of Work",
  )
})
