import assert from "node:assert/strict"
import test from "node:test"
import { calculatePlantingQuote, extractPlantCalculatorRequestsFromText } from "./index"

// ---------------------------------------------------------------------------
// L0 determinism proof.
//
// Core principle (CLAUDE.md): "AI interprets language; deterministic code
// performs calculations." Same transcript -> same numbers, run-to-run.
//
// This test runs the full text -> requests -> planting quote path many times
// over representative transcripts (including a mixed driveway landscaping job)
// and asserts every run produces byte-identical output. It guards against any
// nondeterminism creeping into the extractor or calculator (Set/Map ordering,
// unstable sorts, Date/Math.random, etc.) as we harden the planting path.
// ---------------------------------------------------------------------------

const RUNS = 100

// Phrasings below are drawn from the shapes the extractor is known to handle
// (see lib/plants/index.test.ts and the michelia golden fixture). Each MUST
// produce at least one planting request — the guard test below enforces that,
// so this proof can never silently pass on empty output.
const TRANSCRIPTS: { name: string; text: string }[] = [
  {
    name: "single hedge by length",
    text: "Install approximately 11.5 metres of Ficus Tuffi hedge.",
  },
  {
    name: "two requests: length + quantity",
    text: "Plant 12m of Ficus Tuffi hedge. Also plant 20 Lomandra Lime Tuff along the driveway.",
  },
  {
    name: "rich transcript with spoken spacing + options (michelia)",
    text:
      "This is a planting quote for the front garden bed.\n" +
      "The planting area is approximately 14.2 metres long.\n" +
      "The plant she wanted was Michelia gracipes.\n" +
      "Plant spacing should be 50 centimetres.\n" +
      "Allow 5 bags of garden mix.",
  },
  {
    name: "mixed driveway job (planting amid non-plant noise)",
    text:
      "Along the driveway we'll lay weed mat then bark mulch, then timber edging down both sides. " +
      "Plant 18m of Carex hedge along the driveway edge.",
  },
]

function snapshot(text: string) {
  const requests = extractPlantCalculatorRequestsFromText(text)
  const quotes = requests.map((request) => calculatePlantingQuote(request))
  // Stable JSON: object key order from the calculator is itself deterministic,
  // so a plain stringify is a faithful fingerprint of the whole result.
  return JSON.stringify({ requests, quotes })
}

for (const { name, text } of TRANSCRIPTS) {
  test(`deterministic across ${RUNS} runs: ${name}`, () => {
    // Guard: a proof over empty output proves nothing. Every transcript here
    // must extract at least one planting request.
    const requests = extractPlantCalculatorRequestsFromText(text)
    assert.ok(
      requests.length > 0,
      `transcript "${name}" extracted no planting requests — determinism proof would be vacuous`,
    )
    const first = snapshot(text)
    for (let i = 1; i < RUNS; i++) {
      assert.equal(snapshot(text), first, `run ${i} differed from run 0`)
    }
  })
}

test("cross-transcript isolation: order of evaluation does not change results", () => {
  // Running transcripts forward then backward must not change any single result
  // (guards against shared mutable state between calls).
  const forward = TRANSCRIPTS.map(({ text }) => snapshot(text))
  const backward = [...TRANSCRIPTS].reverse().map(({ text }) => snapshot(text))
  TRANSCRIPTS.forEach(({ name }, i) => {
    assert.equal(
      forward[i],
      backward[TRANSCRIPTS.length - 1 - i],
      `result for "${name}" depended on evaluation order`,
    )
  })
})
