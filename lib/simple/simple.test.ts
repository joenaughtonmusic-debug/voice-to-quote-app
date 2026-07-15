import assert from "node:assert/strict"
import test from "node:test"

import { normalizeSimpleExtraction } from "./extraction"
import { DEFAULT_LABOUR_RATE, resolveSimplePricing } from "./pricing"
import { renderCustomerBody, renderInternalNotes, renderPriceLines, simpleQuoteTitle } from "./templates"
import { buildSimpleXeroPayload } from "./xero"
import type { SimpleQuote } from "./types"

/**
 * Golden acceptance tests. The dollar figures come from real sent quotes —
 * docs/reference_quotes/ANSWER_KEYS.md — plus the Dan / 54 Marua Road job that
 * motivated Simple Mode. Fixtures are confirmed SimpleQuote states (what the
 * confirm screen produces); the AI leg is covered by the live smoke harness.
 */

function baseQuote(overrides: Partial<SimpleQuote>): SimpleQuote {
  return {
    jobType: "tidy",
    clientName: "",
    siteAddress: "",
    frequency: "monthly",
    frequencyOther: "",
    frequencyNote: "",
    tasks: [],
    statedTotalHours: null,
    spokenRate: null,
    spokenTotal: null,
    manualTotal: null,
    greenwaste: { treatment: "not_mentioned", amount: null, note: null },
    extras: [],
    internalNotes: [],
    rawTranscript: "",
    ...overrides,
  }
}

function payloadLineTotal(payload: ReturnType<typeof buildSimpleXeroPayload>) {
  return Math.round(payload.quote.xeroLineItemsArray.reduce((sum, line) => sum + line.UnitAmount * line.Quantity, 0) * 100) / 100
}

// --- 1. Dan — 54 Marua Road (the job that failed in the old pipeline) ---

function danQuote(): SimpleQuote {
  return baseQuote({
    jobType: "maintenance",
    clientName: "Dan",
    siteAddress: "54 Marua Road",
    tasks: [
      { description: "Trim Tecoma hedge tips and hard on side", hours: 1.5 },
      { description: "Trim Michelia", hours: 1 },
      { description: "Weed spray rock wall", hours: 0.5 },
    ],
    statedTotalHours: 3.5,
    spokenTotal: 300,
    greenwaste: { treatment: "included", amount: null, note: null },
  })
}

test("Dan: spoken $300 wins over hours × default rate", () => {
  const pricing = resolveSimplePricing(danQuote())
  assert.equal(pricing.labourAmount, 300)
  assert.equal(pricing.pricingSource, "spoken")
  assert.equal(pricing.rateWasDefaulted, false)
  assert.equal(pricing.total, 300)
})

test("Dan: without a spoken total, defaults to 3.5h × $80 and is loudly flagged", () => {
  const pricing = resolveSimplePricing({ ...danQuote(), spokenTotal: null })
  assert.equal(pricing.labourAmount, 3.5 * DEFAULT_LABOUR_RATE)
  assert.equal(pricing.pricingSource, "hours_x_default_rate")
  assert.equal(pricing.rateWasDefaulted, true)

  const payload = buildSimpleXeroPayload({ ...danQuote(), spokenTotal: null })
  assert.ok(payload.quote.exportWarnings.some((warning) => warning.includes("default $80/hr")))
})

test("Dan: stated total hours beat the per-task sum", () => {
  const pricing = resolveSimplePricing({ ...danQuote(), spokenTotal: null, statedTotalHours: 3.5, tasks: [] })
  assert.equal(pricing.hoursUsed, 3.5)
})

test("Dan: maintenance body uses the fixed template, no hours in customer text", () => {
  const quote = danQuote()
  const body = renderCustomerBody(quote)
  assert.equal(simpleQuoteTitle(quote), "Ongoing Monthly Garden Maintenance – 54 Marua Road")
  assert.ok(body.includes("Each visit may include:"))
  assert.ok(body.includes("Trim Tecoma hedge tips and hard on side"))
  assert.ok(!/\b\d+(\.\d+)?\s*hours?\b/i.test(body), "customer body must not contain hour figures")
  const priceLines = renderPriceLines(quote, resolveSimplePricing(quote))
  assert.ok(priceLines.includes("$300 per visit"))
  assert.ok(priceLines.includes("Includes GST (15%): $39.13"))
})

// --- 2. Nadia — 1a Meyrick Place (QU-0521, 6-weekly) — total $333.50, GST $43.50 ---

function nadiaQuote(): SimpleQuote {
  return baseQuote({
    jobType: "maintenance",
    clientName: "Nadia",
    siteAddress: "1a Meyrick Place, Meadowbank",
    frequency: "6-weekly",
    spokenTotal: 285,
    greenwaste: { treatment: "separate_line", amount: 26.5, note: "range $26.50–$66.25" },
    extras: [
      { name: "Sprays / Extras", amount: 10 },
      { name: "Tool Maintenance / Servicing", amount: 12 },
    ],
  })
}

test("Nadia QU-0521: $285 visit + greenwaste + extras = $333.50 incl. GST $43.50", () => {
  const pricing = resolveSimplePricing(nadiaQuote())
  assert.equal(pricing.total, 333.5)
  assert.equal(pricing.gst, 43.5)
  assert.equal(pricing.lines.length, 4)
  assert.ok(pricing.lines.some((line) => line.description === "Removal of greenwaste" && line.amount === 26.5))

  const payload = buildSimpleXeroPayload(nadiaQuote())
  assert.equal(payloadLineTotal(payload), 333.5)
  assert.equal(payload.quote.title, "6-Weekly Garden Maintenance")
})

// --- 3. Brett — 19a Blockhouse Bay Road (QU-0569, 2-monthly + lawns) — total $474.50, GST $61.89 ---

function brettQuote(): SimpleQuote {
  return baseQuote({
    jobType: "maintenance",
    clientName: "Brett",
    siteAddress: "19a Blockhouse Bay Road",
    frequency: "2-monthly",
    frequencyNote: "Lawn mowing carried out between visits, increasing over summer",
    spokenTotal: 467.5,
    greenwaste: { treatment: "included", amount: null, note: null },
    extras: [{ name: "Petrol for mower", amount: 7 }],
  })
}

test("Brett QU-0569: $467.50 visit + petrol = $474.50 incl. GST $61.89, greenwaste folded", () => {
  const quote = brettQuote()
  const pricing = resolveSimplePricing(quote)
  assert.equal(pricing.total, 474.5)
  assert.equal(pricing.gst, 61.89)
  assert.ok(!pricing.lines.some((line) => line.kind === "greenwaste"), "included greenwaste must not be its own line")

  const body = renderCustomerBody(quote)
  assert.ok(body.includes("greenwaste removal"), "included greenwaste stays in the service wording")
  assert.ok(body.includes("Lawn mowing carried out between visits"))
  assert.equal(payloadLineTotal(buildSimpleXeroPayload(quote)), 474.5)
})

// --- 4. Dave — 88b Kurahaupo Street (QU-0570, tidy) — total $479.75, GST $62.57; Friday note stays internal ---

function daveQuote(): SimpleQuote {
  return baseQuote({
    jobType: "tidy",
    clientName: "Dave Ross",
    siteAddress: "88b Kurahaupo Street, Orakei",
    tasks: [
      { description: "Tidy leaves and weeding at the back", hours: null },
      { description: "Cut back roses", hours: null },
      { description: "Weed steps and side pathway", hours: null },
    ],
    spokenTotal: 440,
    greenwaste: { treatment: "separate_line", amount: 39.75, note: null },
    internalNotes: ["Do the blowdown on Friday"],
  })
}

test("Dave QU-0570: $440 + greenwaste $39.75 = $479.75 incl. GST $62.57", () => {
  const pricing = resolveSimplePricing(daveQuote())
  assert.equal(pricing.total, 479.75)
  assert.equal(pricing.gst, 62.57)
})

test("Dave QU-0570: internal Friday note never reaches the customer or Xero", () => {
  const quote = daveQuote()
  const body = renderCustomerBody(quote)
  const priceLines = renderPriceLines(quote, resolveSimplePricing(quote))
  assert.ok(!body.includes("Friday") && !priceLines.includes("Friday"))

  const payload = buildSimpleXeroPayload(quote)
  assert.ok(!JSON.stringify(payload).includes("Friday"), "internal note leaked into the Xero payload")

  const internal = renderInternalNotes(quote, resolveSimplePricing(quote))
  assert.ok(internal.includes("Do the blowdown on Friday"))
})

// --- 5. Xavier — 90a Owens Road (QU-0572, tidy) — total $798.88, GST $104.20 ---

function xavierQuote(): SimpleQuote {
  return baseQuote({
    jobType: "tidy",
    clientName: "Xavier Begg",
    siteAddress: "90a Owens Road",
    tasks: [
      { description: "Tidy rear and side gardens", hours: null },
      { description: "Spray kumara vine with extra-strength weedkiller", hours: null },
      { description: "Trim and clear star jasmine from gutters", hours: null },
    ],
    spokenTotal: 720,
    greenwaste: { treatment: "separate_line", amount: 72.88, note: "half trailer load" },
    extras: [{ name: "Weedkiller — extra strength", amount: 6 }],
  })
}

test("Xavier QU-0572: $720 + greenwaste $72.88 + weedkiller $6 = $798.88 incl. GST $104.20", () => {
  const pricing = resolveSimplePricing(xavierQuote())
  assert.equal(pricing.total, 798.88)
  assert.equal(pricing.gst, 104.2)
  assert.equal(payloadLineTotal(buildSimpleXeroPayload(xavierQuote())), 798.88)
})

// --- 6. Curzon Street — the fixed monthly maintenance body, verbatim slots ---

test("Curzon Street: monthly body renders the fixed template wording", () => {
  const quote = baseQuote({
    jobType: "maintenance",
    clientName: "Curzon",
    siteAddress: "6 Curzon Street",
    frequency: "monthly",
    spokenTotal: 405,
    greenwaste: { treatment: "included", amount: null, note: null },
  })
  const body = renderCustomerBody(quote)
  assert.ok(body.startsWith("Ongoing Monthly Garden Maintenance – 6 Curzon Street"))
  assert.ok(
    body.includes(
      "Price reflects the monthly service fee and includes ongoing garden maintenance, greenwaste removal, and spraying (pesticides and herbicides as required)",
    ),
  )
  assert.ok(body.includes("Scheduled visits to maintain the overall presentation, health, and condition of the garden."))
  assert.ok(body.includes("Hedge trimming and shaping as required"))
  assert.ok(body.includes("Blow down of work areas on completion"))
})

// --- 7. Guard rails ---

test("unpriced quote: no total shown and Xero export refuses", () => {
  const quote = baseQuote({ jobType: "tidy", clientName: "Someone", tasks: [{ description: "Tidy", hours: null }] })
  const pricing = resolveSimplePricing(quote)
  assert.equal(pricing.total, null)
  assert.equal(pricing.pricingSource, "unpriced")
  assert.throws(() => buildSimpleXeroPayload(quote), /unpriced/i)
})

test("an extra with no spoken amount is excluded from the total, never silently rolled in", () => {
  const quote = baseQuote({
    jobType: "tidy",
    spokenTotal: 100,
    extras: [{ name: "Mulch top-up", amount: null }],
  })
  const pricing = resolveSimplePricing(quote)
  assert.equal(pricing.total, 100)
  assert.ok(pricing.pendingLines.some((line) => line.description.includes("Mulch top-up")))
  const priceLines = renderPriceLines(quote, pricing)
  assert.ok(priceLines.includes("any line still to be confirmed is excluded"))
})

test("manual edit on the confirm screen overrides the spoken price", () => {
  const pricing = resolveSimplePricing({ ...danQuote(), manualTotal: 320 })
  assert.equal(pricing.labourAmount, 320)
  assert.equal(pricing.pricingSource, "manual")
})

test("maintenance body makes no greenwaste claim when greenwaste was never mentioned", () => {
  const quote = baseQuote({
    jobType: "maintenance",
    siteAddress: "1 Example Street",
    spokenTotal: 300,
    greenwaste: { treatment: "not_mentioned", amount: null, note: null },
  })
  const body = renderCustomerBody(quote)
  assert.ok(!/greenwaste/i.test(body), "unconfirmed greenwaste must not be promised to the customer")
})

test("6-monthly cadence via 'other' frequency carries through title and body", () => {
  const quote = baseQuote({
    jobType: "maintenance",
    siteAddress: "1 Example Street",
    frequency: "other",
    frequencyOther: "6-monthly",
    spokenTotal: 500,
  })
  assert.equal(simpleQuoteTitle(quote), "Ongoing 6-monthly Garden Maintenance – 1 Example Street")
  assert.ok(renderCustomerBody(quote).includes("Pricing is based on 6-monthly service frequency."))
})

test("normalizeSimpleExtraction: junk becomes nulls and empties, never guesses", () => {
  const extraction = normalizeSimpleExtraction({
    client_name: "  ",
    site_address: 42,
    frequency: "weekly",
    tasks: [{ description: "Trim hedge", hours: -2 }, { description: "" }, "junk"],
    stated_total_hours: "3.5",
    spoken_total: 0,
    greenwaste: { treatment: "sometimes", amount: -5 },
    extras: [{ name: "Petrol", amount: 7 }, { amount: 3 }],
    internal_notes: ["note", 7, ""],
  })
  assert.equal(extraction.client_name, null)
  assert.equal(extraction.site_address, null)
  assert.equal(extraction.frequency, null)
  assert.deepEqual(extraction.tasks, [{ description: "Trim hedge", hours: null }])
  assert.equal(extraction.stated_total_hours, null)
  assert.equal(extraction.spoken_total, null)
  assert.equal(extraction.greenwaste.treatment, "not_mentioned")
  assert.equal(extraction.greenwaste.amount, null)
  assert.deepEqual(extraction.extras, [{ name: "Petrol", amount: 7 }])
  assert.deepEqual(extraction.internal_notes, ["note"])
})
