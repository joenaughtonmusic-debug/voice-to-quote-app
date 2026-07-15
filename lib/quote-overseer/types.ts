import type { ProcessedQuote } from "../processed-quote"
import type { XeroExportLineItem } from "../export/xero/types"

/**
 * Quote Overseer — a post-generation review layer.
 *
 * Distinct from the in-pipeline Quote Auditor (lib/quote-auditor): the Auditor
 * runs deterministic validators (V01–V08) on the ProcessedQuote *before* it is
 * rendered. The Overseer runs *after* generation, on the assembled OUTPUT
 * artifacts (rendered customer copy, JMS panel, Xero export lines, renderer
 * path) — the cross-layer view the Auditor structurally cannot see. It never
 * mutates the quote and it does not call OpenAI; it only returns findings.
 */

export type QuoteOverseerSeverity = "error" | "warning" | "info"

export type QuoteOverseerLayer = "customer_preview" | "internal_review" | "export" | "cross_layer"

export type QuoteOverseerCheck =
  | "unit_mismatch" // O1 (future)
  | "customer_preview_leaks_labour" // O2
  | "labour_total_missing_or_inconsistent" // O3 (future)
  | "export_mapping_incomplete" // O4
  | "customer_preview_missing_scope" // O5
  | "renderer_path_mismatch" // O6 (future)
  | "customer_copy_not_ready" // O7

export type QuoteOverseerFinding = {
  /** Stable id, e.g. "O5-customer-preview-missing-scope". */
  id: string
  check: QuoteOverseerCheck
  severity: QuoteOverseerSeverity
  layer: QuoteOverseerLayer
  message: string
  /** The specific offending text or missing item, for reviewer context. */
  evidence?: string
  suggestion?: string
}

export type QuoteOverseerStatus = "ok" | "review" | "blocked"

export type QuoteOverseerResult = {
  /** ok = no findings; review = warnings/info only; blocked = at least one error. */
  status: QuoteOverseerStatus
  findings: QuoteOverseerFinding[]
  errorCount: number
  warningCount: number
}

export type QuoteOverseerInput = {
  /** The generated quote — the source of truth. Never mutated. */
  quote: ProcessedQuote
  /** Rendered customer-facing copy (renderCustomerDraftPreviewText output). */
  customerPreviewText: string
  /** Which renderer produced the preview, if known. */
  rendererPath?: string
  /** Internal View "Matched JMS Line Items" panel lines, if available. */
  matchedJmsLines?: string[]
  /** Structured Xero export lines. O4 only runs when these are provided. */
  xeroExportLines?: XeroExportLineItem[]
  /** Original transcript, for optional scope-presence heuristics. */
  rawTranscript?: string
}

export type QuoteOverseerReviewer = (input: QuoteOverseerInput) => QuoteOverseerFinding[]
