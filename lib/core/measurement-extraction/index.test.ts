import assert from "node:assert/strict"
import test from "node:test"
import { extractMeasurements } from "./index"

test("extracts exact dimension pair measurements with high confidence", () => {
  const result = extractMeasurements("Build a deck 4m x 5m")

  assert.equal(result.confidence, "high")
  assert.equal(result.measurements.length, 2)
  assert.deepEqual(
    result.measurements.map((measurement) => [measurement.value, measurement.unit, measurement.dimension, measurement.confidence]),
    [
      [4, "m", "length", "high"],
      [5, "m", "width", "high"],
    ],
  )
  assert.equal(result.notices.length, 0)
})

test("marks approximate measurements with lower confidence and review notice", () => {
  const result = extractMeasurements("Deck about 5 metres wide")

  assert.equal(result.confidence, "medium")
  assert.equal(result.measurements.length, 1)
  assert.equal(result.measurements[0].value, 5)
  assert.equal(result.measurements[0].unit, "m")
  assert.equal(result.measurements[0].dimension, "width")
  assert.equal(result.measurements[0].approximate, true)
  assert.equal(result.measurements[0].confidence, "medium")
  assert.equal(result.notices.some((notice) => /approximate/i.test(notice.message)), true)
})

test("marks uncertain measurements with low confidence and warning notice", () => {
  const result = extractMeasurements("Maybe 10m long")

  assert.equal(result.confidence, "low")
  assert.equal(result.measurements.length, 1)
  assert.equal(result.measurements[0].value, 10)
  assert.equal(result.measurements[0].unit, "m")
  assert.equal(result.measurements[0].dimension, "length")
  assert.equal(result.measurements[0].uncertain, true)
  assert.equal(result.measurements[0].confidence, "low")
  assert.equal(result.notices.some((notice) => notice.severity === "warning" && /uncertain/i.test(notice.message)), true)
})

test("extracts mixed measurements and infers high millimetres where unit is omitted", () => {
  const result = extractMeasurements("Retaining wall roughly 10 metres long and 800 high")

  assert.equal(result.confidence, "medium")
  assert.equal(result.measurements.length, 2)
  assert.deepEqual(
    result.measurements.map((measurement) => [
      measurement.value,
      measurement.unit,
      measurement.normalized_value_m,
      measurement.dimension,
      measurement.approximate,
      measurement.unit_inferred,
    ]),
    [
      [10, "m", 10, "length", true, false],
      [800, "mm", 0.8, "height", true, true],
    ],
  )
  assert.equal(result.notices.some((notice) => /inferred or missing unit/i.test(notice.message)), true)
})

test("returns empty result when no measurements are present", () => {
  const result = extractMeasurements("Install six downlights and two power points.")

  assert.equal(result.confidence, "low")
  assert.deepEqual(result.measurements, [])
  assert.deepEqual(result.notices, [])
})
