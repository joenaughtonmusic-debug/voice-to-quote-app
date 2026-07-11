import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import { buildQuotePlan } from "./build-plan"

/**
 * QuotePlan builder — validates the data model + parsing shape. buildQuotePlan is
 * pure over an already-extracted quote, so these tests hand-build the extraction
 * and never call OpenAI. No pipeline wiring is exercised.
 */

function extraction(overrides: Partial<ProcessedQuote>): ProcessedQuote {
  return { ...EMPTY_PROCESSED_QUOTE, ...overrides }
}

// ── 1. Client B/Titirangi — optional hedge labour must NOT become main labour ────
const ADAM_TRANSCRIPT =
  "Okay, this is a quote for Client B at 20 Poplar Street in Titirangi. So the main job is levelling the back lawn. " +
  "Before we do that though, we need to construct a small timber retaining wall, approximately 400mm high, using two 200x50 retaining timbers with 100x100 timber posts along that length. " +
  "And we also need to install some polythene along the fence to protect the fence. " +
  "Once we've installed the retaining wall, we can then look to put down a whole bunch of topsoil. " +
  "So we're looking at doing a 50mm depth across the area, and the area is approximately 6m by 16.8m. " +
  "And the retaining wall is going to sit 900mm off the fence, and the length is going to be 16.8m for the retaining wall. " +
  "And it would be great to also have the option for lawn mix to go on top of the area, but in the actual quote we'll use topsoil. " +
  "And we also need to have a count for some lawn seed, but we'll just use the cheap lawn seed. " +
  "I imagine a 5kg bag, $129 for the bag, and it would be great if you could also do an optional price for planting a Ficus Tuffi hedge along the fence with roughly one metre sized plants, and the labour for that being two people one day."

function clientBExtraction(): ProcessedQuote {
  return extraction({
    client_name: "Client B",
    site_address: "20 Poplar Street, Titirangi",
    quote_title: "Back Lawn Levelling Quote",
    job_type: "general_landscaping",
    primary_quote: {
      quote_title: "Back Lawn Levelling Quote",
      job_type: "general_landscaping",
      cadence: "",
      scope: [
        "Construct a small timber retaining wall approximately 400mm high using 200x50 retaining timbers and 100x100 timber posts.",
        "Install polythene along the fence behind the retaining wall to help protect the fence.",
        "Import and spread topsoil across the lawn area.",
        "Fine-grade the area ready for lawn establishment.",
        "Sow lawn seed to establish the new lawn.",
        "Tidy the work area on completion.",
      ],
      notes: [],
    },
    optional_quotes: [
      {
        quote_title: "Optional Ficus Tuffi hedge",
        job_type: "planting",
        cadence: "",
        scope: ["Plant a Ficus Tuffi hedge along the fence, roughly 1m plants."],
        notes: [],
      },
    ],
    materials: ["200x50 retaining timber", "100x100 timber posts", "Polythene", "Topsoil", "Lawn seed — 5kg bag"],
  })
}

test("Client B/Titirangi — optional Ficus hedge labour is captured on the optional bucket, not main", () => {
  const plan = buildQuotePlan({
    extraction: clientBExtraction(),
    transcript: ADAM_TRANSCRIPT,
    classification: { specialist: "landscaping" },
  })

  assert.match(plan.quoteType, /landscaping/i)

  const ficus = plan.optional.find((bucket) => /ficus/i.test(bucket.title))
  assert.ok(ficus, `expected an optional Ficus bucket, got ${JSON.stringify(plan.optional.map((b) => b.title))}`)
  const hedgeLabour = ficus.labour.find((l) => l.hours === 16)
  assert.ok(hedgeLabour, `expected 16h hedge labour on the optional bucket, got ${JSON.stringify(ficus.labour)}`)
  assert.equal(hedgeLabour.people, 2)
  assert.equal(hedgeLabour.days, 1)

  assert.ok(
    !plan.main.labour.some((l) => l.hours === 16 || l.people === 2),
    `main labour must not contain the optional hedge allowance, got ${JSON.stringify(plan.main.labour)}`,
  )
})

// ── 1b. Slice 4 — measurement ownership: a retaining-wall length is NOT a planting
//        length, and no bucket claims "16.8m for the retaining wall" as its planting
//        measurement. This is the ownership guarantee that stops the planting
//        calculator fabricating "the retaining wall 16.8M" plant options. ────────────
test("Slice 4 — retaining-wall length is never captured as a bucket's planting measurement", () => {
  const plan = buildQuotePlan({
    extraction: clientBExtraction(),
    transcript: ADAM_TRANSCRIPT,
    classification: { specialist: "landscaping" },
  })

  // The transcript contains "16.8m for the retaining wall" and "6m by 16.8m" (topsoil
  // area) — neither is a planting length, so no bucket may record lengthM 16.8 or 6.
  for (const bucket of [plan.main, ...plan.optional]) {
    assert.notEqual(
      bucket.measurements?.lengthM,
      16.8,
      `bucket "${bucket.id}" must not capture the retaining-wall length as a planting length, got ${JSON.stringify(bucket.measurements)}`,
    )
    assert.notEqual(
      bucket.measurements?.lengthM,
      6,
      `bucket "${bucket.id}" must not capture the topsoil-area dimension as a planting length, got ${JSON.stringify(bucket.measurements)}`,
    )
  }

  // The main (retaining/topsoil) bucket owns no planting length at all.
  assert.equal(
    plan.main.measurements?.lengthM,
    undefined,
    `main bucket must own no planting length, got ${JSON.stringify(plan.main.measurements)}`,
  )
})

// ── 2. Maintenance — quoteType + cadence + greenwaste ────────────────────────
test("Maintenance — quoteType maintenance, cadence captured, greenwaste is a main material", () => {
  const plan = buildQuotePlan({
    extraction: extraction({
      client_name: "Jenny",
      job_type: "maintenance",
      quote_title: "Garden Maintenance",
      primary_quote: {
        quote_title: "Garden Maintenance",
        job_type: "maintenance",
        cadence: "monthly",
        scope: ["Mow the lawns", "Weed the garden beds", "Trim the edges"],
        notes: [],
      },
      greenwaste: "2 trailer loads",
    }),
    transcript:
      "Monthly garden maintenance for Jenny at 5 Oak Road. Mow the lawns, weed the beds, and trim the edges. We take away two trailer loads of green waste each visit.",
    classification: { specialist: "maintenance" },
  })

  assert.equal(plan.quoteType, "maintenance")
  assert.equal(plan.cadence, "monthly")
  assert.ok(
    plan.main.materials.some((m) => /green\s*waste/i.test(m.name)),
    `expected green waste as a main material, got ${JSON.stringify(plan.main.materials)}`,
  )
})

// ── 3. Michelia planting — measurements + labour on main, border stays optional ─
const MICHELIA_TRANSCRIPT =
  "Went to see Client A at 10 Willow Lane, Mount Wellington.\n\n" +
  "This is a planting quote for the front garden bed.\n\n" +
  "The planting area is approximately 14.2 metres long.\n\n" +
  "The plant she wanted was Michelia gracipes.\n\n" +
  "She does not want the biggest size, but please show both size options if available.\n\n" +
  "Plant spacing should be 50 centimetres.\n\n" +
  "Allow one person for one and a half days because there are roots in the garden bed.\n\n" +
  "Allow 5 bags of garden mix.\n\n" +
  "Optional work:\nInstall a 150x50 timber board border around the planting area."

test("Michelia planting — 14.2m/500mm and 12h labour on main; optional border has no planting measurement", () => {
  const plan = buildQuotePlan({
    extraction: extraction({
      client_name: "Client A",
      job_type: "planting",
      quote_title: "Planting Quote",
      primary_quote: {
        quote_title: "Planting Quote",
        job_type: "planting",
        cadence: "",
        scope: [
          "Supply and plant Michelia gracipes hedge to the agreed planting area.",
          "Planting area approximately 14.2 metres long.",
          "Plants to be spaced at approximately 50cm centres.",
        ],
        notes: [],
      },
      optional_quotes: [
        {
          quote_title: "Optional timber board border",
          job_type: "planting",
          cadence: "",
          scope: ["Install a 150x50 timber board border around the planting area."],
          notes: [],
        },
      ],
      materials: ["Garden mix — 5 bags"],
    }),
    transcript: MICHELIA_TRANSCRIPT,
    classification: { specialist: "planting" },
  })

  assert.equal(plan.main.measurements?.lengthM, 14.2)
  assert.equal(plan.main.measurements?.spacingMm, 500)
  // Slice 4 — the planting measurements carry provenance back to their own bucket text.
  assert.ok(
    plan.main.measurements?.provenance?.some((p) => /14\.2/.test(p)),
    `expected measurement provenance for the 14.2m planting length, got ${JSON.stringify(plan.main.measurements?.provenance)}`,
  )
  assert.ok(
    plan.main.labour.some((l) => l.hours === 12 && l.people === 1 && l.days === 1.5),
    `expected 12h main labour, got ${JSON.stringify(plan.main.labour)}`,
  )

  const border = plan.optional.find((bucket) => /border/i.test(bucket.title))
  assert.ok(border, "expected an optional timber board border bucket")
  assert.equal(border.measurements, undefined, `optional border must have no planting measurement, got ${JSON.stringify(border.measurements)}`)
})

// ── 4. Garden tidy — one_off_tidy, main labour stays main, no planting bucket ──
test("Garden tidy — one_off_tidy, main labour stays main, no fabricated planting bucket", () => {
  const plan = buildQuotePlan({
    extraction: extraction({
      client_name: "Mark",
      job_type: "one_off_tidy",
      quote_title: "One-Off Garden Tidy",
      primary_quote: {
        quote_title: "One-Off Garden Tidy",
        job_type: "one_off_tidy",
        cadence: "",
        scope: ["Cut back the shrubs", "Weed the garden", "Clear the fallen leaves"],
        notes: [],
      },
    }),
    transcript:
      "One-off garden tidy for Mark at 8 Elm Street. Cut back the shrubs, weed the garden, and clear the leaves. Allow two people for one day.",
    classification: { specialist: "one_off_tidy" },
  })

  assert.equal(plan.quoteType, "one_off_tidy")
  assert.ok(
    plan.main.labour.some((l) => l.hours === 16 && l.people === 2 && l.days === 1),
    `expected 16h main labour, got ${JSON.stringify(plan.main.labour)}`,
  )
  assert.equal(plan.optional.length, 0, "no optional buckets should be fabricated")
})
