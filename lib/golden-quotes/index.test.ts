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

test("Golden Quote 3 — Adam/Titirangi: current BROKEN state is captured (locked)", () => {
  // This fixture encodes the current bugs. It passing means the pipeline is
  // still broken exactly as documented. When someone fixes the decking
  // misclassification / topsoil / suburb, these checks flip and force the
  // fixture to be rewritten to the desired contract.
  assertReportPasses(adamTitirangi)
})

test("Golden Quote 3 — Adam/Titirangi: auditor does NOT yet detect the classification/address bugs", () => {
  // Documents the validator gap: V04 (classification) and V08 (address) are not
  // implemented, so the auditor cannot flag the decking misclassification or the
  // dropped suburb. This is the explicit backlog for a future batch.
  const { projection } = runGoldenQuote(adamTitirangi)
  const ids = projection.audit.issues.map((i) => i.id)
  assert.ok(
    !ids.some((id) => /V04|classification|V08|address|suburb/i.test(id)),
    `Expected NO classification/address validator yet, but auditor produced: [${ids.join(", ")}]`,
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
