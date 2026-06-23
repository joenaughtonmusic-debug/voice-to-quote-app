"use client"

import { useState } from "react"
import { ArrowLeft, Check, Send, Save, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { quoteDraft } from "@/lib/quote-data"
import { saveGeneratedQuoteDraft } from "@/lib/save-quote-draft"
import { buildCustomerPreviewQuoteInput } from "@/lib/customer-preview-flow"
import { buildCustomerDraftPreviewModel } from "@/lib/customer-preview-render"
import { buildCustomerQuotePreview, type CustomerQuotePreview } from "@/lib/customer-quote-preview"
import type { CustomerQuoteOptionGroup } from "@/lib/customer-quote-options"
import { CustomerQuoteOptionsCard } from "@/components/customer-quote-options-card"
import type { PricingFact } from "@/lib/core/pricing-extraction"
import {
  processedQuoteToEditableSections,
  type EditableQuoteSection,
  type ProcessedQuote,
} from "@/lib/processed-quote"
import {
  renderTemplatePreviewSections,
  type SandboxRenderedTemplateSection,
} from "@/lib/template-preview-sandbox"
import {
  displayTemplateName,
  type QuoteTemplateLibraryItem,
  type QuoteTemplateSectionDraft,
} from "@/lib/template-import-learning"
import type { TemplateSelectionSource } from "@/lib/template-selection"
import {
  buildQuotePresentationModel,
  isPlantingWorkflow,
  type PresentationPreviewSection,
} from "@/lib/quote-presentation"

type PreviewMode = "standard" | "template"

type SaveState = "idle" | "saving" | "success" | "error"

export function QuoteDraft({
  onBack,
  onSaved,
  rawTranscript,
  processedQuote,
  draftId,
  quoteSections,
  previewMode = "standard",
  templateSections = [],
  selectedTemplate = null,
  selectedTemplateSource = "none",
  pricingFacts,
}: {
  onBack: () => void
  onSaved: () => void
  rawTranscript: string
  processedQuote: ProcessedQuote
  draftId?: string | null
  quoteSections?: EditableQuoteSection[] | null
  previewMode?: PreviewMode
  templateSections?: QuoteTemplateSectionDraft[]
  selectedTemplate?: QuoteTemplateLibraryItem | null
  selectedTemplateSource?: TemplateSelectionSource
  pricingFacts?: PricingFact[]
}) {
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveMessage, setSaveMessage] = useState("")
  const [activePreviewMode, setActivePreviewMode] = useState<PreviewMode>("standard")
  const customerPreviewInput = buildCustomerPreviewQuoteInput({
    processedQuote,
    rawTranscript,
    selectedTemplate,
    pricingFacts,
  })
  const customerPreview = buildCustomerQuotePreview(customerPreviewInput, { includeDeckingScope: true, includeRetainingScope: true })
  const hasTemplatePreview = templateSections.length > 0
  const renderedTemplateSections = hasTemplatePreview
    ? renderTemplatePreviewSections(templateSections, customerPreviewInput as ProcessedQuote, customerPreview, selectedTemplate)
    : []
  const previewModel = buildCustomerDraftPreviewModel({
    processedQuote,
    customerPreview,
    mode: activePreviewMode,
    templateSections: renderedTemplateSections,
    rawTranscript,
    selectedTemplate: customerPreviewInput.selected_template,
  })
  const plantingPresentationModel =
    isPlantingWorkflow(processedQuote) &&
    buildQuotePresentationModel({
      quote: processedQuote,
      rawTranscript,
      customerPreview,
    })
  const usePlantingPresentationCustomerView = Boolean(previewModel.plantingCustomerQuote?.length)
  const useAssemblyPreview = Boolean(previewModel.assembly) && !usePlantingPresentationCustomerView
  const rendererPath = previewModel.rendererPath
  const quoteJobType = processedQuote.job_type || "not captured"
  const primaryQuoteJobType = processedQuote.primary_quote?.job_type || "not captured"
  const maintenanceDraft = isMaintenanceDraft(processedQuote, rawTranscript)
  const assemblyFailedForMaintenance = maintenanceDraft && !useAssemblyPreview

  async function handleSaveDraft() {
    setSaveState("saving")
    setSaveMessage("")

    const result = await saveGeneratedQuoteDraft(
      rawTranscript,
      processedQuote,
      quoteSections ?? processedQuoteToEditableSections(processedQuote),
      draftId,
    )

    setSaveState(result.ok ? "success" : "error")
    setSaveMessage(result.message)

    if (result.ok) {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-secondary/60">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to review"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Quote Draft</h2>
          <p className="text-xs text-muted-foreground">Customer-facing preview</p>
        </div>
      </header>

      {/* Paper preview */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-40">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-md">
          {/* Business header */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-base font-semibold text-foreground">{quoteDraft.business.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{quoteDraft.business.phone}</p>
              <p className="text-xs text-muted-foreground">{quoteDraft.business.email}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Quote</p>
              <p className="text-sm font-medium text-foreground">{quoteDraft.quoteNo}</p>
              <p className="text-xs text-muted-foreground">{quoteDraft.date}</p>
            </div>
          </div>

          {/* Client */}
          <div className="py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prepared for</p>
            <p className="mt-1 text-sm font-medium text-foreground">{processedQuote.client_name || "Not captured"}</p>
            <p className="text-sm text-muted-foreground">{processedQuote.site_address || "Not captured"}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quote</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">{previewModel.quoteTitle}</h3>
            {processedQuote.job_type && !useAssemblyPreview && (
              <p className="mt-0.5 text-sm text-muted-foreground">{processedQuote.job_type}</p>
            )}
          </div>

          <StandardCustomerPreview
            scopeItems={previewModel.scopeItems}
            exclusions={previewModel.exclusions}
            customerPreview={customerPreview}
            assemblySections={usePlantingPresentationCustomerView ? [] : previewModel.assembly?.sections ?? []}
            plantingCustomerQuote={previewModel.plantingCustomerQuote}
            assemblyFailedForMaintenance={assemblyFailedForMaintenance}
            hideLegacyLabourPricing={maintenanceDraft}
            tradeOptions={previewModel.plantingCustomerTradeOptions}
          />

          <details className="mt-5 rounded-xl border border-dashed border-border bg-secondary/30 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dev diagnostics
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
              <p>Renderer path: {rendererPath}</p>
              <p>quote.job_type: {quoteJobType}</p>
              <p>primary_quote.job_type: {primaryQuoteJobType}</p>
              <p>Assembly exists: {useAssemblyPreview ? "yes" : "no"}</p>
              <p>Selected template: {selectedTemplate ? displayTemplateName(selectedTemplate) : "None"}</p>
              <p>Selected template source: {selectedTemplateSource}</p>
              <p>Pricing facts count: {customerPreview.pricingFacts.length}</p>
              <p>Assembly sections count: {previewModel.assembly?.sections.length ?? 0}</p>
              <p>Presentation model active: {plantingPresentationModel ? "yes" : "no"}</p>
              {plantingPresentationModel && (
                <p>Presentation model line count: {plantingPresentationModel.lines.length}</p>
              )}
              {previewModel.plantingInternalReviewNotes.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900">
                  <p className="font-semibold">Internal review notes (not shown to customer)</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {previewModel.plantingInternalReviewNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
              {previewModel.assemblyInputDebug && (
                <>
                  <p>Assembly input customer_scope count: {previewModel.assemblyInputDebug.customer_scope.length}</p>
                  <p>Assembly input primary_quote.scope count: {previewModel.assemblyInputDebug.primary_quote_scope.length}</p>
                  <p>Assembly input primary_quote.notes count: {previewModel.assemblyInputDebug.primary_quote_notes.length}</p>
                  <p>Assembly input labour_allowance: {previewModel.assemblyInputDebug.labour_allowance || "empty"}</p>
                  <p>Assembly input greenwaste: {previewModel.assemblyInputDebug.greenwaste || "empty"}</p>
                  <p>Assembly input rawTranscript present: {previewModel.assemblyInputDebug.rawTranscriptPresent ? "yes" : "no"}</p>
                  <p>Assembly input selectedTemplate: {previewModel.assemblyInputDebug.selectedTemplateText || "none"}</p>
                </>
              )}
            </div>
          </details>

          {hasTemplatePreview && !useAssemblyPreview && (
            <details className="mt-5 rounded-xl border border-dashed border-muted-foreground/30 bg-secondary/20 p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Template Wording Preview — experimental, not used for quote
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Generic template placeholder wording only. Standard Preview above is the customer quote.
              </p>
              {activePreviewMode === "template" ? (
                <>
                  <TemplateCustomerPreview sections={renderedTemplateSections} />
                  <button
                    type="button"
                    onClick={() => setActivePreviewMode("standard")}
                    className="mt-3 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Hide template wording preview
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setActivePreviewMode("template")}
                  className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground"
                >
                  Show template wording preview
                </button>
              )}
            </details>
          )}

          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            This quote is valid for {quoteDraft.validDays} days from {quoteDraft.date}. {quoteDraft.business.abn}.
          </p>
        </div>
      </div>

      {/* Sticky actions */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md">
          {saveMessage && (
            <p
              className={cn(
                "mb-3 text-center text-xs leading-relaxed",
                saveState === "success" ? "text-success" : "text-destructive",
              )}
            >
              {saveMessage}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saveState === "saving"}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-foreground active:scale-[0.99]"
            >
              {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </button>
            <button
              type="button"
              onClick={onBack}
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.99]"
            >
              <Send className="h-4 w-4" />
              Send to Customer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function isMaintenanceDraft(processedQuote: ProcessedQuote, rawTranscript: string) {
  return /\bmaintenance|garden\s+maintenance\b/i.test(
    [
      processedQuote.job_type,
      processedQuote.primary_quote?.job_type,
      processedQuote.quote_title,
      processedQuote.primary_quote?.quote_title,
      rawTranscript,
    ]
      .filter(Boolean)
      .join(" "),
  )
}

function StandardCustomerPreview({
  scopeItems,
  exclusions,
  customerPreview,
  assemblySections,
  plantingCustomerQuote,
  assemblyFailedForMaintenance,
  hideLegacyLabourPricing,
  tradeOptions,
}: {
  scopeItems: string[]
  exclusions: string[]
  customerPreview: CustomerQuotePreview
  assemblySections: Array<{ title: string; items: string[] }>
  plantingCustomerQuote: PresentationPreviewSection[] | null
  assemblyFailedForMaintenance: boolean
  hideLegacyLabourPricing: boolean
  tradeOptions: CustomerQuoteOptionGroup[]
}) {
  if (plantingCustomerQuote && plantingCustomerQuote.length > 0) {
    return (
      <>
        <PlantingCustomerQuotePreview sections={plantingCustomerQuote} />

        {tradeOptions.length > 0 && (
          <div className="mt-5">
            <CustomerQuoteOptionsCard groups={tradeOptions} />
          </div>
        )}
      </>
    )
  }

  if (assemblySections.length > 0) {
    return (
      <>
        <div className="mt-5 flex flex-col gap-4">
          {assemblySections.map((section) => (
            <section key={section.title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
              <ul className="flex flex-col gap-1.5">
                {section.items.map((item, index) => (
                  <li key={`${section.title}-${item}-${index}`} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {tradeOptions.length > 0 && (
          <div className="mt-5">
            <CustomerQuoteOptionsCard groups={tradeOptions} />
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Excludes</p>
            {exclusions.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {exclusions.map((exc) => (
                  <li key={exc} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {exc}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No exclusions captured.</p>
            )}
          </div>
        </div>
      </>
    )
  }

  if (assemblyFailedForMaintenance) {
    return (
      <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm font-semibold text-destructive">Maintenance quote assembly did not render.</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          The legacy Scope/Labour renderer has been disabled for maintenance drafts to avoid showing incorrect labour
          labels or calculated labour totals. Review the draft diagnostics above before sending.
        </p>
      </div>
    )
  }

  return (
    <>
      {scopeItems.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</p>
          <ul className="flex flex-col gap-1.5">
            {scopeItems.map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <CustomerQuotePricingPreview preview={customerPreview} hideLabourLine={hideLegacyLabourPricing} />

      {tradeOptions.length > 0 && (
        <div className="mt-5">
          <CustomerQuoteOptionsCard groups={tradeOptions} />
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Excludes</p>
          {exclusions.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {exclusions.map((exc) => (
                <li key={exc} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  {exc}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No exclusions captured.</p>
          )}
        </div>
      </div>
    </>
  )
}

function TemplateCustomerPreview({ sections }: { sections: SandboxRenderedTemplateSection[] }) {
  if (sections.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-3">
        <p className="text-sm text-muted-foreground">No data available.</p>
      </div>
    )
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      {sections.map((section) => (
        <section key={section.id} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.sectionName}</p>
            <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
              {section.category.replaceAll("_", " ")}
            </span>
          </div>
          {section.renderedText ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{section.renderedText}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No data available.</p>
          )}
          {section.missingPlaceholders.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Not supplied: {section.missingPlaceholders.join(", ")}.
            </p>
          )}
        </section>
      ))}
    </div>
  )
}

function PlantingCustomerQuotePreview({ sections }: { sections: PresentationPreviewSection[] }) {
  return (
    <div className="mt-5 flex flex-col gap-4">
      {sections.map((section) => (
        <section key={section.title}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {section.items.map((item, index) => (
              <div key={`${section.title}-${item.title}-${index}`} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    {item.detail && item.detail !== item.title && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
                    )}
                  </div>
                  {item.subtotal && (
                    <p className="shrink-0 text-sm font-semibold text-foreground">{item.subtotal}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function CustomerQuotePricingPreview({
  preview,
  hideLabourLine = false,
}: {
  preview: CustomerQuotePreview
  hideLabourLine?: boolean
}) {
  const hasPricingSections =
    preview.pricingFacts.length > 0 ||
    (!hideLabourLine && Boolean(preview.labourLine)) ||
    preview.plantOptions.length > 0 ||
    preview.materialLines.length > 0
  if (!hasPricingSections) return null

  return (
    <div className="mt-5 flex flex-col gap-4">
      {preview.pricingFacts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {preview.pricingFacts.map((fact) => (
              <div key={fact.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {fact.cadenceText ? `Price ${fact.cadenceText}` : "Price"}
                  </p>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{fact.amountText}</p>
                </div>
                {fact.inclusions.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Includes {fact.inclusions.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hideLabourLine && preview.labourLine && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Labour</p>
          <div className="rounded-xl border border-border px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{preview.labourLine.label}</p>
              {preview.labourLine.amount && (
                <p className="shrink-0 text-sm font-semibold text-foreground">{preview.labourLine.amount}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {preview.plantOptions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plants</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {preview.plantOptions.map((option) => (
              <div key={`${option.id}-${option.label}`} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {option.label} — {option.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{option.quantityText}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{option.subtotalText}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview.materialLines.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Materials / removal</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {preview.materialLines.map((line) => (
              <div key={line.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{line.label}</p>
                    {line.detail && <p className="mt-0.5 text-sm text-muted-foreground">{line.detail}</p>}
                  </div>
                  {line.amount && <p className="shrink-0 text-sm font-semibold text-foreground">{line.amount}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
