import assert from "node:assert/strict"
import test from "node:test"
import { resolveBillsToQuoteOptions } from "../../items/resolve-bill"
import type { ResolvableItem } from "../../items/resolve-bill"
import { calculatePaving } from "./calculator"
import { pavingResultToBills } from "./to-bill"
import type { PavingCalculatorResult } from "./types"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const paverItem: ResolvableItem = {
  id: "item-paver",
  item_code: "PAV-450X450",
  item_name: "450x450 concrete pavers",
  sell_price: 4.5,
  unit: "each",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const baseItem: ResolvableItem = {
  id: "item-base",
  item_code: "PAV-BASE-M3",
  item_name: "Base course aggregate",
  sell_price: 65,
  unit: "m3",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const sandItem: ResolvableItem = {
  id: "item-sand",
  item_code: "PAV-SAND-M3",
  item_name: "Bedding sand",
  sell_price: 55,
  unit: "m3",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const labourItem: ResolvableItem = {
  id: "item-labour",
  item_code: "PAV-LABOUR-HR",
  item_name: "Paving labour",
  sell_price: 85,
  unit: "hours",
  account_code: "200",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const allItems: ResolvableItem[] = [paverItem, baseItem, sandItem, labourItem]

// ---------------------------------------------------------------------------
// Test 1 — Full inputs: all four entries emitted
// ---------------------------------------------------------------------------

test("pavingResultToBills: full inputs produce all four bill entries", () => {
  const result = calculatePaving({
    areas: [
      {
        label: "Patio",
        length_m: 3.5,
        width_m: 6,
        paver_length_mm: 450,
        paver_width_mm: 450,
        waste_factor_percent: 10,
        base_course_depth_mm: 100,
        bedding_sand_depth_mm: 30,
        labour_hours_per_m2: 1.5,
      },
    ],
  })

  const bills = pavingResultToBills(result)

  assert.equal(bills.length, 1)
  assert.equal(bills[0].trade, "paving")
  assert.equal(bills[0].area_label, "Patio")

  const entries = bills[0].entries
  assert.equal(entries.length, 4)

  const pavers = entries.find((e) => e.role === "paving_paver")
  assert.ok(pavers, "expected paving_paver entry")
  assert.equal(pavers.quantity, 115)       // 21m² ÷ 0.2025m² × 1.10 = 115 (ceiling)
  assert.equal(pavers.unit, "each")

  const base = entries.find((e) => e.role === "paving_base_aggregate")
  assert.ok(base, "expected paving_base_aggregate entry")
  assert.equal(base.quantity, 2.1)         // 21m² × 0.1m
  assert.equal(base.unit, "m3")

  const sand = entries.find((e) => e.role === "paving_bedding_sand")
  assert.ok(sand, "expected paving_bedding_sand entry")
  assert.equal(sand.quantity, 0.63)        // 21m² × 0.03m
  assert.equal(sand.unit, "m3")

  const labour = entries.find((e) => e.role === "paving_labour")
  assert.ok(labour, "expected paving_labour entry")
  assert.equal(labour.quantity, 31.5)      // 21m² × 1.5 hrs/m²
  assert.equal(labour.unit, "hours")
})

// ---------------------------------------------------------------------------
// Test 2 — No paver dimensions: pavers entry omitted, other three present
// ---------------------------------------------------------------------------

test("pavingResultToBills: no paver dimensions omits paving_paver entry", () => {
  const result = calculatePaving({
    areas: [{ label: "Path", length_m: 2, width_m: 5 }],
  })

  const bills = pavingResultToBills(result)

  assert.equal(bills.length, 1)
  const roles = bills[0].entries.map((e) => e.role)
  assert.equal(roles.includes("paving_paver"), false, "paving_paver must be absent when paver dims missing")
  assert.equal(roles.includes("paving_base_aggregate"), true)
  assert.equal(roles.includes("paving_bedding_sand"), true)
  assert.equal(roles.includes("paving_labour"), true)
  assert.equal(bills[0].entries.length, 3)
})

// ---------------------------------------------------------------------------
// Test 3 — Area with no dimensions: no bill produced
// ---------------------------------------------------------------------------

test("pavingResultToBills: area with no dimensions is excluded", () => {
  const result: PavingCalculatorResult = {
    areas: [
      {
        id: "a1",
        label: "Unknown area",
        length_m: null,
        width_m: null,
        paved_area_m2: null,
        paved_area_source: "missing",
        formula: null,
        paver_length_mm: null,
        paver_width_mm: null,
        paver_type: null,
        paver_area_m2: null,
        paver_count: null,
        base_course_depth_mm: 100,
        bedding_sand_depth_mm: 30,
        base_course_volume_m3: null,
        bedding_sand_volume_m3: null,
        waste_factor_percent: 10,
        labour_hours_per_m2: 1.5,
        estimated_labour_hours: null,
        install_scope: "unknown",
        access_difficulty: false,
        warnings: [],
      },
    ],
    total_paved_area_m2: null,
    total_paver_count: null,
    total_base_course_volume_m3: null,
    total_bedding_sand_volume_m3: null,
    total_estimated_labour_hours: null,
    waste_removal_notes: [],
    access_notes: [],
    warnings: [],
  }

  const bills = pavingResultToBills(result)
  assert.equal(bills.length, 0)
})

// ---------------------------------------------------------------------------
// Test 4 — Multi-area: one bill per area, independent quantities
// ---------------------------------------------------------------------------

test("pavingResultToBills: multi-area produces one bill per area", () => {
  const result = calculatePaving({
    areas: [
      {
        label: "Front path",
        length_m: 2,
        width_m: 5,
        paver_length_mm: 600,
        paver_width_mm: 300,
        waste_factor_percent: 10,
      },
      {
        label: "Back patio",
        length_m: 4,
        width_m: 6,
        paver_length_mm: 450,
        paver_width_mm: 450,
        waste_factor_percent: 10,
      },
    ],
  })

  const bills = pavingResultToBills(result)

  assert.equal(bills.length, 2)
  assert.equal(bills[0].area_label, "Front path")
  assert.equal(bills[1].area_label, "Back patio")

  // Front: 2m × 5m = 10m²; 600×300mm paver area = 0.18m²; count = ceil(10/0.18 × 1.1) = 62
  const frontPavers = bills[0].entries.find((e) => e.role === "paving_paver")
  assert.ok(frontPavers)
  assert.equal(frontPavers.quantity, result.areas[0].paver_count)

  // Back: 4m × 6m = 24m²; 450×450mm paver area = 0.2025m²; count = ceil(24/0.2025 × 1.1)
  const backPavers = bills[1].entries.find((e) => e.role === "paving_paver")
  assert.ok(backPavers)
  assert.equal(backPavers.quantity, result.areas[1].paver_count)

  // Bills are independent
  const frontBase = bills[0].entries.find((e) => e.role === "paving_base_aggregate")
  const backBase = bills[1].entries.find((e) => e.role === "paving_base_aggregate")
  assert.ok(frontBase && backBase)
  assert.notEqual(frontBase.quantity, backBase.quantity)
})

// ---------------------------------------------------------------------------
// Test 5 — Bill trade field and area_label
// ---------------------------------------------------------------------------

test("pavingResultToBills: bill trade field is 'paving'", () => {
  const result = calculatePaving({
    areas: [{ label: "Driveway", length_m: 5, width_m: 3 }],
  })

  const bills = pavingResultToBills(result)
  assert.equal(bills[0].trade, "paving")
  assert.equal(bills[0].area_label, "Driveway")
})

// ---------------------------------------------------------------------------
// Test 6 — Paver label uses paver_type when available
// ---------------------------------------------------------------------------

test("pavingResultToBills: paver entry label uses paver_type when provided", () => {
  const result = calculatePaving({
    areas: [
      {
        label: "Patio",
        length_m: 3,
        width_m: 3,
        paver_length_mm: 600,
        paver_width_mm: 600,
        paver_type: "600x600 concrete pavers",
        waste_factor_percent: 10,
      },
    ],
  })

  const bills = pavingResultToBills(result)
  const pavers = bills[0].entries.find((e) => e.role === "paving_paver")
  assert.ok(pavers)
  assert.equal(pavers.label, "600x600 concrete pavers")
})

// ---------------------------------------------------------------------------
// Test 7 — Resolver integration: matched items produce priced QuoteOptions
// ---------------------------------------------------------------------------

test("resolves paving bill: matched items produce priced line items", () => {
  const result = calculatePaving({
    areas: [
      {
        label: "Patio",
        length_m: 3.5,
        width_m: 6,
        paver_length_mm: 450,
        paver_width_mm: 450,
        waste_factor_percent: 10,
        base_course_depth_mm: 100,
        bedding_sand_depth_mm: 30,
        labour_hours_per_m2: 1.5,
      },
    ],
  })

  const bills = pavingResultToBills(result)
  const options = resolveBillsToQuoteOptions(bills, allItems)

  assert.equal(options.length, 1)
  const option = options[0]
  assert.equal(option.category, "material")
  assert.equal(option.source, "trade_calculator")
  assert.match(option.id, /^paving-bill-/)

  const paverLine = option.lineItems.find((li) => li.itemCode === "PAV-450X450")
  assert.ok(paverLine, "expected paver line item")
  assert.equal(paverLine.quantity, 115)
  assert.equal(paverLine.unitPrice, 4.5)
  assert.equal(paverLine.total, 115 * 4.5)

  const baseLine = option.lineItems.find((li) => li.itemCode === "PAV-BASE-M3")
  assert.ok(baseLine, "expected base course line item")
  assert.equal(baseLine.quantity, 2.1)
  assert.equal(baseLine.unitPrice, 65)
  assert.equal(baseLine.total, 2.1 * 65)

  const sandLine = option.lineItems.find((li) => li.itemCode === "PAV-SAND-M3")
  assert.ok(sandLine, "expected bedding sand line item")
  assert.equal(sandLine.quantity, 0.63)
  assert.equal(sandLine.unitPrice, 55)
  assert.equal(sandLine.total, 0.63 * 55)

  const labourLine = option.lineItems.find((li) => li.itemCode === "PAV-LABOUR-HR")
  assert.ok(labourLine, "expected labour line item")
  assert.equal(labourLine.quantity, 31.5)
  assert.equal(labourLine.unitPrice, 85)
  assert.equal(labourLine.total, 31.5 * 85)

  const expectedSubtotal = 115 * 4.5 + 2.1 * 65 + 0.63 * 55 + 31.5 * 85
  assert.equal(option.subtotal, expectedSubtotal)
  assert.equal((option.warnings ?? []).length, 0)
})

// ---------------------------------------------------------------------------
// Test 8 — Resolver integration: unmatched items produce warnings
// ---------------------------------------------------------------------------

test("resolves paving bill: unmatched entries produce zero-price items with warnings", () => {
  const result = calculatePaving({
    areas: [
      {
        label: "Patio",
        length_m: 3.5,
        width_m: 6,
        paver_length_mm: 450,
        paver_width_mm: 450,
        waste_factor_percent: 10,
      },
    ],
  })

  const bills = pavingResultToBills(result)
  // Only provide the paver item — base, sand, labour unmatched
  const options = resolveBillsToQuoteOptions(bills, [paverItem])

  const option = options[0]
  const unpriced = option.lineItems.filter((li) => li.unitPrice === 0)
  assert.equal(unpriced.length, 3, "base, sand, labour should be unpriced")

  const warnings = option.warnings ?? []
  assert.ok(warnings.some((w) => /base course aggregate/i.test(w)), "expected base course warning")
  assert.ok(warnings.some((w) => /bedding sand/i.test(w)), "expected bedding sand warning")
  assert.ok(warnings.some((w) => /paving labour/i.test(w)), "expected labour warning")
})
