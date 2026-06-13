import assert from "node:assert/strict"
import test from "node:test"
import type { ProcessedQuote } from "../../processed-quote"
import { quoteFactsFromProcessedQuote } from "../../core/quote-facts"
import { EMPTY_PROCESSED_QUOTE } from "../../processed-quote"
import { calculateRetaining, detectRetainingFromText } from "./index"

function quoteWithScope(scope: string[], overrides: Partial<ProcessedQuote> = {}): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Renee",
    site_address: "22 Bank Street",
    quote_title: "Quote",
    job_type: "retaining",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Quote",
      job_type: "retaining",
      scope,
    },
    ...overrides,
  }
}

function retainingFacts(quote: ProcessedQuote) {
  return quoteFactsFromProcessedQuote(quote).filter((fact) => fact.metadata?.trade === "retaining")
}

test("detects and calculates a single retaining wall", () => {
  const transcript = "Build a 10m long retaining wall, 600mm high"
  const detection = detectRetainingFromText(transcript)
  const result = calculateRetaining(detection.request)

  assert.equal(detection.is_retaining, true)
  assert.equal(result.sections.length, 1)
  assert.equal(result.sections[0].length_m, 10)
  assert.equal(result.sections[0].height_m, 0.6)
  assert.equal(result.sections[0].face_area_square_metres, 6)
  assert.equal(result.total_face_area_square_metres, 6)
})

test("detects and calculates multiple retaining walls", () => {
  const transcript = "One wall 8m long and 800mm high, second wall 4m long and 600mm high"
  const detection = detectRetainingFromText(transcript)
  const result = calculateRetaining(detection.request)

  assert.equal(detection.is_retaining, true)
  assert.equal(result.sections.length, 2)
  assert.equal(result.sections[0].length_m, 8)
  assert.equal(result.sections[0].height_m, 0.8)
  assert.equal(result.sections[0].face_area_square_metres, 6.4)
  assert.equal(result.sections[1].length_m, 4)
  assert.equal(result.sections[1].height_m, 0.6)
  assert.equal(result.sections[1].face_area_square_metres, 2.4)
  assert.equal(result.total_face_area_square_metres, 8.8)
})

test("detects replacement wall with drainage and waste", () => {
  const transcript =
    "Replace the old timber retaining wall, 6m long and 700mm high. Include drainage and posts. Remove old wall waste."
  const detection = detectRetainingFromText(transcript)
  const result = calculateRetaining(detection.request)

  assert.equal(detection.is_retaining, true)
  assert.equal(result.wall_kind, "replacement_wall")
  assert.equal(result.timber_retaining, true)
  assert.equal(result.drainage_mentioned, true)
  assert.equal(result.posts_mentioned, true)
  assert.deepEqual(result.waste_removal_notes, ["Remove old wall waste"])
})

test("does not detect retaining from electrical transcript", () => {
  const transcript = "Install six downlights and two power points."
  const detection = detectRetainingFromText(transcript)
  const result = calculateRetaining(detection.request)

  assert.equal(detection.is_retaining, false)
  assert.equal(detection.confidence, "none")
  assert.equal(detection.request.sections.length, 0)
  assert.equal(result.sections.length, 0)
  assert.equal(result.total_face_area_square_metres, null)
})

test("single retaining wall produces QuoteFacts", () => {
  const facts = retainingFacts(quoteWithScope(["Build a 10m long retaining wall, 600mm high."]))
  const wall = facts.find((fact) => fact.metadata?.fact_type === "retaining_wall_section")

  assert.ok(wall)
  assert.equal(wall.category, "job_scope")
  assert.equal(wall.quantity, 6)
  assert.equal(wall.unit, "m2")
  assert.equal(wall.metadata?.length_m, 10)
  assert.equal(wall.metadata?.height_m, 0.6)
  assert.equal(wall.metadata?.square_metres, 6)
  assert.equal(wall.metadata?.wall_type, "retaining_wall")
})

test("multiple retaining walls produce section and total QuoteFacts", () => {
  const facts = retainingFacts(
    quoteWithScope(["One wall 8m long and 800mm high, second wall 4m long and 600mm high."]),
  )
  const walls = facts.filter((fact) => fact.metadata?.fact_type === "retaining_wall_section")
  const total = facts.find((fact) => fact.metadata?.fact_type === "total_retaining_face_area")

  assert.equal(walls.length, 2)
  assert.equal(walls[0].metadata?.square_metres, 6.4)
  assert.equal(walls[1].metadata?.square_metres, 2.4)
  assert.equal(total?.metadata?.square_metres, 8.8)
  assert.equal(total?.quantity, 8.8)
})

test("replacement drainage posts and waste flags are preserved in QuoteFacts metadata", () => {
  const facts = retainingFacts(
    quoteWithScope([
      "Replace the old timber retaining wall, 6m long and 700mm high.",
      "Include drainage and posts.",
      "Remove old wall waste.",
    ]),
  )
  const wall = facts.find((fact) => fact.metadata?.fact_type === "retaining_wall_section")
  const drainage = facts.find((fact) => fact.metadata?.fact_type === "drainage_note")
  const posts = facts.find((fact) => fact.metadata?.fact_type === "posts_note")
  const waste = facts.find((fact) => fact.metadata?.fact_type === "waste_removal")

  assert.equal(wall?.metadata?.replacement, true)
  assert.equal(wall?.metadata?.drainage, true)
  assert.equal(wall?.metadata?.posts, true)
  assert.equal(wall?.metadata?.waste_removal, true)
  assert.equal(wall?.metadata?.wall_type, "timber_retaining")
  assert.equal(drainage?.category, "materials")
  assert.equal(posts?.category, "materials")
  assert.equal(waste?.category, "waste")
  assert.match(waste?.description ?? "", /old wall waste/i)
})

test("non-retaining quote produces no retaining QuoteFacts", () => {
  const facts = retainingFacts(
    quoteWithScope(["Install six downlights and two power points."], {
      job_type: "electrical",
      primary_quote: {
        ...EMPTY_PROCESSED_QUOTE.primary_quote,
        job_type: "electrical",
        scope: ["Install six downlights and two power points."],
      },
    }),
  )

  assert.equal(facts.length, 0)
})

test("retaining QuoteFacts do not pollute decking or planting facts", () => {
  const deckingQuote = quoteWithScope(["Construct a 4m x 5m pine deck."], {
    job_type: "decking",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "decking",
      scope: ["Construct a 4m x 5m pine deck."],
    },
  })
  const plantingQuote = quoteWithScope(["Plant multiple Ficus Tuffi along lower planting area."], {
    client_name: "Simon",
    job_type: "planting",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "planting",
      scope: ["Plant multiple Ficus Tuffi along lower planting area."],
    },
    quote_options: [
      {
        id: "plant-option-1",
        label: "Option A",
        title: "Ficus Tuffi 25L",
        category: "planting",
        source: "plant_calculator",
        lineItems: [],
        subtotal: 0,
      },
    ],
  })

  const deckingFacts = quoteFactsFromProcessedQuote(deckingQuote)
  const plantingFacts = quoteFactsFromProcessedQuote(plantingQuote)

  assert.equal(deckingFacts.some((fact) => fact.metadata?.trade === "decking"), true)
  assert.equal(deckingFacts.some((fact) => fact.metadata?.trade === "retaining"), false)
  assert.equal(plantingFacts.some((fact) => fact.category === "plants" && /Ficus Tuffi 25L/i.test(fact.description)), true)
  assert.equal(plantingFacts.some((fact) => fact.metadata?.trade === "retaining"), false)
})
