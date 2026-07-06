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
