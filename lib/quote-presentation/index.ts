import type { CustomerQuotePreview } from "../customer-quote-preview"
import type { ProcessedQuote } from "../processed-quote"
import { buildGardenTidyPresentationModel, isGardenTidyWorkflow } from "./garden-tidy"
import { buildPlantingPresentationModel, isPlantingWorkflow } from "./planting"
import { buildTradeCalculatorPresentationModel, isTradeCalculatorWorkflow } from "./trade-calculator"
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

  if (isGardenTidyWorkflow(input.quote)) {
    return buildGardenTidyPresentationModel(input)
  }

  if (isTradeCalculatorWorkflow(input.quote)) {
    return buildTradeCalculatorPresentationModel(input)
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

export { buildGardenTidyPresentationModel, isGardenTidyWorkflow } from "./garden-tidy"
export { buildPlantingPresentationModel, isPlantingWorkflow, materialLineIsPriced } from "./planting"
export {
  buildTradeCalculatorPresentationModel,
  hasTradeBillOptions,
  isTradeCalculatorWorkflow,
} from "./trade-calculator"
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
