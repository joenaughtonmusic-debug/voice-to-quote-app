import type { ProcessedQuote } from "../processed-quote"
import { buildCustomerPreviewQuoteInput } from "../customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "../customer-preview-render"
import { buildCustomerQuotePreview } from "../customer-quote-preview"
import { formatMatchedJmsLineItems, processedQuoteToEditableSections } from "../processed-quote"
import { processTranscriptToQuote } from "../pipeline/process-transcript"
import { auditProcessedQuote } from "../quote-auditor"
import { evaluateContract, type ContractReport, type GoldenProjection, type GoldenQuoteFixture } from "./contracts"

/**
 * Builds every real output-layer projection from a ProcessedQuote using the
 * app's own functions. This is the single place the harness touches production
 * projection code — it must never reimplement customer-preview, audit, or JMS
 * logic. Shared by both the fixture path and the pipeline path.
 */
export function buildProjectionFromQuote(quote: ProcessedQuote, transcript: string): GoldenProjection {
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: transcript,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput, {
    includeDeckingScope: true,
    includeRetainingScope: true,
  })
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: transcript,
    selectedTemplate: previewInput.selected_template,
  })
  const customerText = renderCustomerDraftPreviewText(previewModel)

  const audit = auditProcessedQuote({ rawTranscript: transcript, processedQuote: quote })

  const jmsLines = formatMatchedJmsLineItems(quote.line_items)
  const internalSections = processedQuoteToEditableSections(quote)
  const labourLine = quote.line_items.find(
    (item) => /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )

  return {
    quote,
    customerText,
    rendererPath: previewModel.rendererPath,
    audit,
    jmsLines,
    internalSections,
    labourLine,
  }
}

/** Fixture path: builds the projection from the hand-authored ProcessedQuote. */
export function buildProjection(fixture: GoldenQuoteFixture): GoldenProjection {
  return buildProjectionFromQuote(fixture.buildProcessedQuote(), fixture.transcript)
}

export function runGoldenQuote(fixture: GoldenQuoteFixture): { projection: GoldenProjection; report: ContractReport } {
  const projection = buildProjection(fixture)
  const report = evaluateContract(fixture, projection)
  return { projection, report }
}

/**
 * Pipeline path: drives the transcript through the REAL extracted pipeline
 * (processTranscriptToQuote) with mocked OpenAI deps — no live OpenAI, no
 * browser — then asserts the same fixture contract against the real result.
 */
export async function runGoldenQuoteThroughPipeline(
  fixture: GoldenQuoteFixture,
): Promise<{ projection: GoldenProjection; report: ContractReport }> {
  if (!fixture.pipeline) {
    throw new Error(`${fixture.name} has no pipeline inputs; cannot run the pipeline-backed path.`)
  }
  const { extractedQuote, knowledgeItems, classification } = fixture.pipeline

  const result = await processTranscriptToQuote(
    { transcript: fixture.transcript, knowledgeItemContext: knowledgeItems },
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

  const projection = buildProjectionFromQuote(result.quote, fixture.transcript)
  const report = evaluateContract(fixture, projection)
  return { projection, report }
}

/** Renders a report as a readable block for console output / CI logs. */
export function formatContractReport(report: ContractReport): string {
  const lines: string[] = []
  lines.push(`\n━━━ ${report.name} ━━━`)
  lines.push(`renderer: ${report.rendererPath} | audit: ${report.auditStatus}`)
  for (const check of report.checks) {
    lines.push(`  ${check.passed ? "PASS" : "FAIL"} [${check.layer}] ${check.name} — ${check.detail}`)
  }
  if (report.knownFailures.length > 0) {
    lines.push("  known current failures (captured, not fixed):")
    for (const failure of report.knownFailures) lines.push(`    • ${failure}`)
  }
  return lines.join("\n")
}
