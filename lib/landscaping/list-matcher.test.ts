import assert from "node:assert/strict"
import test from "node:test"
import { matchLineToPriceList, type PriceListRow } from "./list-matcher"

// Rows shaped like the three real lists after import (cost->sell already resolved).
const ROWS: PriceListRow[] = [
  // Botanic (plants, pot size in the name)
  { id: "b1", name: "Ficus tuffi 14L", sell_price: 81.25, source: "Botanic", stock_status: "In stock" },
  { id: "b2", name: "Star jasmine 2L", sell_price: 24.88, source: "Botanic" },
  { id: "b3", name: "Ilex largo 25L", sell_price: 109.25, source: "Botanic" },
  // Bunnings (materials, per item)
  { id: "n1", name: "Weed mat 1m x 30m", sell_price: 62, unit: "roll", source: "Bunnings" },
  { id: "n2", name: "H4 timber post 90x90 2.4m", sell_price: 28.5, unit: "each", source: "Bunnings" },
  // Landscape Supplies (bulk, per m3)
  { id: "l1", name: "Bark mulch", sell_price: 78, unit: "m3", source: "Landscape Supplies" },
  { id: "l2", name: "Garden mix", sell_price: 92, unit: "m3", source: "Landscape Supplies" },
  { id: "l3", name: "Drainage metal", sell_price: null, unit: "m3", source: "Landscape Supplies" }, // no price
]

test("exact plant name (no size spoken) -> high, uses list price", () => {
  const m = matchLineToPriceList("Ficus tuffi", ROWS)
  assert.equal(m.confidence, "high")
  assert.equal(m.row?.id, "b1")
  assert.equal(m.price, 81.25)
  assert.equal(m.price_source, "list")
  assert.equal(m.needs_confirm, false)
})

test("right plant, different size -> medium, list price but confirm", () => {
  const m = matchLineToPriceList("Ficus tuffi 25L", ROWS) // only 14L in the list
  assert.equal(m.confidence, "medium")
  assert.equal(m.row?.id, "b1")
  assert.equal(m.price, 81.25)
  assert.equal(m.needs_confirm, true)
})

test("star jasmine matches with markup price", () => {
  const m = matchLineToPriceList("star jasmine", ROWS)
  assert.equal(m.row?.id, "b2")
  assert.equal(m.price, 24.88)
})

test("'weed mat' matches the Bunnings roll (size stripped)", () => {
  const m = matchLineToPriceList("weed mat", ROWS)
  assert.equal(m.row?.id, "n1")
  assert.equal(m.price, 62)
  assert.equal(m.price_source, "list")
})

test("'bark' -> Bark mulch (contained), list price, confirm", () => {
  const m = matchLineToPriceList("bark", ROWS)
  assert.equal(m.row?.id, "l1")
  assert.equal(m.price, 78)
  assert.equal(m.confidence, "medium")
  assert.equal(m.needs_confirm, true)
})

test("no match -> unpriced + confirm, NEVER invents a number", () => {
  const m = matchLineToPriceList("unicorn dust", ROWS)
  assert.equal(m.confidence, "none")
  assert.equal(m.row, null)
  assert.equal(m.price, null)
  assert.equal(m.price_source, "unpriced")
  assert.equal(m.needs_confirm, true)
})

test("matched row with no price -> unpriced + confirm, no invented number", () => {
  const m = matchLineToPriceList("drainage metal", ROWS)
  assert.equal(m.row?.id, "l3")
  assert.equal(m.price, null)
  assert.equal(m.price_source, "unpriced")
  assert.equal(m.needs_confirm, true)
})

test("no lists imported -> unpriced + confirm", () => {
  const m = matchLineToPriceList("bark", [])
  assert.equal(m.confidence, "none")
  assert.equal(m.price, null)
  assert.equal(m.price_source, "unpriced")
})

test("aliases are matched", () => {
  const rows: PriceListRow[] = [{ id: "a1", name: "Griselinia Broadway Mint 2L", aliases: ["griselinia", "grislynia"], sell_price: 15.5, source: "Botanic" }]
  assert.equal(matchLineToPriceList("grislynia", rows).row?.id, "a1")
  assert.equal(matchLineToPriceList("griselinia", rows).price, 15.5)
})

test("every non-null price returned comes from a real row (no fabrication)", () => {
  for (const q of ["Ficus tuffi", "ficus tuffi 25L", "bark", "weed mat", "unicorn dust", "drainage metal", "star jasmine"]) {
    const m = matchLineToPriceList(q, ROWS)
    if (m.price != null) {
      assert.equal(m.price, m.row?.sell_price, `price for "${q}" must equal its matched row's sell_price`)
    }
  }
})

test("deterministic across 100 runs", () => {
  const strip = (q: string) => JSON.stringify(matchLineToPriceList(q, ROWS))
  for (const q of ["Ficus tuffi", "bark", "weed mat", "unicorn dust"]) {
    const first = strip(q)
    for (let i = 0; i < 100; i++) assert.equal(strip(q), first)
  }
})
