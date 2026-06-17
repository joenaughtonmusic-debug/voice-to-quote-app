import assert from "node:assert/strict"
import test from "node:test"
import { resolveBillsToQuoteOptions } from "../../items/resolve-bill"
import type { ResolvableItem } from "../../items/resolve-bill"
import { calculateRetaining } from "./calculator"
import { retainingResultToBills } from "./to-bill"
import type { RetainingCalculatorResult } from "./types"

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const timberItem: ResolvableItem = {
  id: "item-timber",
  item_code: "RET-TIMBER-M2",
  item_name: "Retaining wall timber",
  sell_price: 65,
  unit: "m2",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const drainageItem: ResolvableItem = {
  id: "item-drainage",
  item_code: "DRAIN-PIPE-M",
  item_name: "Drainage pipe",
  sell_price: 18,
  unit: "m",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const postItem: ResolvableItem = {
  id: "item-post",
  item_code: "RET-POST-M",
  item_name: "Retaining posts",
  sell_price: 42,
  unit: "m",
  account_code: "310",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const labourItem: ResolvableItem = {
  id: "item-labour",
  item_code: "RET-LABOUR-M2",
  item_name: "Retaining wall labour",
  sell_price: 95,
  unit: "m2",
  account_code: "200",
  tax_type: "OUTPUT",
  gst_rate: 0.15,
  source_system: "JMS",
}

const allItems: ResolvableItem[] = [timberItem, drainageItem, postItem, labourItem]

// ---------------------------------------------------------------------------
// Test 1 — Adapter shape: full flags, single section
// ---------------------------------------------------------------------------

test("retainingResultToBills: full-flag single section produces correct entries", () => {
  const result = calculateRetaining({
    sections: [{ label: "Main wall", length_m: 12, height_m: 1.8 }],
    timber_retaining: true,
    drainage_mentioned: true,
    posts_mentioned: true,
  })

  const bills = retainingResultToBills(result)

  assert.equal(bills.length, 1)
  assert.equal(bills[0].trade, "retaining")
  assert.equal(bills[0].area_label, "Main wall")

  const entries = bills[0].entries
  assert.equal(entries.length, 4)

  const timber = entries.find((e) => e.role === "retaining_wall_timber")
  assert.ok(timber, "expected retaining_wall_timber entry")
  assert.equal(timber.quantity, 21.6)
  assert.equal(timber.unit, "m2")
  assert.equal(timber.label, "Retaining wall timber")

  const drainage = entries.find((e) => e.role === "retaining_drainage_pipe")
  assert.ok(drainage, "expected retaining_drainage_pipe entry")
  assert.equal(drainage.quantity, 12)
  assert.equal(drainage.unit, "m")
  assert.equal(drainage.label, "Drainage pipe")

  const posts = entries.find((e) => e.role === "retaining_post")
  assert.ok(posts, "expected retaining_post entry")
  assert.equal(posts.quantity, 12)
  assert.equal(posts.unit, "m")
  assert.equal(posts.label, "Retaining posts")

  const labour = entries.find((e) => e.role === "retaining_labour")
  assert.ok(labour, "expected retaining_labour entry")
  assert.equal(labour.quantity, 21.6)
  assert.equal(labour.unit, "m2")
})

// ---------------------------------------------------------------------------
// Test 2 — timber_retaining false → no wall timber entry, only labour
// ---------------------------------------------------------------------------

test("retainingResultToBills: timber_retaining false omits wall timber entry", () => {
  const result = calculateRetaining({
    sections: [{ label: "Block wall", length_m: 10, height_m: 1.0 }],
    timber_retaining: false,
    drainage_mentioned: false,
    posts_mentioned: false,
  })

  const bills = retainingResultToBills(result)

  assert.equal(bills.length, 1)
  const roles = bills[0].entries.map((e) => e.role)
  assert.equal(roles.includes("retaining_wall_timber"), false)
  assert.equal(roles.includes("retaining_labour"), true)
  assert.equal(bills[0].entries.length, 1)
})

// ---------------------------------------------------------------------------
// Test 3 — Drainage and posts flags false → only timber and labour
// ---------------------------------------------------------------------------

test("retainingResultToBills: drainage false and posts false omit those entries", () => {
  const result = calculateRetaining({
    sections: [{ label: "Dry wall", length_m: 8, height_m: 0.9 }],
    timber_retaining: true,
    drainage_mentioned: false,
    posts_mentioned: false,
  })

  const bills = retainingResultToBills(result)

  assert.equal(bills.length, 1)
  const roles = bills[0].entries.map((e) => e.role)
  assert.equal(roles.includes("retaining_drainage_pipe"), false)
  assert.equal(roles.includes("retaining_post"), false)
  assert.equal(roles.includes("retaining_wall_timber"), true)
  assert.equal(roles.includes("retaining_labour"), true)
  assert.equal(bills[0].entries.length, 2)
})

// ---------------------------------------------------------------------------
// Test 4 — Multi-section: separate bill per section, independent quantities
// ---------------------------------------------------------------------------

test("retainingResultToBills: multi-section produces one bill per section", () => {
  const result = calculateRetaining({
    sections: [
      { label: "Front wall", length_m: 10, height_m: 1.0 },
      { label: "Side wall", length_m: 6, height_m: 1.5 },
    ],
    timber_retaining: true,
    drainage_mentioned: true,
    posts_mentioned: false,
  })

  const bills = retainingResultToBills(result)

  assert.equal(bills.length, 2)

  assert.equal(bills[0].area_label, "Front wall")
  const frontTimber = bills[0].entries.find((e) => e.role === "retaining_wall_timber")
  assert.equal(frontTimber?.quantity, 10)  // 10m × 1.0m

  const frontDrainage = bills[0].entries.find((e) => e.role === "retaining_drainage_pipe")
  assert.equal(frontDrainage?.quantity, 10)  // length_m

  assert.equal(bills[1].area_label, "Side wall")
  const sideTimber = bills[1].entries.find((e) => e.role === "retaining_wall_timber")
  assert.equal(sideTimber?.quantity, 9)  // 6m × 1.5m

  const sideDrainage = bills[1].entries.find((e) => e.role === "retaining_drainage_pipe")
  assert.equal(sideDrainage?.quantity, 6)  // length_m

  // posts flag is false — no post entries in either bill
  assert.equal(bills[0].entries.some((e) => e.role === "retaining_post"), false)
  assert.equal(bills[1].entries.some((e) => e.role === "retaining_post"), false)
})

// ---------------------------------------------------------------------------
// Test 5 — Section with missing dimensions produces no bill
// ---------------------------------------------------------------------------

test("retainingResultToBills: section with all null dimensions is excluded", () => {
  const result: RetainingCalculatorResult = {
    sections: [
      {
        id: "s1",
        label: "Unknown wall",
        length_m: null,
        height_m: null,
        face_area_square_metres: null,
        face_area_source: "missing",
        formula: null,
        warnings: [],
      },
    ],
    total_face_area_square_metres: null,
    wall_kind: "unknown",
    timber_retaining: true,
    drainage_mentioned: true,
    posts_mentioned: true,
    access_difficulty: false,
    waste_removal_notes: [],
    warnings: [],
  }

  const bills = retainingResultToBills(result)
  assert.equal(bills.length, 0)
})

// ---------------------------------------------------------------------------
// Test 6 — Resolver integration: matched items produce priced QuoteOptions
// ---------------------------------------------------------------------------

test("resolves retaining bill: matched items produce priced line items", () => {
  const result = calculateRetaining({
    sections: [{ label: "Back wall", length_m: 12, height_m: 1.8 }],
    timber_retaining: true,
    drainage_mentioned: true,
    posts_mentioned: true,
  })

  const bills = retainingResultToBills(result)
  const options = resolveBillsToQuoteOptions(bills, allItems)

  assert.equal(options.length, 1)
  const option = options[0]
  assert.equal(option.category, "material")
  assert.equal(option.source, "trade_calculator")
  assert.equal(option.areaLabel, "Back wall")
  assert.equal(option.lineItems.length, 4)
  assert.equal((option.warnings ?? []).length, 0)

  const timberLine = option.lineItems.find((li) => li.itemCode === "RET-TIMBER-M2")
  assert.ok(timberLine, "expected timber line item")
  assert.equal(timberLine.quantity, 21.6)
  assert.equal(timberLine.unitPrice, 65)
  assert.equal(timberLine.total, 21.6 * 65)

  const drainageLine = option.lineItems.find((li) => li.itemCode === "DRAIN-PIPE-M")
  assert.ok(drainageLine, "expected drainage line item")
  assert.equal(drainageLine.quantity, 12)
  assert.equal(drainageLine.unitPrice, 18)
  assert.equal(drainageLine.total, 12 * 18)

  const postLine = option.lineItems.find((li) => li.itemCode === "RET-POST-M")
  assert.ok(postLine, "expected post line item")
  assert.equal(postLine.quantity, 12)
  assert.equal(postLine.unitPrice, 42)
  assert.equal(postLine.total, 12 * 42)

  const labourLine = option.lineItems.find((li) => li.itemCode === "RET-LABOUR-M2")
  assert.ok(labourLine, "expected labour line item")
  assert.equal(labourLine.quantity, 21.6)
  assert.equal(labourLine.unitPrice, 95)
  assert.equal(labourLine.total, 21.6 * 95)

  const expectedSubtotal = 21.6 * 65 + 12 * 18 + 12 * 42 + 21.6 * 95
  assert.equal(option.subtotal, expectedSubtotal)
})

// ---------------------------------------------------------------------------
// Test 7 — Resolver integration: unmatched items produce warnings
// ---------------------------------------------------------------------------

test("resolves retaining bill: unmatched entries produce zero-price line items with warnings", () => {
  const result = calculateRetaining({
    sections: [{ label: "Boundary wall", length_m: 8, height_m: 1.2 }],
    timber_retaining: true,
    drainage_mentioned: true,
    posts_mentioned: false,
  })

  const bills = retainingResultToBills(result)
  // Only provide the timber item — drainage and labour will be unmatched
  const options = resolveBillsToQuoteOptions(bills, [timberItem])

  const option = options[0]

  // Line items without a matched item code have zero price
  const unpriced = option.lineItems.filter((li) => li.unitPrice === 0)
  assert.equal(unpriced.length, 2) // drainage + labour both unmatched

  const warnings = option.warnings ?? []
  assert.ok(warnings.some((w) => /drainage pipe/i.test(w)), "expected drainage pipe warning")
  assert.ok(warnings.some((w) => /retaining wall labour/i.test(w)), "expected labour warning")
})
