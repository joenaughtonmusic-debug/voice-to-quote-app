import assert from "node:assert/strict"
import test from "node:test"

import {
  refineMixedLandscapingClassification,
  transcriptMentionsNonPlantingStructuralTrade,
  type QuoteClassification,
} from "./quote-classification"

// AI-0 mixed-trade guard — pure, deterministic, no OpenAI.

const planting: QuoteClassification = { specialist: "planting", reason: "planting job" }

const SARAH =
  "Quote for Sarah at 44a Amy Street, Ellerslie. 11.5m lower planting area. Ficus Tuffi 25L and 45L. " +
  "Lower paver area: 1.5m x 3.5m. Upper planting area: 13.7m hedge row. Include hard fill / removal of old soil. Include 6 bags garden mix."

// Michelia / Client A style: pure planting with a timber board border (planting-adjacent edging).
const MICHELIA =
  "This is a planting quote for the front garden bed. The planting area is approximately 14.2 metres long. " +
  "The plant she wanted was Michelia gracipes. Plant spacing should be 50 centimetres. " +
  "Optional work: Install a 150x50 timber board border around the planting area."

test("structural-trade detector matches paver/paving/retaining wall/decking/hard fill", () => {
  assert.equal(transcriptMentionsNonPlantingStructuralTrade("Lower paver area: 1.5m x 3.5m"), true)
  assert.equal(transcriptMentionsNonPlantingStructuralTrade("some paving out the front"), true)
  assert.equal(transcriptMentionsNonPlantingStructuralTrade("construct a retaining wall"), true)
  assert.equal(transcriptMentionsNonPlantingStructuralTrade("new decking over the patio"), true)
  assert.equal(transcriptMentionsNonPlantingStructuralTrade("include hard fill"), true)
})

test("structural-trade detector does NOT match planting-adjacent edging (no over-trigger)", () => {
  // Timber board border around a planting bed is planting-adjacent, not a distinct trade.
  assert.equal(transcriptMentionsNonPlantingStructuralTrade("Install a 150x50 timber board border"), false)
  assert.equal(transcriptMentionsNonPlantingStructuralTrade("plant a hedge with garden mix and topsoil"), false)
  assert.equal(transcriptMentionsNonPlantingStructuralTrade(MICHELIA), false)
})

test("mixed planting + paver job is re-routed to landscaping", () => {
  const refined = refineMixedLandscapingClassification(planting, SARAH)
  assert.equal(refined.specialist, "landscaping")
  assert.match(refined.reason, /Mixed landscaping/i)
})

test("pure planting job with a timber border stays planting (Michelia/Client A safe)", () => {
  const refined = refineMixedLandscapingClassification(planting, MICHELIA)
  assert.equal(refined.specialist, "planting")
})

test("guard only overrides planting — other classifications pass through unchanged", () => {
  // A landscaping/maintenance/etc. job with a paver is not re-touched by this guard.
  const maintenance: QuoteClassification = { specialist: "maintenance", reason: "monthly" }
  assert.strictEqual(refineMixedLandscapingClassification(maintenance, SARAH), maintenance)
  const landscaping: QuoteClassification = { specialist: "landscaping", reason: "landscaping" }
  assert.strictEqual(refineMixedLandscapingClassification(landscaping, SARAH), landscaping)
})

test("planting job with no structural trade is returned unchanged (identity, no allocation)", () => {
  assert.strictEqual(refineMixedLandscapingClassification(planting, "plant a 14.2m Michelia hedge"), planting)
})
