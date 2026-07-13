import assert from "node:assert/strict"
import test from "node:test"
import {
  parsePlantingLine,
  resolvePlantingLine,
  resolvePlantingLineFromText,
  suggestSpacingMm,
} from "./planting-spacing"

// --- Spacing rule -----------------------------------------------------------

test("default gap is 50cm for everything", () => {
  assert.equal(suggestSpacingMm({ plant_name: "carex" }).spacing_mm, 500)
  assert.equal(suggestSpacingMm({ plant_name: "griselinia" }).spacing_mm, 500)
  assert.equal(suggestSpacingMm({}).spacing_mm, 500)
})

test("Buxus -> 30cm (name override)", () => {
  assert.equal(suggestSpacingMm({ plant_name: "Buxus" }).spacing_mm, 300)
  assert.equal(suggestSpacingMm({ plant_name: "buxus sempervirens" }).spacing_mm, 300)
  assert.equal(suggestSpacingMm({ plant_name: "box hedge" }).spacing_mm, 300)
  // Name override wins even if a tall height is present.
  assert.equal(suggestSpacingMm({ plant_name: "buxus", hedge_height_m: 1.5 }).spacing_mm, 300)
})

test("hedge above 1m -> 80cm; 1m exactly stays in the 50cm band", () => {
  assert.equal(suggestSpacingMm({ plant_name: "griselinia", hedge_above_1m: true }).spacing_mm, 800)
  assert.equal(suggestSpacingMm({ plant_name: "griselinia", hedge_height_m: 1.2 }).spacing_mm, 800)
  assert.equal(suggestSpacingMm({ plant_name: "griselinia", hedge_height_m: 1 }).spacing_mm, 500) // exactly 1m
  assert.equal(suggestSpacingMm({ plant_name: "griselinia", hedge_height_m: 0.8 }).spacing_mm, 500)
})

// --- Count ------------------------------------------------------------------

test("count = length ÷ gap (rounded up)", () => {
  const r = resolvePlantingLine({ plant_name: "carex", length_m: 10 })
  assert.equal(r.spacing_mm, 500)
  assert.equal(r.count, 20) // 10 / 0.5
  assert.equal(r.count_source, "calculated")
  assert.equal(r.spacing_applied, true)
})

test("count with buxus spacing", () => {
  const r = resolvePlantingLine({ plant_name: "buxus", length_m: 15 })
  assert.equal(r.spacing_mm, 300)
  assert.equal(r.count, 50) // 15 / 0.3
})

test("manual/spoken count wins and ignores the spacing calc", () => {
  const r = resolvePlantingLine({ plant_name: "hibiscus", spoken_count: 4, length_m: 10 })
  assert.equal(r.count, 4)
  assert.equal(r.count_source, "spoken")
  assert.equal(r.spacing_applied, false) // spacing not used for the count
})

test("user count override wins over everything", () => {
  const r = resolvePlantingLine({ plant_name: "carex", length_m: 10, count_override: 25 })
  assert.equal(r.count, 25)
  assert.equal(r.count_source, "manual")
  assert.equal(r.spacing_applied, false)
})

test("user spacing override changes the calculated count", () => {
  const r = resolvePlantingLine({ plant_name: "carex", length_m: 12, spacing_mm_override: 600 })
  assert.equal(r.spacing_mm, 600)
  assert.equal(r.spacing_source, "override")
  assert.equal(r.count, 20) // 12 / 0.6
})

test("no length and no count -> missing, spacing still shown", () => {
  const r = resolvePlantingLine({ plant_name: "carex" })
  assert.equal(r.count, null)
  assert.equal(r.count_source, "missing")
  assert.equal(r.spacing_mm, 500) // still visible
})

// --- Parser on Joe's phrasings ---------------------------------------------

test("'4 hibiscus across 10m' -> count 4 (manual), length 10, default spacing shown", () => {
  const parsed = parsePlantingLine("4 hibiscus across 10m")
  assert.equal(parsed.spoken_count, 4)
  assert.equal(parsed.length_m, 10)
  const r = resolvePlantingLineFromText("4 hibiscus across 10m")
  assert.equal(r.count, 4)
  assert.equal(r.spacing_mm, 500)
  assert.equal(r.spacing_applied, false)
})

test("'griselinia hedge above 1m, 15m run' -> 80cm spacing, count from length", () => {
  const parsed = parsePlantingLine("griselinia hedge above 1m, 15m run")
  assert.equal(parsed.hedge_above_1m, true)
  assert.equal(parsed.length_m, 15)
  const r = resolvePlantingLineFromText("griselinia hedge above 1m, 15m run")
  assert.equal(r.spacing_mm, 800)
  assert.equal(r.count, 19) // ceil(15 / 0.8)
})

test("'1m hedge, 10m' (exactly 1m) stays in the 50cm band", () => {
  const r = resolvePlantingLineFromText("griselinia 1m hedge, 10m")
  assert.equal(r.spacing_mm, 500)
  assert.equal(r.count, 20)
})

test("'12m buxus hedge' -> 30cm spacing by name", () => {
  const r = resolvePlantingLineFromText("12m buxus hedge")
  assert.equal(r.spacing_mm, 300)
  assert.equal(r.count, 40) // ceil(12 / 0.3)
})

test("deterministic across 100 runs", () => {
  const strip = () => JSON.stringify(resolvePlantingLineFromText("griselinia hedge above 1m, 15m run"))
  const first = strip()
  for (let i = 0; i < 100; i++) assert.equal(strip(), first)
})
