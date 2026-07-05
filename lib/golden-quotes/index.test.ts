import assert from "node:assert/strict"
import test from "node:test"

import type { GoldenQuoteFixture } from "./contracts"
import { adamTitirangi } from "./fixtures/adam-titirangi"
import { gardenBedRenovation } from "./fixtures/garden-bed-renovation"
import { micheliaPlanting } from "./fixtures/michelia-planting"
import { formatContractReport, runGoldenQuote } from "./runner"

/**
 * Golden Quote Runner — headless regression harness.
 *
 * WHAT IS REAL: for each golden quote we run the app's own customer-preview
 * render, Quote Auditor, JMS formatter and internal-section builder against a
 * ProcessedQuote, and assert declarative contracts across every output layer.
 *
 * WHAT IS MOCKED: the OpenAI extraction and the ~35 post-processors trapped in
 * app/api/process-quote/route.ts cannot run headlessly, so each fixture's
 * buildProcessedQuote() stubs the AI-extracted fields and rebuilds the
 * deterministic parts (plant maths, labour maths) with real exported helpers.
 * Each fixture's `mockingNotes` states exactly what is stubbed.
 *
 * See docs/GOLDEN_QUOTE_RUNNER.md for the route-extraction plan that will let
 * these fixtures call the real pipeline end-to-end.
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
