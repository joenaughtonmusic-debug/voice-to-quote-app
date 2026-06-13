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
  assert.equal(result.notices.some((notice) => /Assumed 800 means 800mm\. Please verify\./i.test(notice.message)), true)
})

test("infers millimetres for bare construction length and width dimensions", () => {
  const result = extractMeasurements("Deck comes out 1400 and across 5400")

  assert.equal(result.confidence, "medium")
  assert.deepEqual(
    result.measurements.map((measurement) => [
      measurement.value,
      measurement.unit,
      measurement.normalized_value_m,
      measurement.dimension,
      measurement.confidence,
      measurement.unit_inferred,
    ]),
    [
      [1400, "mm", 1.4, "depth", "medium", true],
      [5400, "mm", 5.4, "width", "medium", true],
    ],
  )
  assert.equal(result.notices.some((notice) => /Assumed 1400 means 1400mm\. Please verify\./i.test(notice.message)), true)
  assert.equal(result.notices.some((notice) => /Assumed 5400 means 5400mm\. Please verify\./i.test(notice.message)), true)
})

test("infers millimetres for bare construction height context", () => {
  const result = extractMeasurements("Deck sits above ground at 800")

  assert.equal(result.confidence, "medium")
  assert.equal(result.measurements.length, 1)
  assert.equal(result.measurements[0].value, 800)
  assert.equal(result.measurements[0].unit, "mm")
  assert.equal(result.measurements[0].normalized_value_m, 0.8)
  assert.equal(result.measurements[0].dimension, "height")
  assert.equal(result.measurements[0].confidence, "medium")
  assert.equal(result.measurements[0].unit_inferred, true)
  assert.equal(result.notices.some((notice) => /Assumed 800 means 800mm\. Please verify\./i.test(notice.message)), true)
})

test("infers millimetres for bare high fence dimensions", () => {
  const result = extractMeasurements("1800 high fence")

  assert.equal(result.confidence, "medium")
  assert.equal(result.measurements.length, 1)
  assert.equal(result.measurements[0].value, 1800)
  assert.equal(result.measurements[0].unit, "mm")
  assert.equal(result.measurements[0].normalized_value_m, 1.8)
  assert.equal(result.measurements[0].dimension, "height")
  assert.equal(result.measurements[0].confidence, "medium")
  assert.equal(result.measurements[0].unit_inferred, true)
})

test("keeps explicit metres while inferring nearby bare construction height", () => {
  const result = extractMeasurements("10m long and 800 high")

  assert.deepEqual(
    result.measurements.map((measurement) => [
      measurement.value,
      measurement.unit,
      measurement.normalized_value_m,
      measurement.dimension,
      measurement.unit_inferred,
    ]),
    [
      [10, "m", 10, "length", false],
      [800, "mm", 0.8, "height", true],
    ],
  )
})

test("explicit unit wins over construction millimetre inference", () => {
  const result = extractMeasurements("1400m")

  assert.equal(result.confidence, "high")
  assert.equal(result.measurements.length, 1)
  assert.equal(result.measurements[0].value, 1400)
  assert.equal(result.measurements[0].unit, "m")
  assert.equal(result.measurements[0].normalized_value_m, 1400)
  assert.equal(result.measurements[0].unit_inferred, false)
  assert.deepEqual(result.notices, [])
})

test("infers millimetres for spoken construction-number phrases", () => {
  const result = extractMeasurements("Deck comes fourteen hundred out from the house, fifty four hundred across, and eight hundred high")

  assert.equal(result.confidence, "medium")
  assert.deepEqual(
    result.measurements.map((measurement) => [
      measurement.value,
      measurement.unit,
      measurement.normalized_value_m,
      measurement.dimension,
      measurement.confidence,
      measurement.unit_inferred,
    ]),
    [
      [1400, "mm", 1.4, "depth", "medium", true],
      [5400, "mm", 5.4, "width", "medium", true],
      [800, "mm", 0.8, "height", "medium", true],
    ],
  )
  assert.equal(result.notices.some((notice) => /Assumed 1400 means 1400mm\. Please verify\./i.test(notice.message)), true)
  assert.equal(result.notices.some((notice) => /Assumed 5400 means 5400mm\. Please verify\./i.test(notice.message)), true)
  assert.equal(result.notices.some((notice) => /Assumed 800 means 800mm\. Please verify\./i.test(notice.message)), true)
})

test("returns empty result when no measurements are present", () => {
  const result = extractMeasurements("Install six downlights and two power points.")

  assert.equal(result.confidence, "low")
  assert.deepEqual(result.measurements, [])
  assert.deepEqual(result.notices, [])
})
