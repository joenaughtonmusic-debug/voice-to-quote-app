import assert from "node:assert/strict"
import test from "node:test"

import type { GoldenQuoteFixture } from "./contracts"
import { clientBTitirangi } from "./fixtures/client-b-titirangi"
import { gardenBedRenovation } from "./fixtures/garden-bed-renovation"
import { micheliaPlanting } from "./fixtures/michelia-planting"
import { buildProjectionFromQuote, formatContractReport, runGoldenQuote, runGoldenQuoteThroughPipeline } from "./runner"
import { reviewQuote } from "../quote-overseer"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import { processTranscriptToQuote, type ProcessTranscriptDeps } from "../pipeline/process-transcript"

/**
 * Golden Quote Runner — headless regression harness.
 *
 * WHAT IS REAL: for each golden quote we run the app's own customer-preview
 * render, Quote Auditor, JMS formatter and internal-section builder against a
 * ProcessedQuote, and assert declarative contracts across every output layer.
 *
 * TWO PATHS:
 *  - Fixture path (all quotes): each fixture's buildProcessedQuote() stubs the
 *    AI-extracted fields and rebuilds the deterministic parts with real helpers.
 *  - Pipeline path (Michelia, QA-5): runs the transcript through the REAL
 *    extracted pipeline (processTranscriptToQuote) with mocked OpenAI deps, so
 *    the deterministic post-processing + labour recovery + auditor are exercised
 *    end-to-end. Only the two OpenAI calls (classify, extractQuote) are mocked.
 *
 * See docs/GOLDEN_QUOTE_RUNNER.md.
 */

const FIXTURES: GoldenQuoteFixture[] = [micheliaPlanting, gardenBedRenovation, clientBTitirangi]

function assertReportPasses(fixture: GoldenQuoteFixture) {
  const { report } = runGoldenQuote(fixture)
  const failing = report.checks.filter((c) => !c.passed)
  assert.equal(
    failing.length,
    0,
    `${fixture.name} has failing contract checks:\n${formatContractReport(report)}`,
  )
}

test("Golden Quote 1 — Michelia planting (PIPELINE-BACKED): contract holds through the real processTranscriptToQuote", async () => {
  // QA-5: drives the Michelia transcript through the REAL extracted pipeline
  // (processTranscriptToQuote) with mocked OpenAI deps — no live OpenAI, no
  // browser — then asserts the same Michelia contract against the real result.
  const { projection, report } = await runGoldenQuoteThroughPipeline(micheliaPlanting)

  const failing = report.checks.filter((c) => !c.passed)
  assert.equal(
    failing.length,
    0,
    `Michelia pipeline-backed run has failing contract checks:\n${formatContractReport(report)}`,
  )

  // Explicit QA-5 assertions against the real pipeline output.
  assert.ok(projection.quote.audit_result, "audit_result must exist")
  assert.equal(projection.quote.job_type, "planting")
  assert.equal(projection.quote.client_name, "Client A")
  assert.match(projection.quote.site_address, /10 Willow Lane, Mount Wellington/)
  assert.equal(projection.quote.plant_calculator_results?.[0]?.plant_count, 30)
  assert.equal(projection.quote.plant_calculator_results?.[0]?.spacing_mm, 500)
  assert.ok(
    projection.quote.materials.some((m) => /garden mix/i.test(m)),
    "garden mix must remain as a material (not a $5 pricing fact)",
  )
  assert.equal(projection.labourLine?.quantity, "12", "labour recovered to 12 hours")
  assert.equal(projection.labourLine?.total, "1320", "12 × $110 = $1,320")

  const jms = projection.jmsLines.join("\n")
  assert.ok(!/1\.5 days hours/i.test(jms), "must not contain '1.5 days hours'")
  assert.ok(!/Total 165(\.00)?\b/.test(jms), "must not contain 165.00")

  assert.ok(
    projection.quote.optional_quotes.some((o) => o.scope.some((s) => /timber board border/i.test(s))),
    "optional timber border must remain optional",
  )
  assert.ok(/Michelia/.test(projection.customerText), "customer preview includes Michelia")
  assert.ok(!/long hedge/i.test(projection.customerText), "no 'long hedge'")
  assert.ok(!/metres long\. The/i.test(projection.customerText), "no 'metres long. The'")
  // Milestone 2 — a TRUE planting quote still uses the planting presentation.
  assert.equal(projection.quote.render_intent?.mainIsPlanting, true, "Michelia primary work is planting")
  assert.equal(projection.rendererPath, "planting-presentation", "true planting quote uses planting presentation")
  // Slice 3b regression: no optional_priced_works → no empty optional works section.
  assert.ok(!/not included in the main quote/i.test(projection.customerText), "no spurious optional works section")
})

test("Golden Quote 1 — Michelia planting: contract holds across all layers", () => {
  assertReportPasses(micheliaPlanting)
})

test("Golden Quote 2 — Garden bed renovation: contract holds across all layers", () => {
  assertReportPasses(gardenBedRenovation)
})

test("Golden Quote 2 — Garden bed renovation (PIPELINE-BACKED): contract holds through the real processTranscriptToQuote", async () => {
  // QA-6: drives the Garden Bed transcript through the REAL extracted pipeline
  // (processTranscriptToQuote) with mocked OpenAI deps — no live OpenAI, no
  // browser. The mocked extraction has NO labour line, so the real pipeline must
  // recover 17h/$1,870 via applyPerTaskHourAllowances. Same contract asserted.
  const { projection, report } = await runGoldenQuoteThroughPipeline(gardenBedRenovation)

  const failing = report.checks.filter((c) => !c.passed)
  assert.equal(
    failing.length,
    0,
    `Garden bed pipeline-backed run has failing contract checks:\n${formatContractReport(report)}`,
  )

  // Explicit QA-6 assertions against the real pipeline output.
  assert.ok(projection.quote.audit_result, "audit_result must exist")
  assert.match(projection.quote.job_type, /general_landscaping|garden_bed_renovation/i)
  assert.ok(!/retain/i.test(projection.quote.job_type), "must not be classified as retaining")
  assert.equal(projection.quote.client_name, "Client A")
  assert.match(projection.quote.site_address, /10 Willow Lane, Mount Wellington/)

  // Labour recovered deterministically to 17h / $1,870 (7 + 2 + 8, at $110/hr).
  assert.equal(projection.labourLine?.quantity, "17", "labour recovered to 17 hours")
  assert.equal(projection.labourLine?.unit, "hours")
  assert.equal(Number(projection.labourLine?.total), 1870, "17 × $110 = $1,870")

  const jms = projection.jmsLines.join("\n")
  assert.ok(jms.includes("Qty 17 hours"), "JMS labour line shows Qty 17 hours")
  assert.ok(jms.includes("Total 1870"), "JMS labour line shows Total 1870")

  // No false pricing facts: the "7 hours / 2 hours / 8 hours" allowances must
  // never surface as $7 / $2 / $8 anywhere in the customer preview.
  assert.ok(!/\$7\b/.test(projection.customerText), "no $7 pricing fact")
  assert.ok(!/\$2\b/.test(projection.customerText), "no $2 pricing fact")
  assert.ok(!/\$8\b/.test(projection.customerText), "no $8 pricing fact")

  // Optional works remain optional — garden mix/mulch are NOT required materials.
  assert.ok(
    !projection.quote.materials.some((m) => /garden mix|mulch/i.test(m)),
    "garden mix/mulch must not be in required materials",
  )
  assert.ok(
    projection.quote.optional_quotes.some((o) => o.scope.some((s) => /garden mix|mulch/i.test(s))),
    "garden mix/mulch must remain in optional works only",
  )

  // Customer preview must not leak internal metadata or be taken over by the
  // wrong template (Retaining / Planting / One-Off Garden Tidy).
  for (const leak of ["Title:", "Job type:", "Cadence:"]) {
    assert.ok(!projection.customerText.includes(leak), `customer preview must not show "${leak}"`)
  }
  assert.ok(!/retaining wall/i.test(projection.customerText), "customer preview not taken over by Retaining")
  assert.ok(!/Planting Quote|Supply and plant/i.test(projection.customerText), "customer preview not taken over by Planting")
  assert.ok(!/One-Off Garden Tidy/i.test(projection.customerText), "customer preview not taken over by One-Off Garden Tidy")
  assert.ok(projection.customerText.includes("timber"), "customer preview keeps the timber scope")
  // Slice 3b regression: no optional_priced_works → no empty optional works section.
  assert.ok(!/not included in the main quote/i.test(projection.customerText), "no spurious optional works section")
})

test("Golden Quote 3 — Client B/Titirangi: routed as landscaping, no decking output (QA-3 fix)", () => {
  assertReportPasses(clientBTitirangi)
})

test("Golden Quote 3 — Client B/Titirangi: decking + suburb audit issues resolved (hedge warning may remain)", () => {
  // QA-3: the decking misclassification, decking-scope leak, missing topsoil/lawn
  // scope, and dropped suburb are fixed. The optional-hedge warning is allowed to
  // remain (future work — plant count/spacing not yet calculated).
  const { projection } = runGoldenQuote(clientBTitirangi)
  const ids = projection.audit.issues.map((i) => i.id)

  for (const resolved of [
    "V04-decking-on-non-decking",
    "V06-decking-scope-leak",
    "V06-missing-topsoil-lawn-scope",
    "V06-missing-lawn-seed",
    "V08-suburb-missing",
  ]) {
    assert.ok(!ids.includes(resolved), `${resolved} must no longer fire; got [${ids.join(", ")}]`)
  }
})

test("Golden Quote 3 — Client B/Titirangi (PIPELINE-BACKED): the real pipeline holds the full mixed-landscaping contract", async () => {
  // QA-7/QA-8/QA-9: drives the Client B/Titirangi transcript through the REAL extracted
  // pipeline (processTranscriptToQuote) with mocked OpenAI deps — no live OpenAI, no
  // browser.
  //
  // This started as a PARTIAL test. QA-8 fixed the retaining-classification and
  // dropped-Titirangi divergences; QA-9 fixed the last one — the planting calculator
  // no longer fabricates a planting area from the retaining wall's "16.8m", so the
  // customer preview uses the mixed-landscaping assembly renderer instead of being
  // taken over by the planting presentation. The pipeline path now satisfies the
  // FULL declarative contract, so this asserts zero failing checks plus explicit
  // QA-8/QA-9 guarantees.
  const { projection, report } = await runGoldenQuoteThroughPipeline(clientBTitirangi)
  const failing = report.checks.filter((c) => !c.passed)
  assert.equal(
    failing.length,
    0,
    `Client B/Titirangi pipeline-backed run has failing contract checks:\n${formatContractReport(report)}`,
  )

  const jms = projection.jmsLines.join("\n")
  const auditIds = projection.audit.issues.map((i) => i.id)

  // Runs headlessly and attaches a deterministic audit result.
  assert.ok(projection.quote.audit_result, "audit_result must exist")
  assert.equal(projection.quote.client_name, "Client B")

  // QA-8 fix #1 — retaining is only a sub-component; the job stays general landscaping.
  assert.match(projection.quote.job_type, /general_landscaping|landscaping/i)
  assert.ok(!/retain/i.test(projection.quote.job_type), "must not be classified as retaining")

  // QA-8 fix #3 — the "in Titirangi" suburb is preserved and V08 no longer fires.
  assert.match(projection.quote.site_address, /20 Poplar Street, Titirangi/)
  assert.ok(!auditIds.includes("V08-suburb-missing"), `V08-suburb-missing must not fire; got [${auditIds.join(", ")}]`)

  // QA-9 fix — no fabricated planting area from the retaining wall, so the customer
  // preview uses the mixed-landscaping assembly renderer and surfaces the real scope.
  assert.notEqual(projection.rendererPath, "planting-presentation", "must not be taken over by the planting renderer")
  assert.equal(projection.rendererPath, "assembly", "mixed landscaping uses the customer assembly renderer")
  assert.deepEqual(projection.quote.plant_calculator_results ?? [], [], "no fabricated plant calculator results")
  // Milestone 2 — the QuotePlan primary intent is landscaping (not planting), and the
  // customer quote title must not collapse to a planting title.
  assert.equal(projection.quote.render_intent?.mainIsPlanting, false, "Client B primary work is not planting")
  assert.ok(
    !/planting quote/i.test(projection.customerText),
    `customer quote title must not collapse to a planting quote:\n${projection.customerText.slice(0, 200)}`,
  )
  // Slice 4 — the retaining/topsoil measurements ("16.8m for the retaining wall",
  // "6m by 16.8m") must never be fabricated into a planting option/line/name.
  assert.ok(
    !(projection.quote.quote_options ?? []).some((o) => /retaining\s*wall/i.test(`${o.title ?? ""} ${o.label ?? ""}`)),
    `no quote option may be named after the retaining wall, got ${JSON.stringify(projection.quote.quote_options)}`,
  )
  assert.ok(
    !projection.quote.line_items.some((i) => i.item_type === "plant" && /retaining\s*wall/i.test(i.item_name)),
    "no plant line item may be named after the retaining wall",
  )
  for (const forbidden of ["the retaining wall 6", "the retaining wall 16", "retaining wall 6M", "retaining wall 16.8M"]) {
    assert.ok(!new RegExp(forbidden, "i").test(projection.customerText), `customer preview must not contain fabricated plant option "${forbidden}"`)
  }
  for (const needle of ["retaining wall", "polythene", "topsoil", "lawn seed"]) {
    assert.match(projection.customerText, new RegExp(needle, "i"), `customer preview must include "${needle}"`)
  }

  // Decking gate stays closed (QA-3 fix) — no decking line items or artefacts.
  assert.ok(
    !projection.quote.line_items.some((i) => /deck/i.test(`${i.item_name} ${i.description}`)),
    "no decking line items",
  )
  assert.ok(!/Deck area|Decking boards/i.test(jms), "no decking artefacts in JMS lines")
  assert.ok(!/Deck area|Decking boards/i.test(projection.customerText), "no decking artefacts in customer preview")

  // Optional Ficus hedge stays optional scope text (not fabricated into a plant count).
  assert.ok(
    projection.quote.optional_quotes.some((o) => /ficus/i.test(`${o.quote_title} ${o.scope.join(" ")}`)),
    "optional Ficus hedge remains optional",
  )

  // QuotePlan Slice 2 — the optional hedge's "2 people × 1 day" must NOT become a main
  // labour line, and must be surfaced internally for review/pricing.
  assert.ok(
    !projection.quote.line_items.some(
      (i) => (/\blabou?r\b/i.test(i.item_type) || /\blabou?r\b/i.test(i.item_name)) && i.quantity === "16",
    ),
    `optional hedge labour must not create a 16h main labour line, got ${JSON.stringify(projection.quote.line_items.map((i) => ({ n: i.item_name, q: i.quantity })))}`,
  )
  assert.ok(
    projection.quote.internal_notes.some((n) => /optional works labour/i.test(n) && /ficus/i.test(n)),
    `optional Ficus hedge labour must be surfaced in internal_notes, got ${JSON.stringify(projection.quote.internal_notes)}`,
  )
  // And it must not leak into the customer-facing preview.
  assert.ok(!/optional works labour/i.test(projection.customerText), "optional-labour note must stay internal")

  // QuotePlan Slice 3a — the optional Ficus hedge labour is a priceable optional work
  // on optional_priced_works (16h × $110 = $1,760), never on quote_options.
  const ficusPriced = (projection.quote.optional_priced_works ?? []).find((o) =>
    /ficus/i.test(`${o.label} ${o.title}`),
  )
  assert.ok(ficusPriced, `optional Ficus hedge labour must be a priceable optional work, got ${JSON.stringify(projection.quote.optional_priced_works)}`)
  assert.equal(ficusPriced!.category, "labour")
  assert.equal(ficusPriced!.lineItems[0]?.quantity, 16)
  assert.equal(ficusPriced!.subtotal, 1760)
  assert.ok(
    !(projection.quote.quote_options ?? []).some((o) => o.category === "labour"),
    "optional labour must not leak into quote_options",
  )

  // QuotePlan Slice 3b — the priced optional work is shown customer-facing, clearly
  // separated from the main quote, with the price only (no labour hours).
  assert.match(projection.customerText, /Optional works/)
  assert.match(projection.customerText, /not included in the main quote/i)
  assert.match(projection.customerText, /Optional Ficus Tuffi hedge/)
  assert.match(projection.customerText, /Optional price: \$1,760/)
  // …but internal-only detail must never leak into customer copy.
  for (const forbidden of ["Optional labour", "ai_extraction", "optional_priced_works", "Rate missing", "16 hours", "optional works labour"]) {
    assert.ok(!new RegExp(forbidden, "i").test(projection.customerText), `customer copy must not expose "${forbidden}"`)
  }

  // De-duplication (browser-reported bug): the priced optional work must NOT also
  // appear as an old-style optional scope line, and there must be exactly one
  // optional works section. The raw labour phrase must never be customer-facing.
  assert.ok(
    !/Plant a Ficus Tuffi hedge along the fence/i.test(projection.customerText),
    "old optional hedge scope line must be de-duplicated (priced section only)",
  )
  assert.ok(
    !/two people (?:for )?one day/i.test(projection.customerText),
    "raw optional labour phrase must never be customer-facing",
  )
  assert.equal(
    (projection.customerText.match(/optional works/gi) ?? []).length,
    1,
    `exactly one optional works section expected, got ${(projection.customerText.match(/optional works/gi) ?? []).length}`,
  )
  // The Quote Overseer must not flag the new customer-facing optional works section.
  const overseer = reviewQuote({ quote: projection.quote, customerPreviewText: projection.customerText })
  const previewFindings = overseer.findings.filter((f) =>
    ["customer_preview_leaks_labour", "customer_preview_missing_scope", "customer_copy_not_ready"].includes(f.check),
  )
  assert.deepEqual(previewFindings, [], `Overseer must not flag the optional works section: ${JSON.stringify(previewFindings)}`)

  // The pipeline preserves the supplied topsoil + lawn-seed material lines and
  // formats them for JMS (spoken $129 kept; 5kg never misread as a $5 rate).
  assert.ok(jms.includes("Topsoil") && jms.includes("Qty 5.04 m3"), "topsoil volume line preserved")
  assert.ok(
    jms.includes("Lawn seed (5kg bag)") && jms.includes("Qty 1 bag") && jms.includes("Total 129"),
    "lawn seed line preserved with spoken $129",
  )
  assert.ok(
    !projection.quote.line_items.some((i) => /lawn seed/i.test(i.item_name) && i.rate === "5"),
    "5kg must not be misread as a $5 rate",
  )
})

test("Quote Overseer produces no customer-preview findings on the good golden quotes", () => {
  // MVP smoke test: the deterministic Overseer must not raise O2/O5/O7 findings on
  // the three known-good golden projections. xeroExportLines are intentionally NOT
  // supplied, so O4's known KB/item-mapping gaps never fail this customer-preview
  // sanity check (O4 has its own positive test in lib/quote-overseer/index.test.ts).
  for (const fixture of FIXTURES) {
    const { projection } = runGoldenQuote(fixture)
    const result = reviewQuote({
      quote: projection.quote,
      customerPreviewText: projection.customerText,
      rendererPath: projection.rendererPath,
      matchedJmsLines: projection.jmsLines,
      rawTranscript: fixture.transcript,
    })
    const customerPreviewFindings = result.findings.filter((f) =>
      ["customer_preview_leaks_labour", "customer_preview_missing_scope", "customer_copy_not_ready"].includes(f.check),
    )
    assert.equal(
      customerPreviewFindings.length,
      0,
      `${fixture.name}: Overseer raised unexpected customer-preview findings:\n${JSON.stringify(customerPreviewFindings, null, 2)}`,
    )
  }
})

test("Slice 3b: rendered customer draft shows exactly one optional works section (both AI paths de-duped)", () => {
  // Reproduces the browser bug: the optional hedge is present in optional_quotes AND as
  // an "Optional:"-prefixed note, with a matching priced optional_priced_works entry.
  // The full customer render (assembly sections + appended priced section) must show a
  // single optional works section and never leak the old scope line or internal detail.
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Client B",
    site_address: "20 Poplar Street, Titirangi",
    quote_title: "Back Lawn Levelling Quote",
    job_type: "general_landscaping",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Back Lawn Levelling Quote",
      job_type: "general_landscaping",
      scope: [
        "Construct a small timber retaining wall approximately 400mm high.",
        "Install polythene along the fence to protect the fence.",
        "Import and spread topsoil across the lawn area.",
      ],
      notes: ["Optional works: Plant Ficus Tuffi hedge along the fence with roughly one metre sized plants."],
    },
    optional_quotes: [
      {
        quote_title: "Optional Ficus Tuffi Hedge Planting",
        job_type: "planting",
        cadence: "",
        scope: ["Plant Ficus Tuffi hedge along the fence with roughly one metre sized plants."],
        notes: [],
      },
    ],
    customer_scope: [
      "Construct a small timber retaining wall approximately 400mm high.",
      "Install polythene along the fence to protect the fence.",
      "Import and spread topsoil across the lawn area.",
    ],
    materials: ["Polythene", "Topsoil"],
    optional_priced_works: [
      {
        id: "optional-optional-1-labour-1",
        label: "Optional Ficus Tuffi Hedge Planting",
        title: "Optional labour — Optional Ficus Tuffi Hedge Planting",
        category: "labour",
        source: "ai_extraction",
        lineItems: [{ itemName: "Labour", quantity: 16, unit: "hours", unitPrice: 110, total: 1760 }],
        subtotal: 1760,
        warnings: [],
      },
    ],
  }

  const { customerText } = buildProjectionFromQuote(quote, "")

  assert.equal(
    (customerText.match(/optional works/gi) ?? []).length,
    1,
    `exactly one optional works section expected, got ${(customerText.match(/optional works/gi) ?? []).length}\n${customerText}`,
  )
  assert.match(customerText, /Optional Ficus Tuffi Hedge Planting/)
  assert.match(customerText, /Optional price: \$1,760/)
  assert.match(customerText, /not included in the main quote/i)
  // Main scope preserved.
  assert.match(customerText, /topsoil/i)
  assert.match(customerText, /retaining wall/i)
  // No old scope duplicate, no labour phrase, no internal leaks.
  for (const forbidden of [
    "Plant Ficus Tuffi hedge along the fence",
    "two people one day",
    "16 hours",
    "Optional labour",
    "optional_priced_works",
    "ai_extraction",
    "Rate missing",
  ]) {
    assert.ok(!new RegExp(forbidden, "i").test(customerText), `customer copy must not contain "${forbidden}"`)
  }
})

test("Milestone 2: a mixed landscaping quote with an OPTIONAL (calculated) hedge does not collapse into the planting presentation", async () => {
  // Mixed landscaping MAIN work (lawn + topsoil) with an OPTIONAL Griselinia hedge that
  // HAS a length + spacing, so Milestone 1's calculator produces plant_calculator_results
  // for the optional bucket. The output normalisers then flip job_type to a planting
  // label — but render_intent must keep the quote landscaping-first.
  const transcript =
    "Landscaping for Ann. Lay a new lawn and spread topsoil, plus lawn seed. " +
    "Optional: plant a 12m Griselinia hedge along the boundary at 500mm spacing."
  const deps: ProcessTranscriptDeps = {
    classify: async () => ({ specialist: "landscaping", reason: "test-injected classification" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractQuote: async () =>
      ({
        quote: {
          ...EMPTY_PROCESSED_QUOTE,
          client_name: "Ann",
          site_address: "3 Test Rise",
          quote_title: "Lawn & Topsoil",
          job_type: "general_landscaping",
          primary_quote: {
            quote_title: "Lawn & Topsoil",
            job_type: "general_landscaping",
            cadence: "",
            scope: ["Lay a new lawn", "Spread topsoil", "Sow lawn seed"],
            notes: [],
          },
          optional_quotes: [
            {
              quote_title: "Optional Griselinia hedge",
              job_type: "planting",
              cadence: "",
              scope: ["Plant a 12m Griselinia hedge along the boundary at 500mm spacing."],
              notes: [],
            },
          ],
          customer_scope: ["Lay a new lawn", "Spread topsoil", "Sow lawn seed"],
          materials: ["Topsoil", "Lawn seed"],
        },
        elapsedMs: 0,
        promptLength: 0,
        responseLength: 0,
        reliabilityMetric: "first_pass_success",
      }) as any,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  }

  const knowledgeItemContext = [
    {
      item_code: "GRIS-2L",
      item_name: "Griselinia 2L",
      item_type: "plant",
      plant_name: "Griselinia",
      plant_size: "2L",
      pot_size: "2L",
      spacing_mm: 500,
      sell_price: 12,
      unit: "each",
      aliases: ["griselinia"],
    },
  ]

  const { quote } = await processTranscriptToQuote({ transcript, knowledgeItemContext }, deps)
  const projection = buildProjectionFromQuote(quote, transcript)

  // render_intent stays landscaping even though job_type was mutated to a planting label.
  assert.equal(quote.render_intent?.primaryTrade, "landscaping")
  assert.equal(quote.render_intent?.mainIsPlanting, false, `job_type is now "${quote.job_type}" but the primary work is landscaping`)

  // The customer quote renders through the mixed-landscaping assembly, not planting.
  assert.equal(projection.rendererPath, "assembly", "mixed job must use the assembly renderer")
  assert.ok(!/planting quote/i.test(projection.customerText), "title must not collapse to Planting Quote")
  assert.match(projection.customerText, /topsoil/i, "main landscaping scope (topsoil) must survive")
  assert.match(projection.customerText, /lawn/i, "main landscaping scope (lawn) must survive")
  // No fabricated retaining-wall/structural plant option (Milestone 1 guarantee holds).
  assert.ok(!/retaining wall\s+\d/i.test(projection.customerText), "no fabricated sized plant option")
})

test("every fixture documents its mocked boundary", () => {
  for (const fixture of FIXTURES) {
    assert.ok(
      fixture.mockingNotes.trim().length > 20,
      `${fixture.name} must document what is mocked/stubbed in mockingNotes`,
    )
  }
})

// Always print the full per-layer report so CI logs capture current truth for
// every golden quote, pass or fail.
test("print golden quote reports", () => {
  for (const fixture of FIXTURES) {
    const { report } = runGoldenQuote(fixture)
    console.log(formatContractReport(report))
  }
})
