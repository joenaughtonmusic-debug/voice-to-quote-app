import type { CustomerQuotePreview } from "../customer-quote-preview"
import type { ProcessedQuote } from "../processed-quote"
import { buildPlantingPresentationModel, isPlantingWorkflow } from "./planting"
import type { QuotePresentationLine, QuotePresentationModel } from "./types"

export type QuotePresentationInput = {
  quote: ProcessedQuote
  rawTranscript?: string | null
  customerPreview?: CustomerQuotePreview
}

export function buildQuotePresentationModel(input: QuotePresentationInput): QuotePresentationModel | null {
  if (isPlantingWorkflow(input.quote)) {
    return buildPlantingPresentationModel(input)
  }

  return null
}

export function customerViewLines(model: QuotePresentationModel): QuotePresentationLine[] {
  return model.lines.filter((line) => line.customerVisible !== false)
}

export function internalViewLines(model: QuotePresentationModel): QuotePresentationLine[] {
  return model.lines
}

export function exportViewLines(model: QuotePresentationModel): QuotePresentationLine[] {
  return model.lines.filter((line) => line.exportable)
}

export { buildPlantingPresentationModel, isPlantingWorkflow, materialLineIsPriced } from "./planting"
export {
  buildPresentationCustomerPreview,
  buildPresentationInternalReviewNotes,
  collectPresentationReviewNotes,
  dedupeOptionalWorkTitles,
  isUsablePlantingCustomerQuote,
  mergePlantingInternalReviewNotes,
  plantingMaterialOptionReviewNotes,
  renderPlantingCustomerQuoteText,
  renderPresentationCustomerPreviewText,
  presentationModelRetainsExportMetadata,
  presentationModelRetainsInternalPlantingCalculations,
  type PresentationPreviewItem,
  type PresentationPreviewSection,
} from "./render-customer-preview"
export type {
  QuotePresentationLine,
  QuotePresentationLineRole,
  QuotePresentationLineSource,
  QuotePresentationModel,
  QuotePresentationSection,
  QuotePresentationSectionKind,
} from "./types"
