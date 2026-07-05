import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import type { GoldenQuoteFixture } from "../contracts"

const TRANSCRIPT = `Okay, this is a quote for Adam at 20 Lemnos Street in Titirangi. So the main job is levelling the back lawn. Before we do that though, we need to construct a small timber retaining wall, approximately 400mm high, using two 200x50 retaining timbers with 100x100 timber posts along that length. And we also need to install some polythene along the fence to protect the fence. Once we've installed the retaining wall, we can then look to put down a whole bunch of topsoil. So we're looking at doing a 50mm depth across the area, and the area is approximately 6m by 16.8m. And the retaining wall is going to sit 900mm off the fence, and the length is going to be 16.8m for the retaining wall. And it would be great to also have the option for lawn mix to go on top of the area, but in the actual quote we'll use topsoil. And we also need to have a count for some lawn seed, but we'll just use the cheap lawn seed. I imagine a 5kg bag, $129 for the bag, and it would be great if you could also do an optional price for planting a Ficus Tuffi hedge along the fence with roughly one metre sized plants, and the labour for that being two people one day.`

/**
 * QA-3 DESIRED STATE — mixed landscaping / back-lawn levelling with a small
 * retaining component. This is what the pipeline should produce after the
 * decking-detector routing fix (lib/trades/decking/detector.ts now requires
 * explicit deck intent, so "posts" + "6m by 16.8m" no longer trip decking).
 *
 * MOCKED BOUNDARY: the AI-extracted fields (classification/scope/materials) are
 * still stubbed to the target output — the real route can't run headlessly. The
 * VERIFIED code change is the decking detector; see lib/trades/decking/index.test.ts
 * ("does not detect decking from a lawn/retaining job…"). The projection layers
 * (customer preview, audit, JMS) below run on real code.
 *
 * Detailed dimensions and the $129 lawn-seed price are held in internal_notes so
 * the customer preview stays clean; preserving them as a priced line item and
 * calculating topsoil volume / hedge plant count remain future work (knownFailures).
 */
function buildProcessedQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Adam",
    site_address: "20 Lemnos Street, Titirangi",
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
    customer_scope: [
      "Construct a small timber retaining wall approximately 400mm high using 200x50 retaining timbers and 100x100 timber posts.",
      "Install polythene along the fence behind the retaining wall to help protect the fence.",
      "Import and spread topsoil across the lawn area.",
      "Fine-grade the area ready for lawn establishment.",
      "Sow lawn seed to establish the new lawn.",
      "Tidy the work area on completion.",
    ],
    materials: [
      "200x50 retaining timber",
      "100x100 timber posts",
      "Polythene",
      "Topsoil",
      "Lawn seed — 5kg bag",
    ],
    internal_notes: [
      "Retaining wall: approximately 400mm high, 16.8m long, set out approximately 900mm off the fence.",
      "Retaining timber: two 200x50 horizontal retaining timbers with 100x100 timber posts.",
      "Topsoil area: 6m x 16.8m = 100.8m²; depth 50mm (volume ~5.04m³ to confirm).",
      "Lawn seed: 5kg bag; spoken price $129.",
      "Optional Ficus Tuffi hedge along fence; roughly 1m plants; optional labour 2 people x 1 day.",
    ],
    // No decking line items — the decking detector no longer fires (QA-3 fix).
    line_items: [],
  }
}

export const adamTitirangi: GoldenQuoteFixture = {
  name: "Golden Quote 3 — Adam / Titirangi (mixed landscaping)",
  mockingNotes:
    "AI-extracted fields stubbed to the QA-3 desired landscaping output. The verified real change is the decking detector gate (lib/trades/decking/detector.ts + its unit tests). Projection layers run on real code.",
  transcript: TRANSCRIPT,
  expectedClassification: /general_landscaping|landscaping/i,
  customerPreviewContains: ["retaining wall", "polythene", "topsoil", "lawn seed"],
  customerPreviewMustNotContain: ["Deck area 1", "Decking boards", "Plant multiple Deck area 1"],
  internalFacts: [
    {
      label: "suburb Titirangi preserved in address",
      assert: (p) => /titirangi/i.test(p.quote.site_address),
      actual: (p) => `site_address="${p.quote.site_address}"`,
    },
    {
      label: "no decking line items",
      assert: (p) => !p.quote.line_items.some((i) => /deck/i.test(`${i.item_name} ${i.description}`)),
      actual: (p) => `line item names=${JSON.stringify(p.quote.line_items.map((i) => i.item_name))}`,
    },
    {
      label: "retaining wall dimensions preserved (400mm / 16.8m / 900mm)",
      assert: (p) => {
        const notes = p.quote.internal_notes.join(" ")
        return /400mm/.test(notes) && /16\.8m/.test(notes) && /900mm/.test(notes)
      },
      actual: (p) => `internal_notes=${JSON.stringify(p.quote.internal_notes)}`,
    },
    {
      label: "topsoil area 6m x 16.8m preserved",
      assert: (p) => p.quote.internal_notes.some((n) => /6m\s*x\s*16\.8m/i.test(n)),
      actual: (p) => `internal_notes=${JSON.stringify(p.quote.internal_notes)}`,
    },
    {
      label: "optional Ficus hedge kept as optional works",
      assert: (p) => p.quote.optional_quotes.some((o) => o.scope.some((s) => /ficus/i.test(s))),
      actual: (p) => `optional=${JSON.stringify(p.quote.optional_quotes.map((o) => o.quote_title))}`,
    },
  ],
  expectedMatchedLineItems: [
    {
      label: "no decking artefacts in matched lines",
      mustNotContain: ["Decking boards", "Deck area"],
    },
  ],
  expectedAudit: {
    kind: "issues",
    // Resolved by QA-3: false decking path, decking scope leak, missing
    // topsoil/lawn scope, dropped suburb.
    mustNotInclude: [
      "V04-decking-on-non-decking",
      "V06-decking-scope-leak",
      "V06-missing-topsoil-lawn-scope",
      "V06-missing-lawn-seed",
      "V08-suburb-missing",
      "V03-missing-labour-export-line",
    ],
  },
  knownFailures: [
    "Topsoil VOLUME (6 × 16.8 × 0.05 = 5.04m³) is noted internally but not yet computed by a calculator.",
    "Lawn seed spoken price $129 is kept in internal notes but not yet mapped to a priced line item.",
    "Optional Ficus hedge has no plant-count/spacing calculation yet (V06-optional-hedge-unwarned still fires by design).",
    "Retaining post spacing / drainage requirement not yet captured or warned.",
  ],
  buildProcessedQuote,
}
