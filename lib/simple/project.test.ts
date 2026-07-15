import assert from "node:assert/strict"
import test from "node:test"

import { matchBulkMaterial } from "./materials-prices"
import { computeProject, projectAreasWithDefaults, projectPricing, renderProjectBody } from "./project"
import { simpleQuoteFromDraft, toSimpleDraftFields } from "./draft-row"
import { renderCustomerBody, renderInternalNotes, renderPriceLines } from "./templates"
import { buildSimpleXeroPayload } from "./xero"
import type { ProjectArea, SimpleQuote } from "./types"

/**
 * Golden acceptance test: the real "weedmat + pebbles" job (15 Jul 2026).
 * Targets computed by the deterministic engine rules Joe confirmed:
 * $80/hr incl. GST, 15% contingency, pebbles area×50mm×1.10 pooled to 0.5m³
 * steps, weedmat per area, pins pooled, delivery $219 allowance.
 * Combined target: $4,495.50 incl. GST $586.38.
 */

function area(partial: Partial<ProjectArea> & { name: string }): ProjectArea {
  return {
    lengthM: null,
    widthM: null,
    widthAssumed: false,
    extraM2: null,
    tasks: [],
    blockHours: null,
    surfaceMaterial: "",
    depthMm: 50,
    needsWeedmat: false,
    plantsCount: null,
    ...partial,
  }
}

function weedmatJob(): SimpleQuote {
  return {
    jobType: "project",
    clientName: "Customer",
    siteAddress: "1 Example Street",
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
    project: {
      contingencyPct: 15,
      deliveryAmount: 219,
      areas: [
        area({
          name: "Driveway fence-line",
          lengthM: 19,
          widthM: 0.3,
          surfaceMaterial: "river pebbles",
          needsWeedmat: true,
          plantsCount: 9,
          tasks: [
            { description: "Spray weeds", hours: 0.5 },
            { description: "Remove scoring and old weedmat", hours: 6 },
            { description: "New weedmat and spread pebbles", hours: 5 },
            { description: "Plant 9 plants", hours: 1 },
            { description: "Tidy", hours: 1 },
          ],
        }),
        area({
          name: "Beside house",
          lengthM: 16,
          widthM: 0.5,
          widthAssumed: true,
          extraM2: 1,
          surfaceMaterial: "pebbles",
          needsWeedmat: true,
          tasks: [
            { description: "Spray weeds", hours: 0.5 },
            { description: "Remove weeds and old material", hours: 3 },
            { description: "Dig out below ground level 5cm", hours: 4 },
            { description: "New weedmat, cut around Buxus and Hydrangea and Rose", hours: 4 },
            { description: "Spread pebbles", hours: 3 },
            { description: "Plant plants", hours: 2 },
            { description: "Tidy", hours: 1.5 },
          ],
        }),
        area({
          name: "Under hedge",
          lengthM: 11,
          widthM: 0.5,
          widthAssumed: true,
          surfaceMaterial: "river pebbles",
          needsWeedmat: true,
          blockHours: 8,
          tasks: [{ description: "Spray, remove, new weedmat, pebbles", hours: null }],
        }),
      ],
    },
  }
}

test("weedmat job: per-area labour at $80/hr + 15% contingency", () => {
  const computation = computeProject(weedmatJob())
  const [driveway, house, hedge] = computation.areas
  assert.equal(driveway.baseHours, 13.5)
  assert.equal(driveway.quotedHours, 15.52)
  assert.equal(driveway.labour, 1241.6)
  assert.equal(house.baseHours, 18)
  assert.equal(house.quotedHours, 20.7)
  assert.equal(house.labour, 1656)
  assert.equal(hedge.baseHours, 8)
  assert.equal(hedge.quotedHours, 9.2)
  assert.equal(hedge.labour, 736)
  assert.equal(computation.totalBaseHours, 39.5)
})

test("weedmat job: materials from list prices — pooled pebbles, per-area weedmat, pooled pins", () => {
  const computation = computeProject(weedmatJob())
  const byDescription = Object.fromEntries(computation.materialLines.map((line) => [line.description, line.amount]))
  // Pebbles pooled: 0.3135 + 0.495 + 0.3025 = 1.111 m³ → 1.5 m³ × $343.85
  assert.equal(byDescription["River pebbles 20/40 — 1.5 m³"], 515.78)
  // Weedmat: driveway narrow roll; house + hedge one wide roll each
  assert.equal(byDescription["Weedmat Saxon 0.9 x 10 m"], 9.88)
  assert.equal(byDescription["Weedmat Saxon 1.8 x 10 m × 2"], 43.68)
  // Pins pooled: 22.22 m² of mat → 2 packs
  assert.equal(byDescription["Weedmat pins 130mm (150 pack) × 2"], 73.56)
  assert.equal(byDescription["Materials delivery (allowance)"], 219)
})

test("weedmat job: combined total $4,495.50 incl. GST $586.38", () => {
  const pricing = projectPricing(weedmatJob())
  assert.equal(pricing.total, 4495.5)
  assert.equal(pricing.gst, 586.38)
  assert.equal(pricing.pricingSource, "computed_rules")
})

test("weedmat job: plants and disposal flagged, never rolled into the total", () => {
  const pricing = projectPricing(weedmatJob())
  assert.ok(pricing.pendingLines.some((line) => line.description.includes("9 plants")))
  assert.ok(pricing.pendingLines.some((line) => /disposal/i.test(line.description)))
  const priceLines = renderPriceLines(weedmatJob(), pricing)
  assert.ok(priceLines.includes("any line still to be confirmed is excluded"))
})

test("weedmat job: assumed widths flagged in internal view, absent from customer body", () => {
  const quote = weedmatJob()
  const internal = renderInternalNotes(quote, projectPricing(quote))
  assert.ok(internal.includes("WIDTH ASSUMED"))
  assert.ok(internal.includes("width assumed — measure before ordering materials"))

  const body = renderCustomerBody(quote)
  assert.ok(!/assumed|width/i.test(body), "assumptions are internal, not customer-facing")
  assert.ok(!/\b\d+(\.\d+)?\s*hours?\b/i.test(body), "no hour figures in customer text")
  assert.ok(body.includes("Driveway fence-line:"))
  assert.ok(body.includes("Planting of 9 plants (selection to be confirmed)"))
})

test("weedmat job: Xero payload — body on first labour line, account codes, line sum = total", () => {
  const quote = weedmatJob()
  const payload = buildSimpleXeroPayload(quote)
  const lines = payload.quote.xeroLineItemsArray
  assert.equal(payload.quote.title, "Garden Improvement Works")
  assert.ok(lines[0].Description.startsWith("Garden Improvement Works – 1 Example Street"))
  assert.equal(lines[0].AccountCode, "10010")
  assert.ok(lines.filter((line) => line.AccountCode === "10010").length === 3, "one labour line per area")
  const sum = Math.round(lines.reduce((total, line) => total + line.UnitAmount * line.Quantity, 0) * 100) / 100
  assert.equal(sum, 4495.5)
})

test("weedmat job: draft round-trip restores the project state", () => {
  const quote = weedmatJob()
  const fields = toSimpleDraftFields(quote, "user-123")
  assert.equal(fields.job_type, "Project (Simple)")
  const restored = simpleQuoteFromDraft({ quote_options: fields.quote_options })
  assert.deepEqual(restored, quote)
})

test("unmatched material is flagged, not priced; no dimensions blocks materials not labour", () => {
  const quote = weedmatJob()
  quote.project!.areas = [
    area({
      name: "Side strip",
      lengthM: 4,
      widthM: 0.4,
      surfaceMaterial: "crushed lime chip",
      tasks: [{ description: "Remove and relay", hours: 2 }],
    }),
    area({ name: "No-measure bed", surfaceMaterial: "black mulch", tasks: [{ description: "Mulch bed", hours: 1 }] }),
  ]
  quote.project!.deliveryAmount = null
  const computation = computeProject(quote)
  assert.ok(computation.reviewNotices.some((notice) => notice.includes('"crushed lime chip" not on the price list')))
  assert.ok(computation.reviewNotices.some((notice) => notice.includes("no dimensions")))
  assert.equal(computation.materialLines.length, 0)
  assert.equal(computation.labourLines.length, 2)
})

test("laying tasks set the material when surface_material is missing; removal tasks do not", () => {
  const quote = weedmatJob()
  quote.project!.areas = [
    area({
      name: "Bed",
      lengthM: 10,
      widthM: 0.5,
      surfaceMaterial: "",
      tasks: [
        { description: "Remove old scoria", hours: 2 },
        { description: "Spread pebbles", hours: 2 },
      ],
    }),
  ]
  quote.project!.deliveryAmount = null
  const computation = computeProject(quote)
  // "Spread pebbles" (a laying task) prices river pebbles; "Remove old scoria" must not set scoria.
  assert.ok(computation.materialLines.some((line) => line.description.startsWith("River pebbles 20/40")))
  assert.ok(!computation.materialLines.some((line) => /scoria/i.test(line.description)))
})

test("dictation typo 'Sprea pebbles' still prices pebbles (live-observed miss)", () => {
  const quote = weedmatJob()
  quote.project!.areas = [
    area({
      name: "Bed",
      lengthM: 10,
      widthM: 0.5,
      surfaceMaterial: "",
      tasks: [{ description: "Sprea pebbles", hours: 3 }],
    }),
  ]
  quote.project!.deliveryAmount = null
  const computation = computeProject(quote)
  assert.ok(computation.materialLines.some((line) => line.description.startsWith("River pebbles 20/40")))
})

test("material mentioned in tasks but unpriceable → loud warning, not a silent miss", () => {
  const quote = weedmatJob()
  quote.project!.areas = [
    area({
      name: "Bed",
      lengthM: 10,
      widthM: 0.5,
      surfaceMaterial: "",
      tasks: [{ description: "Spread crushed shell chip", hours: 2 }],
    }),
  ]
  const computation = computeProject(quote)
  assert.ok(computation.reviewNotices.some((notice) => notice.includes("none is priced — set the material")))
})

test("block-hours area with no tasks gets an honest synthesized customer scope", () => {
  const quote = weedmatJob()
  const body = renderProjectBody({
    ...quote,
    project: {
      ...quote.project!,
      areas: [
        area({
          name: "Under hedge",
          lengthM: 11,
          widthM: 0.5,
          blockHours: 8,
          surfaceMaterial: "river pebbles",
          needsWeedmat: true,
        }),
      ],
    },
  })
  assert.ok(body.includes("Under hedge:\nClear and prepare the area\nInstall new weedmat\nSpread river pebbles 20/40"))
})

test("material matcher: gap40/scoria/mulch variants match; nonsense does not", () => {
  assert.equal(matchBulkMaterial("Spread gap 40 100mm"), "gap_40")
  assert.equal(matchBulkMaterial("scoria"), "scoria_25")
  assert.equal(matchBulkMaterial("black mulch topup"), "black_mulch")
  assert.equal(matchBulkMaterial("river pebbles 20/40"), "river_pebbles_20_40")
  assert.equal(matchBulkMaterial("13mm pebbles"), "river_pebbles_13")
  assert.equal(matchBulkMaterial("mystery product"), null)
})

test("projectAreasWithDefaults: missing width becomes 0.5m flagged; spoken width untouched", () => {
  const [assumed, spoken] = projectAreasWithDefaults([
    area({ name: "A", lengthM: 10, widthM: null }),
    area({ name: "B", lengthM: 10, widthM: 0.3 }),
  ])
  assert.equal(assumed.widthM, 0.5)
  assert.equal(assumed.widthAssumed, true)
  assert.equal(spoken.widthM, 0.3)
  assert.equal(spoken.widthAssumed, false)
})

test("manual total override wins for a project", () => {
  const quote = { ...weedmatJob(), manualTotal: 4200 }
  const pricing = projectPricing(quote)
  assert.equal(pricing.total, 4200)
  assert.equal(pricing.pricingSource, "manual")
})

test("empty project is unpriced and export refuses", () => {
  const quote = weedmatJob()
  quote.project!.areas = []
  quote.project!.deliveryAmount = null
  const pricing = projectPricing(quote)
  assert.equal(pricing.total, null)
  assert.throws(() => buildSimpleXeroPayload(quote), /unpriced/i)
})

test("renderProjectBody used via renderCustomerBody for project jobType", () => {
  const quote = weedmatJob()
  assert.equal(renderCustomerBody(quote), renderProjectBody(quote))
})
