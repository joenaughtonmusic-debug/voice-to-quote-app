import assert from "node:assert/strict"
import test from "node:test"

import { calculateSoilVolume, extractSoilVolumeFromText } from "./soil-volume"
import { calculateLawnEstablishment, extractLawnSeedFact } from "./lawn-establishment"

const ADAM_TRANSCRIPT = `Okay, this is a quote for Client B at 20 Poplar Street in Titirangi. So the main job is levelling the back lawn. Before we do that though, we need to construct a small timber retaining wall, approximately 400mm high, using two 200x50 retaining timbers with 100x100 timber posts along that length. Once we've installed the retaining wall, we can then look to put down a whole bunch of topsoil. So we're looking at doing a 50mm depth across the area, and the area is approximately 6m by 16.8m. And we also need to have a count for some lawn seed, but we'll just use the cheap lawn seed. I imagine a 5kg bag, $129 for the bag.`

// ── soil volume ──────────────────────────────────────────────────────────────

test("calculateSoilVolume: 6 × 16.8 × 50mm = 100.8m² / 5.04m³", () => {
  const result = calculateSoilVolume({ lengthM: 6, widthM: 16.8, depthMm: 50, material: "topsoil" })
  assert.equal(result.areaM2, 100.8)
  assert.equal(result.depthM, 0.05)
  assert.equal(result.volumeM3, 5.04)
  assert.equal(result.material, "topsoil")
  assert.equal(result.orderVolumeM3, 6) // ceil(5.04) for ordering with waste
})

test("extractSoilVolumeFromText: Client B transcript returns 100.8m² / 5.04m³ topsoil", () => {
  const result = extractSoilVolumeFromText(ADAM_TRANSCRIPT)
  assert.ok(result, "must extract a soil volume result")
  assert.equal(result!.areaM2, 100.8)
  assert.equal(result!.volumeM3, 5.04)
  assert.equal(result!.material, "topsoil")
})

test("extractSoilVolumeFromText: handles '50 mm depth' with a space", () => {
  const result = extractSoilVolumeFromText("Spread topsoil at 50 mm depth over an area 6m by 16.8m.")
  assert.ok(result)
  assert.equal(result!.volumeM3, 5.04)
})

test("extractSoilVolumeFromText: wall HEIGHT '400mm high' is not treated as spread depth", () => {
  // No spread depth stated → no volume, even though a mm figure exists.
  const result = extractSoilVolumeFromText("Build a retaining wall 400mm high. Spread topsoil over 6m by 16.8m.")
  assert.equal(result, null, "400mm high must not be read as a topsoil depth")
})

test("extractSoilVolumeFromText: does not fire on decking text", () => {
  assert.equal(extractSoilVolumeFromText("Build a 4m x 5m pine deck with 50mm deep footings."), null)
})

test("extractSoilVolumeFromText: does not fire on planting text without soil+depth", () => {
  assert.equal(extractSoilVolumeFromText("Plant Michelia gracipes hedge 14.2 metres long at 50cm spacing."), null)
})

// ── lawn seed price ──────────────────────────────────────────────────────────

test("extractLawnSeedFact: '5kg bag, $129 for the bag' → 1 bag, 5kg, $129 spoken", () => {
  const fact = extractLawnSeedFact(ADAM_TRANSCRIPT)
  assert.ok(fact)
  assert.equal(fact!.item, "lawn seed")
  assert.equal(fact!.quantity, 1)
  assert.equal(fact!.unit, "bag")
  assert.equal(fact!.size, "5kg")
  assert.equal(fact!.rate, 129)
  assert.equal(fact!.source, "spoken")
})

test("extractLawnSeedFact: 5kg is NOT read as a $5 price", () => {
  const fact = extractLawnSeedFact("Use lawn seed, a 5kg bag.")
  assert.ok(fact)
  assert.equal(fact!.size, "5kg")
  assert.notEqual(fact!.rate, 5)
  assert.equal(fact!.rate, null, "no explicit $ price → rate stays null, not $5")
  assert.equal(fact!.source, "unpriced")
})

test("extractLawnSeedFact: returns null when lawn seed is not mentioned", () => {
  assert.equal(extractLawnSeedFact("Spread topsoil over 6m by 16.8m at 50mm depth."), null)
})

// ── composed ─────────────────────────────────────────────────────────────────

test("calculateLawnEstablishment: Client B transcript yields topsoil 5.04m³ and lawn seed $129", () => {
  const result = calculateLawnEstablishment(ADAM_TRANSCRIPT)
  assert.equal(result.topsoil?.areaM2, 100.8)
  assert.equal(result.topsoil?.volumeM3, 5.04)
  assert.equal(result.lawnSeed?.size, "5kg")
  assert.equal(result.lawnSeed?.rate, 129)
})
