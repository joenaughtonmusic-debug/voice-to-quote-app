import type { ProcessedQuote } from "../processed-quote"
import { processTranscriptToQuote } from "../pipeline/process-transcript"
import { clientBTitirangi } from "../golden-quotes/fixtures/client-b-titirangi"

/**
 * Deterministic Client B/Titirangi ProcessedQuote for the gated dev-only customer-draft
 * fixture page (browser/e2e regression). It drives the REAL pipeline
 * (`processTranscriptToQuote`) with the golden fixture's already-extracted quote and
 * classification injected as deps — so there is **no live OpenAI call, no API key, and
 * no network**. This is the same mocked-boundary path the golden pipeline-backed test
 * uses (`runGoldenQuoteThroughPipeline`); we return the raw `ProcessedQuote` so the page
 * can render it through the actual `QuoteDraft` React UI.
 */
export async function buildClientBCustomerDraftQuote(): Promise<{
  quote: ProcessedQuote
  transcript: string
}> {
  if (!clientBTitirangi.pipeline) {
    throw new Error("clientBTitirangi fixture is missing pipeline inputs.")
  }
  const { extractedQuote, knowledgeItems, classification } = clientBTitirangi.pipeline

  const result = await processTranscriptToQuote(
    { transcript: clientBTitirangi.transcript, knowledgeItemContext: knowledgeItems },
    {
      classify: async () => classification as never,
      extractQuote: async () =>
        ({
          quote: extractedQuote,
          elapsedMs: 0,
          promptLength: 0,
          responseLength: 0,
          reliabilityMetric: "first_pass_success",
        }) as never,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    },
  )

  return { quote: result.quote, transcript: clientBTitirangi.transcript }
}
