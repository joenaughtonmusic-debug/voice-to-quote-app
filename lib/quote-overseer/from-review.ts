import { buildCustomerPreviewQuoteInput, type CustomerPreviewFlowInput } from "../customer-preview-flow"
import { buildCustomerDraftPreviewModel, renderCustomerDraftPreviewText } from "../customer-preview-render"
import { buildCustomerQuotePreview, type CustomerQuotePreview } from "../customer-quote-preview"
import type { QuoteOverseerInput } from "./types"

/**
 * Assembles a QuoteOverseerInput from the data the internal review screen already
 * has. It renders the customer-preview *text* with the same pure functions the
 * customer draft uses (buildCustomerDraftPreviewModel → renderCustomerDraftPreviewText),
 * so the Overseer reviews exactly the copy the customer would see. It never mutates
 * the quote and calls no OpenAI.
 *
 * xeroExportLines are intentionally omitted here (O4 stays dormant in the UI).
 */
export type OverseerReviewContext = Pick<
  CustomerPreviewFlowInput,
  "processedQuote" | "rawTranscript" | "originalTranscript" | "selectedTemplate" | "pricingFacts"
> & {
  /** Reuse an already-built customer preview to avoid recomputing it. */
  customerPreview?: CustomerQuotePreview
}

export function buildOverseerInputFromReview(ctx: OverseerReviewContext): QuoteOverseerInput {
  const previewInput = buildCustomerPreviewQuoteInput({
    processedQuote: ctx.processedQuote,
    rawTranscript: ctx.rawTranscript,
    originalTranscript: ctx.originalTranscript,
    selectedTemplate: ctx.selectedTemplate,
    pricingFacts: ctx.pricingFacts,
  })

  const customerPreview =
    ctx.customerPreview ??
    buildCustomerQuotePreview(previewInput, { includeDeckingScope: true, includeRetainingScope: true })

  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote: ctx.processedQuote,
    customerPreview,
    rawTranscript: ctx.rawTranscript,
    selectedTemplate: previewInput.selected_template,
  })

  return {
    quote: ctx.processedQuote,
    customerPreviewText: renderCustomerDraftPreviewText(previewModel),
    rendererPath: previewModel.rendererPath,
    rawTranscript: ctx.rawTranscript ?? undefined,
  }
}
