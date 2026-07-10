import { test, expect } from "@playwright/test"

/**
 * Deterministic browser regression for the Adam/Titirangi customer draft.
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
test("Adam/Titirangi customer draft renders deterministically with de-duplicated optional works", async ({
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
    "Adam",
    "20 Lemnos Street, Titirangi",
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

  // ── Must NOT include (internal detail / labour leak / fabricated options) ─
  const forbidden = [
    "Labour Included only",
    "two people one day",
    "16 hours",
    "Optional labour",
    "optional_priced_works",
    "ai_extraction",
    "Rate missing",
    "the retaining wall 6M",
    "the retaining wall 16.8M",
  ]
  for (const needle of forbidden) {
    expect(text.toLowerCase(), `customer draft must not include "${needle}"`).not.toContain(needle.toLowerCase())
  }
})
