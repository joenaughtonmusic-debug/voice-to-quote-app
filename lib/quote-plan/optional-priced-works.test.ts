import assert from "node:assert/strict"
import test from "node:test"

import { buildOptionalPricedWorks } from "./optional-priced-works"
import type { QuotePlan, WorkBucket } from "./types"

function plan(optional: WorkBucket[]): QuotePlan {
  return {
    quoteType: "landscaping",
    quoteTypeConfidence: "low",
    main: { id: "main", title: "Main", kind: "main", scope: [], labour: [], materials: [], sourceText: "" },
    optional,
    exclusions: [],
    uncertainties: [],
  }
}

function optionalBucket(overrides: Partial<WorkBucket>): WorkBucket {
  return {
    id: "optional-1",
    title: "Optional Ficus Tuffi hedge",
    kind: "optional",
    scope: ["Plant a Ficus Tuffi hedge."],
    labour: [{ raw: "two people one day", people: 2, days: 1, hours: 16, determinacy: "explicit" }],
    materials: [],
    sourceText: "",
    ...overrides,
  }
}

test("optional labour bucket + rate creates one category:labour QuoteOption priced at hours × rate", () => {
  const options = buildOptionalPricedWorks(plan([optionalBucket({})]), "110")
  assert.equal(options.length, 1)
  const option = options[0]
  assert.equal(option.category, "labour")
  assert.equal(option.source, "ai_extraction")
  assert.equal(option.label, "Optional Ficus Tuffi hedge")
  assert.equal(option.lineItems.length, 1)
  assert.equal(option.lineItems[0].quantity, 16)
  assert.equal(option.lineItems[0].unit, "hours")
  assert.equal(option.lineItems[0].unitPrice, 110)
  assert.equal(option.lineItems[0].total, 1760)
  assert.equal(option.subtotal, 1760)
  assert.deepEqual(option.warnings, [])
})

test("no rate gives subtotal 0 and a warning (rate never fabricated)", () => {
  const options = buildOptionalPricedWorks(plan([optionalBucket({})]), null)
  assert.equal(options.length, 1)
  assert.equal(options[0].subtotal, 0)
  assert.equal(options[0].lineItems[0].unitPrice, 0)
  assert.equal(options[0].lineItems[0].total, 0)
  assert.ok(options[0].warnings && options[0].warnings.some((w) => /rate missing/i.test(w)))
})

test("no optional labour gives []", () => {
  assert.deepEqual(buildOptionalPricedWorks(plan([]), "110"), [])
  assert.deepEqual(buildOptionalPricedWorks(plan([optionalBucket({ labour: [] })]), "110"), [])
})

test("skips optional labour with no positive hours", () => {
  const options = buildOptionalPricedWorks(
    plan([optionalBucket({ labour: [{ raw: "some labour", determinacy: "missing" }] })]),
    "110",
  )
  assert.deepEqual(options, [])
})
