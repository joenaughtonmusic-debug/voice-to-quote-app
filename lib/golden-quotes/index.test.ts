import assert from "node:assert/strict"
import test from "node:test"

import type { GoldenQuoteFixture } from "./contracts"
import { adamTitirangi } from "./fixtures/adam-titirangi"
import { gardenBedRenovation } from "./fixtures/garden-bed-renovation"
import { micheliaPlanting } from "./fixtures/michelia-planting"
import { formatContractReport, runGoldenQuote, runGoldenQuoteThroughPipeline } from "./runner"

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

const FIXTURES: GoldenQuoteFixture[] = [micheliaPlanting, gardenBedRenovation, adamTitirangi]

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
  assert.equal(projection.quote.client_name, "Stephanie")
  assert.match(projection.quote.site_address, /10 Cotswold Lane, Mount Wellington/)
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
  assert.equal(projection.quote.client_name, "Stephanie")
  assert.match(projection.quote.site_address, /10 Cotswold Lane, Mount Wellington/)

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
})

test("Golden Quote 3 — Adam/Titirangi: routed as landscaping, no decking output (QA-3 fix)", () => {
  assertReportPasses(adamTitirangi)
})

test("Golden Quote 3 — Adam/Titirangi: decking + suburb audit issues resolved (hedge warning may remain)", () => {
  // QA-3: the decking misclassification, decking-scope leak, missing topsoil/lawn
  // scope, and dropped suburb are fixed. The optional-hedge warning is allowed to
  // remain (future work — plant count/spacing not yet calculated).
  const { projection } = runGoldenQuote(adamTitirangi)
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

test("Golden Quote 3 — Adam/Titirangi (PIPELINE-BACKED, PARTIAL): the real pipeline preserves the parts it gets right", async () => {
  // QA-7/QA-8: drives the Adam/Titirangi transcript through the REAL extracted
  // pipeline (processTranscriptToQuote) with mocked OpenAI deps — no live OpenAI, no
  // browser.
  //
  // This is a PARTIAL pipeline-backed test on purpose. QA-8 fixed two of the three
  // original divergences: the pipeline now keeps job_type `general_landscaping`
  // (retaining is only a sub-component) and preserves the `Titirangi` suburb. ONE
  // documented divergence remains (see the fixture's knownFailures): the customer
  // preview is still taken over by the planting renderer and drops the polythene /
  // lawn-seed scope, because the planting calculator fabricates an area from the
  // optional Ficus hedge. Fixing that is QA-9 (optional hedge handling), so this test
  // still does not claim full customer-preview parity. The fixture-path tests above
  // continue to assert the full desired contract against the hand-built ProcessedQuote.
  const { projection } = await runGoldenQuoteThroughPipeline(adamTitirangi)
  const jms = projection.jmsLines.join("\n")
  const auditIds = projection.audit.issues.map((i) => i.id)

  // Runs headlessly and attaches a deterministic audit result.
  assert.ok(projection.quote.audit_result, "audit_result must exist")

  // Client name is recovered by the real lead extractor.
  assert.equal(projection.quote.client_name, "Adam")

  // QA-8 fix #1 — retaining is only a sub-component; the job stays general landscaping
  // (not taken over as a Retaining Wall Quote).
  assert.match(projection.quote.job_type, /general_landscaping|landscaping/i)
  assert.ok(!/retain/i.test(projection.quote.job_type), "must not be classified as retaining")

  // QA-8 fix #3 — the "in Titirangi" suburb is preserved and V08 no longer fires.
  assert.match(projection.quote.site_address, /20 Lemnos Street, Titirangi/)
  assert.ok(!auditIds.includes("V08-suburb-missing"), `V08-suburb-missing must not fire; got [${auditIds.join(", ")}]`)

  // Decking gate stays closed (QA-3 fix) — no decking line items or artefacts.
  assert.ok(
    !projection.quote.line_items.some((i) => /deck/i.test(`${i.item_name} ${i.description}`)),
    "no decking line items",
  )
  assert.ok(!/Deck area|Decking boards/i.test(jms), "no decking artefacts in JMS lines")
  assert.ok(!/Deck area|Decking boards/i.test(projection.customerText), "no decking artefacts in customer preview")

  // Optional Ficus hedge stays optional (not merged into the primary scope).
  assert.ok(
    projection.quote.optional_quotes.some((o) => /ficus/i.test(`${o.quote_title} ${o.scope.join(" ")}`)),
    "optional Ficus hedge remains optional",
  )

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
