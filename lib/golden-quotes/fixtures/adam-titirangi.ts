import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import type { GoldenQuoteFixture } from "../contracts"

const TRANSCRIPT = `Okay, this is a quote for Adam at 20 Lemnos Street in Titirangi. So the main job is levelling the back lawn. Before we do that though, we need to construct a small timber retaining wall, approximately 400mm high, using two 200x50 retaining timbers with 100x100 timber posts along that length. And we also need to install some polythene along the fence to protect the fence. Once we've installed the retaining wall, we can then look to put down a whole bunch of topsoil. So we're looking at doing a 50mm depth across the area, and the area is approximately 6m by 16.8m. And the retaining wall is going to sit 900mm off the fence, and the length is going to be 16.8m for the retaining wall. And it would be great to also have the option for lawn mix to go on top of the area, but in the actual quote we'll use topsoil. And we also need to have a count for some lawn seed, but we'll just use the cheap lawn seed. I imagine a 5kg bag, $129 for the bag, and it would be great if you could also do an optional price for planting a Ficus Tuffi hedge along the fence with roughly one metre sized plants, and the labour for that being two people one day.`

/**
 * MOCKED BOUNDARY + DELIBERATELY CAPTURING CURRENT BAD OUTPUT.
 *
 * This fixture does NOT represent the desired quote. It encodes the current
 * broken output documented in docs/QUOTE_ENGINE_RELIABILITY_GOAL.md §7 Golden
 * Quote 3: false decking path, "Deck area 1", "Decking boards", missing topsoil,
 * suburb Titirangi dropped, lawn seed $129 lost, Ficus hedge un-calculated.
 *
 * The contract below asserts these bugs are STILL PRESENT so the golden suite is
 * green today and turns RED the moment the pipeline improves — at which point the
 * fixture must be rewritten to the desired contract. `knownFailures` lists the
 * desired outcomes that are currently violated and the validators (V04/V08) that
 * would be needed to auto-detect them.
 */
function buildProcessedQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Adam",
    // BUG: suburb "Titirangi" dropped from the extracted address.
    site_address: "20 Lemnos Street",
    // BUG: misclassified — decking calculator fired on a lawn/retaining job.
    quote_title: "Retaining Wall Quote",
    job_type: "decking",
    primary_quote: {
      quote_title: "Retaining Wall Quote",
      job_type: "decking",
      cadence: "",
      scope: [
        // BUG: nonsense decking scope generated from a planting/lawn job.
        "Plant multiple Deck area 1 along deck area 1.",
        "Construct small timber retaining wall approximately 400mm high.",
        // NOTE: topsoil / lawn establishment is entirely absent (BUG).
      ],
      notes: [],
    },
    optional_quotes: [
      {
        quote_title: "Optional Ficus Tuffi hedge",
        job_type: "planting",
        cadence: "",
        // BUG: hedge captured but no plant count / spacing / labour warning.
        scope: ["Plant a Ficus Tuffi hedge along the fence."],
        notes: [],
      },
    ],
    customer_scope: [
      "Plant multiple Deck area 1 along deck area 1.",
      "Construct small timber retaining wall approximately 400mm high.",
    ],
    materials: ["Decking boards"],
    labour_allowance: "",
    line_items: [
      {
        // BUG: bogus decking line on a lawn levelling job.
        item_code: "",
        item_name: "Decking boards",
        item_type: "material",
        description: "Decking boards",
        quantity: "100.8",
        unit: "m2",
        rate: null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: null,
        total: null,
        match_confidence: "low",
        match_reason: "Decking calculator fired — no decking in transcript.",
        needs_review: true,
        warning: "Rate missing",
      },
    ],
    // NOTE: no topsoil line, no lawn seed $129 line — both dropped (BUG).
  }
}

export const adamTitirangi: GoldenQuoteFixture = {
  name: "Golden Quote 3 — Adam / Titirangi (captures current failures)",
  transcript: TRANSCRIPT,
  mockingNotes:
    "HAND-AUTHORED current-bad state (route not run). Encodes documented bugs. Contract asserts the bugs persist so the suite goes red when the pipeline is fixed.",
  // "Expected" here means "current actual" — the job is MISclassified as decking.
  expectedClassification: /decking/i,
  // The customer-facing "Deck area 1 / Plant multiple Deck area 1" leak is a
  // route-pipeline artifact that cannot be faithfully reproduced from a stubbed
  // ProcessedQuote (the real assembly renderer rewrites the scope). It is locked
  // at the data layer below (bogus Decking boards line) and via knownFailures.
  customerPreviewContains: [],
  // Locks that the desired content is currently MISSING (flips when fixed).
  customerPreviewMustNotContain: ["topsoil", "Titirangi"],
  internalFacts: [
    {
      label: "BUG: suburb Titirangi not captured in address",
      assert: (p) => !/titirangi/i.test(p.quote.site_address),
      actual: (p) => `site_address="${p.quote.site_address}"`,
    },
    {
      label: "BUG: topsoil volume 5.04m³ not calculated anywhere",
      assert: (p) =>
        !/5\.04|topsoil/i.test(
          [p.quote.primary_quote.scope.join(" "), p.jmsLines.join(" "), p.quote.materials.join(" ")].join(" "),
        ),
      actual: (p) => `scope+jms+materials mention topsoil: ${/topsoil/i.test(p.quote.primary_quote.scope.join(" "))}`,
    },
    {
      label: "BUG: lawn seed $129 spoken price not preserved on any line",
      assert: (p) => !p.quote.line_items.some((i) => i.total === "129" || i.rate === "129"),
      actual: (p) => `line totals=${JSON.stringify(p.quote.line_items.map((i) => i.total))}`,
    },
    {
      label: "BUG: bogus Decking boards line present",
      assert: (p) => p.quote.line_items.some((i) => /decking/i.test(i.item_name)),
      actual: (p) => `line item names=${JSON.stringify(p.quote.line_items.map((i) => i.item_name))}`,
    },
  ],
  expectedMatchedLineItems: [
    {
      label: "bogus decking line (current bug)",
      mustContain: ["Decking boards", "100.8"],
    },
  ],
  // The Quote Auditor now DETECTS these failures (QA-2): V04 flags the false
  // decking path, V06 flags the decking-scope leak + missing topsoil/lawn scope,
  // V08 flags the dropped suburb. Detection ≠ fix — the quote is still wrong.
  expectedAudit: {
    kind: "issues",
    mustInclude: [
      "V04-decking-on-non-decking",
      "V06-decking-scope-leak",
      "V06-missing-topsoil-lawn-scope",
      "V08-suburb-missing",
    ],
    mustNotInclude: ["V03-missing-labour-export-line"],
    statusIsNot: "pass",
  },
  knownFailures: [
    "DETECTED (V04): decking output on a lawn/retaining transcript — still needs the classifier fixed so it never fires.",
    "DETECTED (V08): suburb 'Titirangi' dropped from the address — still needs address extraction to capture it.",
    "DETECTED (V06): topsoil/lawn establishment absent — still needs a topsoil/soil-volume calculator (5.04m³) and scope.",
    "PARTIAL (V06): lawn seed omitted is flagged, but spoken price $129 still needs pricing-fact → line-item mapping.",
    "PARTIAL (V06): optional Ficus hedge flagged as un-warned, but still needs an actual plant-count/spacing calculation.",
  ],
  buildProcessedQuote,
}
