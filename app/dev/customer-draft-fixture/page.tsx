import { notFound } from "next/navigation"
import { buildAdamCustomerDraftQuote } from "@/lib/dev-fixtures/adam-customer-draft-quote"
import { CustomerDraftFixtureClient } from "./fixture-client"

// Gated dev/test-only fixture route. It renders the real customer-draft UI with a
// deterministic Adam/Titirangi quote (no OpenAI) so the browser/e2e path can be
// regression-tested. It is DISABLED in production by default: it only serves when not
// in production, or when ENABLE_FIXTURE_ROUTES=1 is explicitly set. It never touches
// live OpenAI, Xero/JMS export, or normal production behaviour.
export const dynamic = "force-dynamic"

function fixtureRoutesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_FIXTURE_ROUTES === "1"
}

export default async function CustomerDraftFixturePage() {
  if (!fixtureRoutesEnabled()) {
    notFound()
  }

  const { quote, transcript } = await buildAdamCustomerDraftQuote()

  return <CustomerDraftFixtureClient quote={quote} rawTranscript={transcript} />
}
