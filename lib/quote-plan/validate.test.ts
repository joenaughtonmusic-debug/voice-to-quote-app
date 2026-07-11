import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import type { BuildQuotePlanInput, QuotePlan } from "./types"
import { normaliseDraftQuotePlan, resolveQuotePlan, validateQuotePlan } from "./validate"

/**
 * QuotePlan validation/normalisation — pure, deterministic, no OpenAI. Draft plans below
 * stand in for a future AI planner's output; none of these tests calls a live model.
 */

// A deterministic fallback input for resolveQuotePlan (buildQuotePlan reads this).
function fallbackInput(overrides: Partial<ProcessedQuote> = {}): BuildQuotePlanInput {
  return {
    extraction: {
      ...EMPTY_PROCESSED_QUOTE,
      job_type: "landscaping",
      primary_quote: {
        ...EMPTY_PROCESSED_QUOTE.primary_quote,
        quote_title: "Landscaping",
        job_type: "landscaping",
        scope: ["Lay a new lawn"],
      },
      ...overrides,
    },
    transcript: "Lay a new lawn for a landscaping job.",
    classification: { specialist: "landscaping" },
  }
}

function validPlan(): QuotePlan {
  return {
    quoteType: "landscaping",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Back Lawn Levelling",
      kind: "main",
      scope: ["Construct a small timber retaining wall", "Spread topsoil", "Sow lawn seed"],
      labour: [{ raw: "one person one day", people: 1, days: 1, hours: 8, determinacy: "explicit" }],
      materials: [{ name: "Topsoil", optional: false }],
      measurements: undefined,
      sourceText: "Construct a small timber retaining wall and spread topsoil.",
    },
    optional: [
      {
        id: "optional-1",
        title: "Optional Ficus Tuffi hedge",
        kind: "optional",
        scope: ["Plant a Ficus Tuffi hedge along the fence"],
        labour: [{ raw: "two people one day", people: 2, days: 1, hours: 16, determinacy: "explicit" }],
        materials: [],
        measurements: undefined,
        sourceText: "Optional Ficus Tuffi hedge, labour two people one day.",
      },
    ],
    exclusions: [],
    uncertainties: [],
  }
}

// 1. Valid QuotePlan passes validation.
test("a valid QuotePlan passes validation with no findings", () => {
  assert.deepEqual(validateQuotePlan(validPlan()), [])
})

// 2. Draft AI plan with string numbers can be normalised if safe.
test("string labour/measurement numbers are normalised and accepted", () => {
  const draft = {
    quoteType: "planting",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Planting",
      kind: "main",
      scope: ["Plant a hedge"],
      labour: [{ raw: "1 person 1.5 days", people: "1", days: "1.5", hours: "12", determinacy: "explicit" }],
      materials: [{ name: "Garden mix", quantity: "5", optional: false }],
      measurements: { lengthM: "14.2", spacingMm: "500" },
      sourceText: "Plant a 14.2m hedge at 500mm spacing.",
    },
    optional: [],
  }
  const result = resolveQuotePlan({ draft, fallbackInput: fallbackInput() })
  assert.equal(result.status, "normalised")
  assert.equal(result.plan.main.labour[0].hours, 12)
  assert.equal(result.plan.main.measurements?.lengthM, 14.2)
  assert.equal(result.plan.main.measurements?.spacingMm, 500)
  assert.ok(!result.findings.some((f) => f.severity === "error"))
})

// 2b. A zero-filled OPTIONAL measurement means "not provided" — it must be dropped, not reject
//     the whole plan. (Planners sometimes emit 0 for a field they have no value for.)
test("a zero-filled optional measurement is treated as absent and does not sink the plan", () => {
  const draft = {
    quoteType: "planting",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Planting",
      kind: "main",
      scope: ["Plant a hedge"],
      labour: [{ raw: "1 person 1 day", people: 1, days: 1, determinacy: "explicit" }],
      materials: [],
      // lengthM is real; areaM2/depthMm/count/spacingMm were zero-filled with no value.
      measurements: { lengthM: 14.2, areaM2: 0, depthMm: 0, spacingMm: 0, count: 0 },
      sourceText: "Plant a 14.2m hedge.",
    },
    optional: [],
  }
  const result = resolveQuotePlan({ draft, fallbackInput: fallbackInput() })
  assert.ok(result.status === "accepted" || result.status === "normalised", `status was ${result.status}`)
  assert.ok(!result.findings.some((f) => f.severity === "error"), "zero-filled optionals must not produce errors")
  assert.equal(result.plan.main.measurements?.lengthM, 14.2, "the real measurement is kept")
  assert.equal(result.plan.main.measurements?.areaM2, undefined, "the zero-filled measurement is dropped")
  assert.equal(result.plan.main.measurements?.count, undefined)
})

// 2b-labour. Zero-filled labour numbers (people/days/hours) on a no-labour bucket mean "not
//   provided" — they must be dropped, not reject the plan. (The Sarah/Ellerslie case.)
test("zero-filled labour values are treated as absent and do not sink the plan", () => {
  const draft = {
    quoteType: "landscaping",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Main",
      kind: "main",
      scope: ["Lay a lawn"],
      labour: [{ raw: "one person one day", people: 1, days: 1, hours: 8, determinacy: "explicit" }],
      materials: [],
      sourceText: "Lay a lawn, one person one day.",
    },
    optional: [
      {
        id: "optional-1",
        title: "Optional extra",
        kind: "optional",
        scope: ["Some optional work"],
        // No labour known → planner emitted 0s. Must be dropped, not rejected.
        labour: [{ raw: "optional extra", people: 0, days: 0, hours: 0, determinacy: "missing" }],
        materials: [],
        sourceText: "Optional extra.",
      },
    ],
  }
  const result = resolveQuotePlan({ draft, fallbackInput: fallbackInput() })
  assert.ok(result.status === "accepted" || result.status === "normalised", `status was ${result.status}`)
  assert.ok(!result.findings.some((f) => f.severity === "error"), "zero-filled labour must not produce errors")
  assert.equal(result.plan.main.labour[0].hours, 8, "the real labour value is kept")
  const optionalLabour = result.plan.optional[0].labour[0]
  assert.equal(optionalLabour.people, undefined, "the zero-filled labour value is dropped")
  assert.equal(optionalLabour.hours, undefined)
})

// 2c. A genuinely out-of-range measurement is STILL rejected — the fix must not weaken this.
test("a negative measurement is still rejected (validator not weakened)", () => {
  const draft = {
    quoteType: "planting",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Planting",
      kind: "main",
      scope: ["Plant a hedge"],
      labour: [],
      materials: [],
      measurements: { areaM2: -5 },
      sourceText: "x",
    },
    optional: [],
  }
  const result = resolveQuotePlan({ draft, fallbackInput: fallbackInput() })
  assert.equal(result.status, "fallback", "a negative measurement must still fall back")
  assert.ok(result.findings.some((f) => f.code === "invalid_measurement" && f.severity === "error"))
})

// 3. Draft AI plan with invalid labour values falls back and reports a finding.
test("invalid (negative) labour value falls back to deterministic buildQuotePlan", () => {
  const draft = {
    quoteType: "landscaping",
    main: {
      id: "main",
      title: "Main",
      kind: "main",
      scope: ["Lay a lawn"],
      labour: [{ raw: "bad", hours: -3, determinacy: "explicit" }],
      materials: [],
      sourceText: "Lay a lawn.",
    },
    optional: [],
  }
  const result = resolveQuotePlan({ draft, fallbackInput: fallbackInput() })
  assert.equal(result.status, "fallback")
  assert.ok(result.findings.some((f) => f.code === "invalid_labour_value" && f.severity === "error"))
  // Fallback plan is the deterministic one (no bogus -3 hours).
  assert.ok(!result.plan.main.labour.some((l) => l.hours === -3))
})

// 4. Draft AI plan with optional labour incorrectly in main is rejected (fallback + finding).
test("optional labour mis-attributed to the main bucket is rejected", () => {
  const draft = {
    quoteType: "landscaping",
    main: {
      id: "main",
      title: "Main",
      kind: "main",
      scope: ["Lay a lawn"],
      labour: [{ raw: "optional Ficus hedge labour two people one day", people: 2, days: 1, hours: 16, determinacy: "explicit" }],
      materials: [],
      sourceText: "Lay a lawn.",
    },
    optional: [],
  }
  const result = resolveQuotePlan({ draft, fallbackInput: fallbackInput() })
  assert.equal(result.status, "fallback")
  assert.ok(result.findings.some((f) => f.code === "optional_labour_in_main" && f.severity === "error"))
})

// 5. Draft AI plan with a retaining-wall measurement assigned as a planting measurement is rejected.
test("a structural (retaining wall) length attributed as a planting measurement is rejected", () => {
  const draft = {
    quoteType: "landscaping",
    main: {
      id: "main",
      title: "Retaining wall",
      kind: "main",
      scope: ["Build a retaining wall"],
      labour: [],
      materials: [],
      measurements: { lengthM: 16.8, provenance: ["16.8m for the retaining wall"] },
      sourceText: "16.8m for the retaining wall.",
    },
    optional: [],
  }
  const result = resolveQuotePlan({ draft, fallbackInput: fallbackInput() })
  assert.equal(result.status, "fallback")
  assert.ok(
    result.findings.some((f) => f.code === "plant_measurement_on_structural_bucket" && f.severity === "error"),
  )
})

// 6. Draft AI plan missing the main bucket falls back.
test("a draft plan with no main bucket falls back", () => {
  const result = resolveQuotePlan({ draft: { quoteType: "landscaping", optional: [] }, fallbackInput: fallbackInput() })
  assert.equal(result.status, "fallback")
  assert.ok(result.findings.some((f) => f.code === "missing_main_bucket"))
  // The deterministic fallback still yields a usable main bucket.
  assert.equal(result.plan.main.kind, "main")
})

test("a non-object draft falls back", () => {
  const result = resolveQuotePlan({ draft: "not a plan", fallbackInput: fallbackInput() })
  assert.equal(result.status, "fallback")
  assert.ok(result.findings.some((f) => f.code === "plan_not_object"))
})

test("a null draft uses the deterministic plan (fallback)", () => {
  const result = resolveQuotePlan({ draft: null, fallbackInput: fallbackInput() })
  assert.equal(result.status, "fallback")
  assert.ok(result.findings.some((f) => f.code === "no_draft_plan"))
})

// Structural integrity: a bucket that is both main and optional / wrong kind.
test("a bucket declared with the wrong kind is rejected", () => {
  const plan = validPlan()
  plan.optional[0].kind = "main"
  assert.ok(validateQuotePlan(plan).some((f) => f.code === "optional_bucket_wrong_kind" && f.severity === "error"))
})

test("normaliseDraftQuotePlan defaults a missing bucket kind and records the change", () => {
  const { plan, changed } = normaliseDraftQuotePlan({
    quoteType: "landscaping",
    main: { id: "main", title: "Main", scope: ["Lay a lawn"], labour: [], materials: [], sourceText: "x" },
    optional: [],
  })
  assert.ok(plan)
  assert.equal(plan!.main.kind, "main")
  assert.equal(changed, true)
})

// 7. Client B/Titirangi-style mocked AI plan validates end-to-end.
test("Client B/Titirangi-style mocked AI plan validates and is accepted", () => {
  const draft = {
    quoteType: "landscaping",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Back Lawn Levelling Quote",
      kind: "main",
      scope: [
        "Construct a small timber retaining wall approximately 400mm high",
        "Install polythene along the fence",
        "Import and spread topsoil across the lawn area",
        "Sow lawn seed to establish the new lawn",
      ],
      labour: [],
      materials: [
        { name: "Polythene", optional: false },
        { name: "Topsoil", optional: false },
        { name: "Lawn seed — 5kg bag", optional: false },
      ],
      // No planting length on the (structural) main bucket — no fake retaining-wall plant.
      measurements: undefined,
      sourceText: "Retaining wall, polythene, topsoil, lawn seed.",
    },
    optional: [
      {
        id: "optional-1",
        title: "Optional Ficus Tuffi hedge",
        kind: "optional",
        scope: ["Plant a Ficus Tuffi hedge along the fence"],
        labour: [{ raw: "two people one day", people: 2, days: 1, hours: 16, determinacy: "explicit" }],
        materials: [],
        sourceText: "Optional Ficus Tuffi hedge, labour two people one day.",
      },
    ],
    exclusions: [],
    uncertainties: [],
  }

  const result = resolveQuotePlan({ draft, fallbackInput: fallbackInput() })
  assert.ok(result.status === "accepted" || result.status === "normalised", `expected accept/normalise, got ${result.status}: ${JSON.stringify(result.findings)}`)
  assert.ok(!result.findings.some((f) => f.severity === "error"))

  const scopeText = result.plan.main.scope.join(" ").toLowerCase()
  for (const needle of ["retaining wall", "polythene", "topsoil", "lawn seed"]) {
    assert.ok(scopeText.includes(needle), `main scope must include "${needle}"`)
  }
  const ficus = result.plan.optional.find((b) => /ficus/i.test(b.title))
  assert.ok(ficus, "optional Ficus bucket must exist")
  const hedgeLabour = ficus!.labour.find((l) => l.people === 2 && l.days === 1)
  assert.ok(hedgeLabour, "optional Ficus labour must be 2 people × 1 day")
  // No structural bucket carries a planting length (no fabricated retaining-wall plant option).
  for (const bucket of [result.plan.main, ...result.plan.optional]) {
    assert.notEqual(bucket.measurements?.lengthM, 16.8, "no retaining-wall length as a planting measurement")
  }
})
