import { buildCustomerPreviewQuoteInput } from "../customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "../customer-preview-render"
import { buildCustomerQuotePreview } from "../customer-quote-preview"
import { formatMatchedJmsLineItems, processedQuoteToEditableSections } from "../processed-quote"
import { auditProcessedQuote } from "../quote-auditor"
import { evaluateContract, type ContractReport, type GoldenProjection, type GoldenQuoteFixture } from "./contracts"

/**
 * Builds every real output-layer projection for a golden quote fixture using the
 * app's own functions. This is the single place the harness touches production
 * code — it must never reimplement customer-preview, audit, or JMS logic.
 */
export function buildProjection(fixture: GoldenQuoteFixture): GoldenProjection {
  const quote = fixture.buildProcessedQuote()

  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: quote,
    rawTranscript: fixture.transcript,
  })
  const customerPreview = buildCustomerQuotePreview(previewInput, {
    includeDeckingScope: true,
    includeRetainingScope: true,
  })
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: quote,
    customerPreview,
    rawTranscript: fixture.transcript,
    selectedTemplate: previewInput.selected_template,
  })
  const customerText = renderCustomerDraftPreviewText(previewModel)

  const audit = auditProcessedQuote({ rawTranscript: fixture.transcript, processedQuote: quote })

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

export function runGoldenQuote(fixture: GoldenQuoteFixture): { projection: GoldenProjection; report: ContractReport } {
  const projection = buildProjection(fixture)
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
