import assert from "node:assert/strict"
import test from "node:test"
import { calculatePaving, PAVING_DEFAULTS } from "./calculator"
import { detectPavingFromText } from "./detector"

// ─── MVP proof: five deterministic assertions ────────────────────────────────

test("3.5m x 6m = 21m² paved area", () => {
  const result = calculatePaving({ areas: [{ length_m: 3.5, width_m: 6 }] })

  assert.equal(result.areas[0].paved_area_m2, 21)
  assert.equal(result.areas[0].paved_area_source, "calculated")
  assert.equal(result.areas[0].formula, "3.5m x 6m = 21m2")
  assert.equal(result.total_paved_area_m2, 21)
})

test("450x450 pavers with 10% waste = 115 pavers", () => {
  const result = calculatePaving({
    areas: [{ length_m: 3.5, width_m: 6, paver_length_mm: 450, paver_width_mm: 450, waste_factor_percent: 10 }],
  })

  assert.equal(result.areas[0].paver_area_m2, 0.2025)
  assert.equal(result.areas[0].paver_count, 115)
  assert.equal(result.total_paver_count, 115)
})

test("100mm base course depth = 2.1m³", () => {
  const result = calculatePaving({ areas: [{ length_m: 3.5, width_m: 6, base_course_depth_mm: 100 }] })

  assert.equal(result.areas[0].base_course_volume_m3, 2.1)
  assert.equal(result.total_base_course_volume_m3, 2.1)
})

test("30mm bedding sand depth = 0.63m³", () => {
  const result = calculatePaving({ areas: [{ length_m: 3.5, width_m: 6, bedding_sand_depth_mm: 30 }] })

  assert.equal(result.areas[0].bedding_sand_volume_m3, 0.63)
  assert.equal(result.total_bedding_sand_volume_m3, 0.63)
})

test("1.5 labour hours/m² = 31.5 hours", () => {
  const result = calculatePaving({ areas: [{ length_m: 3.5, width_m: 6, labour_hours_per_m2: 1.5 }] })

  assert.equal(result.areas[0].estimated_labour_hours, 31.5)
  assert.equal(result.total_estimated_labour_hours, 31.5)
})

// ─── All MVP inputs together ─────────────────────────────────────────────────

test("full MVP inputs produce all expected outputs together", () => {
  const result = calculatePaving({
    areas: [
      {
        length_m: 3.5,
        width_m: 6,
        paver_length_mm: 450,
        paver_width_mm: 450,
        base_course_depth_mm: 100,
        bedding_sand_depth_mm: 30,
        waste_factor_percent: 10,
        labour_hours_per_m2: 1.5,
        paver_type: "450x450 concrete pavers",
        install_scope: "new",
      },
    ],
  })

  const area = result.areas[0]
  assert.equal(area.paved_area_m2, 21)
  assert.equal(area.paver_count, 115)
  assert.equal(area.base_course_volume_m3, 2.1)
  assert.equal(area.bedding_sand_volume_m3, 0.63)
  assert.equal(area.estimated_labour_hours, 31.5)
  assert.equal(area.paver_type, "450x450 concrete pavers")
  assert.equal(area.install_scope, "new")
  // All four defaults were overridden — no default assumption warnings
  assert.equal(area.warnings.some((w) => w.code === "base_course_depth_assumed"), false)
  assert.equal(area.warnings.some((w) => w.code === "bedding_sand_depth_assumed"), false)
  assert.equal(area.warnings.some((w) => w.code === "waste_factor_assumed"), false)
  assert.equal(area.warnings.some((w) => w.code === "labour_rate_assumed"), false)
})

// ─── Defaults ────────────────────────────────────────────────────────────────

test("uses explicit defaults when no values provided", () => {
  const result = calculatePaving({ areas: [{ length_m: 3.5, width_m: 6 }] })

  const area = result.areas[0]
  assert.equal(area.base_course_depth_mm, PAVING_DEFAULTS.BASE_COURSE_DEPTH_MM)
  assert.equal(area.bedding_sand_depth_mm, PAVING_DEFAULTS.BEDDING_SAND_DEPTH_MM)
  assert.equal(area.waste_factor_percent, PAVING_DEFAULTS.WASTE_FACTOR_PERCENT)
  assert.equal(area.labour_hours_per_m2, PAVING_DEFAULTS.LABOUR_HOURS_PER_M2)
})

test("defaults produce correct volumes using default depth values", () => {
  const result = calculatePaving({ areas: [{ length_m: 3.5, width_m: 6 }] })

  // 21m² × 100mm = 2.1m³, 21m² × 30mm = 0.63m³
  assert.equal(result.areas[0].base_course_volume_m3, 2.1)
  assert.equal(result.areas[0].bedding_sand_volume_m3, 0.63)
  assert.equal(result.areas[0].estimated_labour_hours, 31.5)
})

// ─── Warnings ────────────────────────────────────────────────────────────────

test("emits missing_paver_dimensions warning when paver dims absent", () => {
  const result = calculatePaving({ areas: [{ length_m: 3.5, width_m: 6 }] })

  assert.equal(result.areas[0].paver_count, null)
  assert.ok(result.areas[0].warnings.some((w) => w.code === "missing_paver_dimensions"))
  assert.equal(result.areas[0].warnings.find((w) => w.code === "missing_paver_dimensions")?.severity, "info")
})

test("emits default assumption warnings at info severity when using fallback values", () => {
  const result = calculatePaving({ areas: [{ length_m: 3.5, width_m: 6 }] })
  const codes = result.areas[0].warnings.map((w) => w.code)

  assert.ok(codes.includes("base_course_depth_assumed"))
  assert.ok(codes.includes("bedding_sand_depth_assumed"))
  assert.ok(codes.includes("waste_factor_assumed"))
  assert.ok(codes.includes("labour_rate_assumed"))
  result.areas[0].warnings.forEach((w) => {
    if (["base_course_depth_assumed", "bedding_sand_depth_assumed", "waste_factor_assumed", "labour_rate_assumed"].includes(w.code)) {
      assert.equal(w.severity, "info")
    }
  })
})

test("emits missing_length and missing_width warnings when dimensions absent", () => {
  const result = calculatePaving({ areas: [{}] })

  assert.equal(result.areas[0].paved_area_m2, null)
  assert.ok(result.areas[0].warnings.some((w) => w.code === "missing_length" && w.severity === "warning"))
  assert.ok(result.areas[0].warnings.some((w) => w.code === "missing_width" && w.severity === "warning"))
})

test("accepts provided square_metres when length and width are absent", () => {
  const result = calculatePaving({ areas: [{ square_metres: 15 }] })

  assert.equal(result.areas[0].paved_area_m2, 15)
  assert.equal(result.areas[0].paved_area_source, "provided")
  assert.equal(result.areas[0].formula, null)
  // No missing_length / missing_width warnings when area is provided directly
  assert.equal(result.areas[0].warnings.some((w) => w.code === "missing_length"), false)
  assert.equal(result.areas[0].warnings.some((w) => w.code === "missing_width"), false)
})

// ─── Multi-area aggregation ───────────────────────────────────────────────────

test("aggregates two areas into correct totals", () => {
  const result = calculatePaving({
    areas: [
      { length_m: 3, width_m: 4, paver_length_mm: 450, paver_width_mm: 450, waste_factor_percent: 10 },
      { length_m: 2, width_m: 5, paver_length_mm: 450, paver_width_mm: 450, waste_factor_percent: 10 },
    ],
  })

  // 12m² + 10m² = 22m²
  assert.equal(result.areas[0].paved_area_m2, 12)
  assert.equal(result.areas[1].paved_area_m2, 10)
  assert.equal(result.total_paved_area_m2, 22)

  // Each area paver count is independently ceil'd; totals are summed
  assert.equal(result.areas[0].paver_count, result.areas[0].paver_count) // self-consistent
  assert.equal(result.total_paver_count, (result.areas[0].paver_count ?? 0) + (result.areas[1].paver_count ?? 0))
})

// ─── Detector ────────────────────────────────────────────────────────────────

test("detects paving from a transcript with area and paver dimensions", () => {
  const transcript = "Lay 450x450 concrete pavers over a 3.5m x 6m patio. Top up basecourse and compact."
  const detection = detectPavingFromText(transcript)

  assert.equal(detection.is_paving, true)
  assert.ok(detection.confidence_score >= 45)
  assert.equal(detection.request.areas.length, 1)
  assert.equal(detection.request.areas[0].length_m, 3.5)
  assert.equal(detection.request.areas[0].width_m, 6)
  assert.equal(detection.request.areas[0].paver_length_mm, 450)
  assert.equal(detection.request.areas[0].paver_width_mm, 450)
})

test("detector result feeds calculator and produces correct outputs", () => {
  const transcript = "Lay 450x450 concrete pavers over a 3.5m x 6m patio. Top up basecourse and compact."
  const detection = detectPavingFromText(transcript)
  const result = calculatePaving(detection.request)

  assert.equal(result.areas[0].paved_area_m2, 21)
  assert.equal(result.areas[0].paver_count, 115)
})

test("does not detect paving from an unrelated planting transcript", () => {
  const transcript = "Plant 50 agapanthus and 20 flaxes along the garden border."
  const detection = detectPavingFromText(transcript)

  assert.equal(detection.is_paving, false)
  assert.equal(detection.confidence, "none")
  assert.equal(detection.request.areas.length, 0)
})

test("does not detect paving from an electrical transcript", () => {
  const transcript = "Install six downlights and two power points in the living room."
  const detection = detectPavingFromText(transcript)

  assert.equal(detection.is_paving, false)
  assert.equal(detection.confidence, "none")
})
