import assert from "node:assert/strict"
import test from "node:test"

// Import the real Next.js route handlers and invoke them directly. The "@/" alias in the
// compiled output is resolved by scripts/route-alias.cjs (see test:route-auth). No live
// OpenAI / Supabase / webhook is reached: every route runs the shared auth gate FIRST, so
// a token-less request short-circuits to 401 before any external call.
import { POST as processQuote } from "../app/api/process-quote/route"
import { POST as transcribe } from "../app/api/transcribe/route"
import { POST as correctTranscript } from "../app/api/correct-transcript/route"
import { POST as exportXeroQuote } from "../app/api/export-xero-quote/route"

function noTokenRequest(): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcript: "x", processed_quote: { client_name: "x" } }),
  })
}

const routes = [
  ["process-quote", processQuote],
  ["transcribe", transcribe],
  ["correct-transcript", correctTranscript],
  ["export-xero-quote", exportXeroQuote],
] as const

for (const [name, handler] of routes) {
  test(`${name} returns 401 without a bearer token`, async () => {
    const response = await handler(noTokenRequest())
    assert.equal(response.status, 401, `${name} must reject unauthenticated requests with 401`)
    const body = await response.json()
    assert.equal(body.error, "Authentication token is required.")
  })
}
