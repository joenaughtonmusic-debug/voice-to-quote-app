import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for the deterministic customer-draft browser regression.
 *
 * The suite drives the gated dev-only fixture route (`/dev/customer-draft-fixture`),
 * which renders the real `QuoteDraft` UI from an injected Adam/Titirangi ProcessedQuote
 * — no live OpenAI, no API key, no network. The webServer runs `next dev` (NODE_ENV
 * !== "production", so the fixture route is enabled) with ENABLE_FIXTURE_ROUTES=1 set
 * defensively.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/dev/customer-draft-fixture",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ENABLE_FIXTURE_ROUTES: "1" },
  },
})
