import assert from "node:assert/strict"
import test from "node:test"
import { chunkLandscapingTranscript, type WorkChunk } from "./chunker"

const DRIVEWAY_JOB =
  "Along the driveway we'll lay weed mat then bark mulch, then timber edging down both sides. " +
  "Plant 18m of carex along the driveway edge."

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

test("driveway job splits into weed mat / bark / edging / planting, in order", () => {
  const chunks = chunkLandscapingTranscript(DRIVEWAY_JOB)
  assert.deepEqual(
    chunks.map((c) => c.work_type),
    ["weed_mat", "mulch_bark", "edging", "planting"],
  )
  // Each section keeps its own text.
  assert.match(chunks[0].source_text, /weed mat/i)
  assert.match(chunks[1].source_text, /bark mulch/i)
  assert.match(chunks[2].source_text, /timber edging/i)
  assert.match(chunks[3].source_text, /carex/i)
})

test("no text is lost: chunk source words reconstruct the transcript in order", () => {
  const chunks = chunkLandscapingTranscript(DRIVEWAY_JOB)
  const joined = chunks.map((c) => c.source_text).join(" ")
  assert.deepEqual(words(joined), words(DRIVEWAY_JOB))
})

test("different work types are never merged into one chunk", () => {
  const chunks = chunkLandscapingTranscript(DRIVEWAY_JOB)
  const types = chunks.map((c) => c.work_type)
  assert.equal(new Set(types).size, types.length, "each chunk should be a distinct work type here")
})

test("same work type mentioned twice coalesces (not fragmented), different types stay split", () => {
  const chunks = chunkLandscapingTranscript("Plant carex along the fence. Then plant buxus by the path. Then lay bark mulch.")
  assert.deepEqual(
    chunks.map((c) => c.work_type),
    ["planting", "mulch_bark"],
  )
})

test("nothing recognised -> one low-confidence 'other' chunk with the full text (surfaced, not dropped)", () => {
  const text = "Have a chat with the client about the budget and timing."
  const chunks = chunkLandscapingTranscript(text)
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].work_type, "other")
  assert.equal(chunks[0].confidence, "low")
  assert.deepEqual(words(chunks[0].source_text), words(text))
})

test("empty transcript -> no chunks", () => {
  assert.deepEqual(chunkLandscapingTranscript(""), [])
  assert.deepEqual(chunkLandscapingTranscript("   \n  "), [])
})

test("messy real dictation: excavation caught, no bogus fencing from a location, dripline stays irrigation", () => {
  const messy =
    "Okay so at 12 Bayview the front strip needs the old lawn dug out and removed. " +
    "Then lay weedmat over the whole bed. On top we want about 4 cubes of bark. " +
    "Down the fence line plant a griselinia hedge, roughly 15 metres. " +
    "Put timber edging between the lawn and the new bed. And theyll want a dripline through the planting."
  const chunks = chunkLandscapingTranscript(messy)
  assert.deepEqual(
    chunks.map((c) => c.work_type),
    ["excavation", "weed_mat", "mulch_bark", "planting", "edging", "irrigation"],
  )
  // "down the fence line" is a location, not fencing work.
  assert.equal(chunks.some((c) => c.work_type === "fencing"), false)
  // No text lost.
  assert.deepEqual(words(chunks.map((c) => c.source_text).join(" ")), words(messy))
})

test("deterministic: same transcript -> identical chunks (ignoring generated ids) across 100 runs", () => {
  const strip = (chunks: WorkChunk[]) => chunks.map(({ id, ...rest }) => rest)
  const first = strip(chunkLandscapingTranscript(DRIVEWAY_JOB))
  for (let i = 0; i < 100; i++) {
    assert.deepEqual(strip(chunkLandscapingTranscript(DRIVEWAY_JOB)), first)
  }
})
