import assert from "node:assert/strict"
import test from "node:test"

import { buildCustomerOptionalWorksLines, CUSTOMER_OPTIONAL_WORKS_INTRO } from "./customer-optional-works"
import type { QuoteOption } from "./quote-options"

function labourOption(overrides: Partial<QuoteOption>): QuoteOption {
  return {
    id: "optional-1-labour-1",
    label: "Optional Ficus Tuffi hedge",
    title: "Optional labour — Optional Ficus Tuffi hedge",
    category: "labour",
    source: "ai_extraction",
    lineItems: [{ itemName: "Labour", quantity: 16, unit: "hours", unitPrice: 110, total: 1760 }],
    subtotal: 1760,
    warnings: [],
    ...overrides,
  }
}

test("priced optional work renders a customer-safe optional works section", () => {
  const lines = buildCustomerOptionalWorksLines([labourOption({})])
  const text = lines.join("\n")

  assert.match(text, /^Optional works/m)
  assert.ok(lines.includes(CUSTOMER_OPTIONAL_WORKS_INTRO))
  assert.match(text, /not included in the main quote/i)
  assert.match(text, /Optional Ficus Tuffi hedge/)
  assert.match(text, /Optional price: \$1,760/)
})

test("does not expose internal fields, source, category, warnings, or labour hours", () => {
  const text = buildCustomerOptionalWorksLines([labourOption({ warnings: ["Some internal warning"] })]).join("\n")
  for (const forbidden of ["ai_extraction", "labour", "source", "category", "warning", "optional_priced_works", "QuotePlan", "16 hours", "hours"]) {
    assert.ok(!new RegExp(forbidden, "i").test(text), `customer text must not contain "${forbidden}": ${text}`)
  }
})

test("zero subtotal returns no customer-facing lines", () => {
  assert.deepEqual(buildCustomerOptionalWorksLines([labourOption({ subtotal: 0 })]), [])
})

test("rate-missing warning returns no customer-facing lines", () => {
  assert.deepEqual(
    buildCustomerOptionalWorksLines([labourOption({ subtotal: 0, warnings: ["Rate missing — price optional labour before sending."] })]),
    [],
  )
})

test("empty / undefined optional works returns []", () => {
  assert.deepEqual(buildCustomerOptionalWorksLines(undefined), [])
  assert.deepEqual(buildCustomerOptionalWorksLines([]), [])
})

test("renders multiple priced optional works, each with its price", () => {
  const lines = buildCustomerOptionalWorksLines([
    labourOption({ id: "a", label: "Optional hedge", subtotal: 1760 }),
    labourOption({ id: "b", label: "Optional edging", subtotal: 640, lineItems: [{ itemName: "Labour", quantity: 8, unit: "hours", unitPrice: 80, total: 640 }] }),
  ])
  const text = lines.join("\n")
  assert.match(text, /Optional hedge\nOptional price: \$1,760/)
  assert.match(text, /Optional edging\nOptional price: \$640/)
})
