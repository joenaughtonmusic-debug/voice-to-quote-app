import { test, expect } from "@playwright/test"

/**
 * Deterministic browser regression for the Client B/Titirangi customer draft.
 *
 * Renders the REAL customer-draft UI (`QuoteDraft` → `StandardCustomerPreview` + the
 * priced optional-works block) from a fixed, injected ProcessedQuote — no live OpenAI.
 * This is the browser-level guard for the Slice 3b optional-works de-duplication: the
 * priced optional work must appear once, and internal/labour detail must never leak
 * into the customer-visible draft.
 *
 * Assertions run against the customer-VISIBLE text (`innerText`), which excludes the
 * collapsed "Dev diagnostics" details — matching what a customer actually sees.
 */
test("Client B/Titirangi customer draft renders deterministically with de-duplicated optional works", async ({
  page,
}) => {
  await page.goto("/dev/customer-draft-fixture")

  // QuoteDraft renders a position:fixed overlay, so the wrapper div itself collapses to
  // zero size (Playwright treats it as "hidden"). Gate readiness on the rendered text
  // instead — the optional-works block is the last customer-facing section to render.
  const draft = page.getByTestId("customer-draft-fixture")
  await expect(draft).toContainText("Optional price: $1,760")

  const text = await draft.innerText()

  // ── Must include ──────────────────────────────────────────────────────────
  const required = [
    "Client B",
    "20 Poplar Street, Titirangi",
    "retaining wall",
    "polythene",
    "topsoil",
    "lawn seed",
    "Optional price: $1,760",
  ]
  for (const needle of required) {
    expect(text.toLowerCase(), `customer draft should include "${needle}"`).toContain(needle.toLowerCase())
  }

  // ── Exactly one "Optional works" section ─────────────────────────────────
  const optionalWorksCount = (text.match(/optional works/gi) ?? []).length
  expect(optionalWorksCount, "exactly one Optional works section").toBe(1)

  // ── Milestone 2: mixed landscaping must not collapse to a planting quote ──
  expect(text.toLowerCase(), "Client B is a mixed landscaping quote, not a Planting Quote").not.toContain("planting quote")

  // ── Must NOT include (internal detail / labour leak / fabricated options) ─
  const forbidden = [
    "Labour Included only",
    "two people one day",
    "16 hours",
    "Optional labour",
    "optional_priced_works",
    "ai_extraction",
    "Rate missing",
    // Slice 4 — fabricated planting options built from the retaining/topsoil measurements.
    "the retaining wall 6M",
    "the retaining wall 16.8M",
    "retaining wall 6m",
    "retaining wall 16.8m",
  ]
  for (const needle of forbidden) {
    expect(text.toLowerCase(), `customer draft must not include "${needle}"`).not.toContain(needle.toLowerCase())
  }

  // Slice 4 — the retaining wall must only ever appear as real scope, never as a
  // planting option (i.e. "retaining wall" is never immediately followed by a size like
  // "6M" / "16.8M" / a plant option price).
  expect(text, "the retaining wall must not appear as a plant option with a size").not.toMatch(
    /retaining wall\s+\d+(?:\.\d+)?\s*m\b/i,
  )
})
