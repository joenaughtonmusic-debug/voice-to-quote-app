import { calculateLawnEstablishment } from "../../calculators/lawn-establishment"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import type { GoldenQuoteFixture } from "../contracts"

const TRANSCRIPT = `Okay, this is a quote for Client B at 20 Poplar Street in Titirangi. So the main job is levelling the back lawn. Before we do that though, we need to construct a small timber retaining wall, approximately 400mm high, using two 200x50 retaining timbers with 100x100 timber posts along that length. And we also need to install some polythene along the fence to protect the fence. Once we've installed the retaining wall, we can then look to put down a whole bunch of topsoil. So we're looking at doing a 50mm depth across the area, and the area is approximately 6m by 16.8m. And the retaining wall is going to sit 900mm off the fence, and the length is going to be 16.8m for the retaining wall. And it would be great to also have the option for lawn mix to go on top of the area, but in the actual quote we'll use topsoil. And we also need to have a count for some lawn seed, but we'll just use the cheap lawn seed. I imagine a 5kg bag, $129 for the bag, and it would be great if you could also do an optional price for planting a Ficus Tuffi hedge along the fence with roughly one metre sized plants, and the labour for that being two people one day.`

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
 * QA-4: topsoil volume (100.8m²/5.04m³) and the lawn-seed bag price ($129) are
 * now computed by real calculators (lib/calculators/soil-volume.ts +
 * lawn-establishment.ts) and carried on line items + internal notes. Customer
 * preview stays clean (no measured maths). KB item mapping for those lines and
 * the hedge plant-count calc remain future work (knownFailures).
 */
function buildProcessedQuote(): ProcessedQuote {
  // Real deterministic calculators (QA-4) — topsoil 100.8m²/5.04m³, lawn seed $129.
  const { topsoil, lawnSeed } = calculateLawnEstablishment(TRANSCRIPT)

  return {
    ...EMPTY_PROCESSED_QUOTE,
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
      // Computed by the real soil-volume calculator (QA-4).
      `Topsoil area: 6m x 16.8m = ${topsoil?.areaM2 ?? "?"}m²; depth 50mm; volume ${topsoil?.volumeM3 ?? "?"}m³ before waste/rounding.`,
      `Lawn seed: ${lawnSeed?.size ?? "?"} bag; spoken price $${lawnSeed?.rate ?? "?"}.`,
      "Optional Ficus Tuffi hedge along fence; roughly 1m plants; optional labour 2 people x 1 day.",
    ],
    // No decking line items — the decking detector no longer fires (QA-3 fix).
    // Topsoil + lawn seed lines carry the computed quantity/price; item mapping
    // is left for a future KB batch (needs_review), but the facts are preserved.
    line_items: [
      {
        item_code: "",
        item_name: "Topsoil",
        item_type: "material",
        description: `Import and spread topsoil — ${topsoil?.areaM2 ?? "?"}m² × 50mm`,
        quantity: topsoil ? String(topsoil.volumeM3) : null,
        unit: "m3",
        rate: null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: null,
        total: null,
        match_confidence: "none",
        match_reason: "Topsoil volume calculated from area × depth; no KB item matched.",
        needs_review: true,
        warning: "Rate missing — no KB topsoil item matched",
      },
      {
        item_code: "",
        item_name: `Lawn seed (${lawnSeed?.size ?? "5kg"} bag)`,
        item_type: "material",
        description: "Lawn seed — cheap grade, spoken price preserved",
        quantity: "1",
        unit: "bag",
        rate: lawnSeed?.rate != null ? String(lawnSeed.rate) : null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: lawnSeed?.rate != null ? String(lawnSeed.rate) : null,
        total: lawnSeed?.rate != null ? String(lawnSeed.rate) : null,
        match_confidence: "low",
        match_reason: "Spoken bag price preserved; no KB lawn seed item matched.",
        needs_review: true,
        warning: "Item mapping missing — spoken price used",
      },
    ],
  }
}

// ── Pipeline-backed inputs (QA-7) ────────────────────────────────────────────
// Mocked AI extraction (raw output, BEFORE deterministic post-processing) for the
// pipeline-backed path. It carries the mixed-landscaping scope + the topsoil/lawn
// material line items (still supplied by the recorded extraction — wiring those
// calculators into the LIVE pipeline is QA-8, not QA-7).
//
// This pipeline-backed fixture now reaches full parity with the QA-3 hand-built
// desired state. QA-8 kept job_type `general_landscaping` (retaining is only a
// sub-component) and preserved the `Titirangi` suburb; QA-9 stopped the planting
// calculator fabricating a planting area from the retaining wall's "16.8m", so the
// customer preview uses the mixed-landscaping assembly renderer (retaining wall,
// polythene, topsoil, lawn seed all present) and the optional Ficus hedge stays as
// optional scope text with no fabricated plant count. See the pipeline-backed test,
// which asserts the full contract passes.
function clientBExtractedQuote() {
  const { topsoil, lawnSeed } = calculateLawnEstablishment(TRANSCRIPT)
  return {
    ...EMPTY_PROCESSED_QUOTE,
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
      `Topsoil area: 6m x 16.8m = ${topsoil?.areaM2 ?? "?"}m²; depth 50mm; volume ${topsoil?.volumeM3 ?? "?"}m³ before waste/rounding.`,
      `Lawn seed: ${lawnSeed?.size ?? "?"} bag; spoken price $${lawnSeed?.rate ?? "?"}.`,
      "Optional Ficus Tuffi hedge along fence; roughly 1m plants; optional labour 2 people x 1 day.",
    ],
    line_items: [
      {
        item_code: "",
        item_name: "Topsoil",
        item_type: "material",
        description: `Import and spread topsoil — ${topsoil?.areaM2 ?? "?"}m² × 50mm`,
        quantity: topsoil ? String(topsoil.volumeM3) : null,
        unit: "m3",
        rate: null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: null,
        total: null,
        match_confidence: "none",
        match_reason: "Topsoil volume calculated from area × depth; no KB item matched.",
        needs_review: true,
        warning: "Rate missing — no KB topsoil item matched",
      },
      {
        item_code: "",
        item_name: `Lawn seed (${lawnSeed?.size ?? "5kg"} bag)`,
        item_type: "material",
        description: "Lawn seed — cheap grade, spoken price preserved",
        quantity: "1",
        unit: "bag",
        rate: lawnSeed?.rate != null ? String(lawnSeed.rate) : null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: lawnSeed?.rate != null ? String(lawnSeed.rate) : null,
        total: lawnSeed?.rate != null ? String(lawnSeed.rate) : null,
        match_confidence: "low",
        match_reason: "Spoken bag price preserved; no KB lawn seed item matched.",
        needs_review: true,
        warning: "Item mapping missing — spoken price used",
      },
    ],
  }
}

export const clientBTitirangi: GoldenQuoteFixture = {
  name: "Golden Quote 3 — Client B / Titirangi (mixed landscaping)",
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
      label: "topsoil area calculated as 100.8m²",
      assert: (p) => p.quote.internal_notes.some((n) => /100\.8m²/.test(n)),
      actual: (p) => `internal_notes=${JSON.stringify(p.quote.internal_notes)}`,
    },
    {
      label: "topsoil volume calculated as 5.04m³",
      assert: (p) =>
        p.quote.internal_notes.some((n) => /5\.04m³/.test(n)) ||
        p.quote.line_items.some((i) => /topsoil/i.test(i.item_name) && i.quantity === "5.04"),
      actual: (p) =>
        `topsoil qty=${JSON.stringify(p.quote.line_items.filter((i) => /topsoil/i.test(i.item_name)).map((i) => i.quantity))}`,
    },
    {
      label: "lawn seed preserves 5kg bag and $129",
      assert: (p) =>
        p.quote.line_items.some(
          (i) => /lawn seed/i.test(i.item_name) && /5kg/i.test(i.item_name) && i.rate === "129",
        ),
      actual: (p) =>
        `lawn seed line=${JSON.stringify(
          p.quote.line_items.filter((i) => /lawn seed/i.test(i.item_name)).map((i) => ({ name: i.item_name, rate: i.rate })),
        )}`,
    },
    {
      label: "5kg is not misread as a $5 rate",
      assert: (p) => !p.quote.line_items.some((i) => /lawn seed/i.test(i.item_name) && i.rate === "5"),
      actual: (p) => `lawn seed rates=${JSON.stringify(p.quote.line_items.filter((i) => /lawn seed/i.test(i.item_name)).map((i) => i.rate))}`,
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
    {
      label: "topsoil volume line",
      mustContain: ["Topsoil", "Qty 5.04 m3"],
    },
    {
      label: "lawn seed priced line",
      mustContain: ["Lawn seed (5kg bag)", "Qty 1 bag", "Total 129"],
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
      // The optional Ficus hedge IS represented in optional works, so the general
      // V06 optional-work check must not fire. The fixture-specific expectation that
      // this optional work is the Ficus hedge (and still needs a plant count) lives
      // in the internalFacts / knownFailures below, not in the general validator.
      "V06-optional-work-missing",
      "V08-suburb-missing",
      "V03-missing-labour-export-line",
    ],
  },
  knownFailures: [
    "Topsoil + lawn seed lines carry the computed quantity/price but have no KB item mapping (needs_review) — resolved when the KB/price-list batch lands.",
    "Optional Ficus hedge has no plant-count/spacing calculation yet (kept as optional scope text; no fabricated count by design).",
    "Retaining post spacing / drainage requirement not yet captured or warned.",
  ],
  buildProcessedQuote,
  pipeline: {
    extractedQuote: clientBExtractedQuote(),
    // A per-hour landscaping labour KB item so the optional Ficus hedge labour gets a
    // rate (recoveryBestRate) and becomes a priced optional work (Slice 3a/3b). It has
    // no effect on main labour: plan.main.sourceText carries no labour phrase, so no
    // main labour line is created.
    knowledgeItems: [
      {
        item_code: "LAB-001",
        item_name: "Landscaping Labour",
        item_type: "labour",
        unit: "hours",
        sell_price: 110,
        aliases: ["labour", "landscaping labour"],
      },
    ],
    classification: { specialist: "landscaping", reason: "test-injected landscaping classification" },
  },
}
