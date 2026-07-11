"use client"

import { useEffect, useRef, useState } from "react"
import {
  X,
  AlertTriangle,
  Save,
  Send,
  Pencil,
  Check,
  FileText,
  Loader2,
  Camera,
  ImageIcon,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { buildCustomerPreviewQuoteInput } from "@/lib/customer-preview-flow"
import { buildCustomerQuotePreview } from "@/lib/customer-quote-preview"
import { reviewQuote, type QuoteOverseerResult } from "@/lib/quote-overseer"
import { buildOverseerInputFromReview } from "@/lib/quote-overseer/from-review"
import {
  buildQuoteHandoffForDraftPreview,
  editableSectionsToProcessedQuote,
  processedQuoteToEditableSections,
  type EditableQuoteSection,
  type ProcessedQuote,
} from "@/lib/processed-quote"
import { groupCustomerQuoteOptions } from "@/lib/customer-quote-options"
import { CustomerQuoteOptionsCard } from "@/components/customer-quote-options-card"
import { ShadowPlannerCard } from "@/components/shadow-planner-card"
import { saveGeneratedQuoteDraft } from "@/lib/save-quote-draft"
import { uploadDraftPhoto, loadDraftPhotos, deleteDraftPhoto, type DraftPhoto } from "@/lib/draft-photos"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/hooks/use-auth"
import type { ExportCategoryMapping } from "@/lib/export-mappings"
import {
  displayTemplateName,
  type QuoteTemplateLibraryItem,
  type QuoteTemplateSectionDraft,
} from "@/lib/template-import-learning"
import { resolveTemplateSelection, type TemplateSelectionSource } from "@/lib/template-selection"
import { renderTemplatePreviewSections } from "@/lib/template-preview-sandbox"
import { quoteFactsFromProcessedQuote } from "@/lib/core/quote-facts"
import { buildQuoteReviewNotices, type ReviewNotice } from "@/lib/core/review-notices"
import { buildPricingReviewNotices, extractPricing, type PricingFact } from "@/lib/core/pricing-extraction"
import {
  customerVisibleTemplateRecommendation,
  plantingTemplateSignalsFromQuote,
  recommendTemplateForQuote,
  type TemplateRecommendation,
} from "@/lib/template-recommendation"
import {
  isMissingOptionalTemplateColumnError,
  TEMPLATE_RECOMMENDATION_FALLBACK_SELECT,
  TEMPLATE_RECOMMENDATION_SELECT,
} from "@/lib/template-recommendation-loading"
import { deckingReviewFromQuoteFacts, type DeckingReviewModel } from "@/lib/trades/decking/review"
import { retainingReviewFromQuoteFacts, type RetainingReviewModel } from "@/lib/trades/retaining/review"
import { resolveLabourExportPrice, type LabourAllowanceWorkings } from "@/lib/export/labour-line-builder"

type View = "customer" | "internal"
export type CustomerPreviewMode = "standard" | "template"
type SaveState = "idle" | "saving" | "success" | "error"
type ExportState = "idle" | "exporting" | "success" | "error" | "not_configured"

export function QuoteReview({
  onClose,
  onPreviewDraft,
  onSaved,
  rawTranscript,
  originalTranscript,
  processedQuote,
  onQuoteEdited,
  onSectionsEdited,
  draftId,
  initialSections,
}: {
  onClose: () => void
  onPreviewDraft: (options: {
    mode: CustomerPreviewMode
    templateSections: QuoteTemplateSectionDraft[]
    selectedTemplate: QuoteTemplateLibraryItem | null
    selectedTemplateSource: TemplateSelectionSource
    processedQuote: ProcessedQuote
    pricingFacts: PricingFact[]
  }) => void
  onSaved: (draftId?: string | null) => void
  rawTranscript: string
  originalTranscript: string
  processedQuote: ProcessedQuote
  onQuoteEdited: (processedQuote: ProcessedQuote) => void
  onSectionsEdited: (sections: EditableQuoteSection[]) => void
  draftId?: string | null
  initialSections?: EditableQuoteSection[] | null
}) {
  const { user } = useAuth()
  const [view, setView] = useState<View>("internal")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveMessage, setSaveMessage] = useState("")
  const [exportState, setExportState] = useState<ExportState>("idle")
  const [exportMessage, setExportMessage] = useState("")
  const [customerPreviewMode, setCustomerPreviewMode] = useState<CustomerPreviewMode>("standard")
  const [reviewedTemplates, setReviewedTemplates] = useState<QuoteTemplateLibraryItem[]>([])
  const [templateSectionsByTemplateId, setTemplateSectionsByTemplateId] = useState<Record<string, QuoteTemplateSectionDraft[]>>({})
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [selectedTemplateSource, setSelectedTemplateSource] = useState<TemplateSelectionSource>("none")
  const [selectedTemplateSections, setSelectedTemplateSections] = useState<QuoteTemplateSectionDraft[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateSectionsLoading, setTemplateSectionsLoading] = useState(false)
  const [templatePreviewMessage, setTemplatePreviewMessage] = useState("")
  const [sections, setSections] = useState<EditableQuoteSection[]>(() =>
    initialSections ?? processedQuoteToEditableSections(processedQuote),
  )
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const [activeDraftId, setActiveDraftId] = useState<string | null>(draftId ?? null)

  const editedQuoteForReview = editableSectionsToProcessedQuote(sections, processedQuote)
  const selectedTemplate = reviewedTemplates.find((template) => template.id === selectedTemplateId) ?? null
  const quoteTextParts = [
    editedQuoteForReview.quote_title,
    editedQuoteForReview.job_type,
    editedQuoteForReview.primary_quote?.quote_title,
    editedQuoteForReview.primary_quote?.job_type,
    ...(editedQuoteForReview.primary_quote?.scope ?? []),
    ...(editedQuoteForReview.primary_quote?.notes ?? []),
    ...(editedQuoteForReview.customer_scope ?? []),
    ...(editedQuoteForReview.materials ?? []),
    editedQuoteForReview.greenwaste,
    ...(editedQuoteForReview.exclusions ?? []),
    ...(editedQuoteForReview.missing_information ?? []),
    ...(editedQuoteForReview.confidence_warnings ?? []),
  ]
  const pricingFacts = extractPricing([rawTranscript, originalTranscript, ...quoteTextParts].filter(Boolean).join("\n")).pricing
  const customerPreviewInput = buildCustomerPreviewQuoteInput({
    processedQuote: editedQuoteForReview,
    rawTranscript,
    originalTranscript,
    selectedTemplate,
    pricingFacts,
  })
  const customerPreview = buildCustomerQuotePreview(customerPreviewInput, { includeDeckingScope: true, includeRetainingScope: true })
  // Deterministic Quote Overseer — reviews the rendered customer copy for
  // cross-layer issues. Internal display only: it never mutates the quote and no
  // Xero export lines are passed (O4 stays dormant here).
  const overseerResult = reviewQuote(
    buildOverseerInputFromReview({
      processedQuote: editedQuoteForReview,
      customerPreview,
      rawTranscript,
      originalTranscript,
      selectedTemplate,
      pricingFacts,
    }),
  )
  const quoteFacts = quoteFactsFromProcessedQuote(editedQuoteForReview)
  const deckingReview = deckingReviewFromQuoteFacts(quoteFacts)
  const retainingReview = retainingReviewFromQuoteFacts(quoteFacts)
  const labourExportPrice = resolveLabourExportPrice({
    pricing_facts: pricingFacts,
    labour_allowance: editedQuoteForReview.labour_allowance,
    primary_quote: editedQuoteForReview.primary_quote,
    line_items: editedQuoteForReview.line_items,
  })
  const reviewNotices = [
    ...buildQuoteReviewNotices({
    rawTranscript,
    originalTranscript,
    quoteTextParts,
    }),
    ...buildPricingReviewNotices({
      pricing: pricingFacts,
      lineItems: editedQuoteForReview.line_items,
    }),
  ]
  const templateRecommendation = recommendTemplateForQuote({
    facts: quoteFacts,
    templates: reviewedTemplates,
    sectionsByTemplateId: templateSectionsByTemplateId,
    trade: editedQuoteForReview.job_type,
    jobType: editedQuoteForReview.primary_quote?.job_type || editedQuoteForReview.job_type,
    plantingSignals: plantingTemplateSignalsFromQuote(editedQuoteForReview),
  })
  const renderedCustomerScope = customerPreview.scopeItems.join("\n")
  const visible = sections
    .filter((section) => {
      if (view === "customer") return section.customer_visible && section.key !== "primary_quote"
      return section.internal_visible
    })
    .map((section) =>
      view === "customer" &&
      section.key === "customer_scope" &&
      renderedCustomerScope &&
      !dirtyKeys.has(section.key)
        ? { ...section, title: "Scope", content: renderedCustomerScope }
        : section,
    )
  const customerQuoteOptionGroups = groupCustomerQuoteOptions(editedQuoteForReview.quote_options)
  const hasUnsavedChanges = dirtyKeys.size > 0
  const displayedTemplateRecommendation = customerVisibleTemplateRecommendation({
    recommendation: templateRecommendation,
    selectedTemplateId: selectedTemplate?.id,
  })
  const renderedTemplatePreviewSections =
    selectedTemplateSections.length > 0
      ? renderTemplatePreviewSections(
          selectedTemplateSections,
          customerPreviewInput as ProcessedQuote,
          customerPreview,
          selectedTemplate,
        )
      : []

  useEffect(() => {
    let active = true

    async function loadReviewedTemplates() {
      if (!user) {
        setReviewedTemplates([])
        setTemplateSectionsByTemplateId({})
        return
      }

      const userId = user.id
      setTemplatesLoading(true)
      async function selectReviewedTemplates(selectFields: string) {
        return supabase
          .from("quote_templates")
          .select(selectFields)
          .eq("user_id", userId)
          .in("status", ["reviewed", "active"])
          .order("updated_at", { ascending: false })
      }

      let { data, error } = await selectReviewedTemplates(TEMPLATE_RECOMMENDATION_SELECT)

      if (error && isMissingOptionalTemplateColumnError(error)) {
        const fallbackResult = await selectReviewedTemplates(TEMPLATE_RECOMMENDATION_FALLBACK_SELECT)
        data = fallbackResult.data
        error = fallbackResult.error
      }

      if (!active) return
      setTemplatesLoading(false)

      if (error) {
        setTemplatePreviewMessage("Reviewed templates are unavailable. Run the Template Import Learning schema if needed.")
        return
      }

      const templates = ((data ?? []) as unknown) as QuoteTemplateLibraryItem[]
      setReviewedTemplates(templates)

      const templateIds = templates.map((template) => template.id).filter(Boolean)
      if (templateIds.length === 0) {
        setTemplateSectionsByTemplateId({})
        return
      }

      const { data: sectionData, error: sectionError } = await supabase
        .from("quote_template_sections")
        .select("id, template_id, display_order, section_name, section_category, raw_text, template_text, placeholders, customer_facing, exportable, export_category, created_at, updated_at")
        .in("template_id", templateIds)

      if (!active) return

      if (sectionError) {
        setTemplateSectionsByTemplateId({})
        setTemplatePreviewMessage("Template recommendations are unavailable until template sections can be loaded.")
        return
      }

      const groupedSections = ((sectionData ?? []) as QuoteTemplateSectionDraft[]).reduce<Record<string, QuoteTemplateSectionDraft[]>>(
        (groups, section) => {
          const templateId = section.template_id
          if (!groups[templateId]) groups[templateId] = []
          groups[templateId].push(section)
          return groups
        },
        {},
      )
      setTemplateSectionsByTemplateId(groupedSections)
    }

    void loadReviewedTemplates()

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    let active = true

    async function loadSelectedTemplateSections() {
      setSelectedTemplateSections([])
      setTemplatePreviewMessage("")

      if (!selectedTemplateId) return

      setTemplateSectionsLoading(true)
      const { data, error } = await supabase
        .from("quote_template_sections")
        .select("id, template_id, display_order, section_name, section_category, raw_text, template_text, placeholders, customer_facing, exportable, export_category, created_at, updated_at")
        .eq("template_id", selectedTemplateId)
        .order("display_order", { ascending: true })

      if (!active) return
      setTemplateSectionsLoading(false)

      if (error) {
        setTemplatePreviewMessage("Could not load sections for this template.")
        return
      }

      setSelectedTemplateSections((data ?? []) as QuoteTemplateSectionDraft[])
      if ((data ?? []).length === 0) {
        setTemplatePreviewMessage("This reviewed template has no saved sections yet.")
      }
    }

    void loadSelectedTemplateSections()

    return () => {
      active = false
    }
  }, [selectedTemplateId])

  useEffect(() => {
    if (reviewedTemplates.length === 0 || selectedTemplateSource === "manual") return

    const resolution = resolveTemplateSelection({
      templates: reviewedTemplates,
      selectedTemplateId: editedQuoteForReview.selected_template_id,
      selectedTemplateName: editedQuoteForReview.selected_template_name,
      recommendation: templateRecommendation,
      facts: quoteFacts,
      jobType: editedQuoteForReview.primary_quote?.job_type || editedQuoteForReview.job_type,
      trade: editedQuoteForReview.job_type,
      currentTemplateId: selectedTemplateId,
      currentSource: selectedTemplateSource,
    })

    if (resolution.templateId !== selectedTemplateId || resolution.source !== selectedTemplateSource) {
      setSelectedTemplateId(resolution.templateId)
      setSelectedTemplateSource(resolution.source)
    }
  }, [
    selectedTemplateId,
    selectedTemplateSource,
    reviewedTemplates,
    editedQuoteForReview.selected_template_id,
    editedQuoteForReview.selected_template_name,
    templateRecommendation,
    quoteFacts,
    editedQuoteForReview.primary_quote?.job_type,
    editedQuoteForReview.job_type,
  ])

  async function loadExportMappingsForPayload(): Promise<ExportCategoryMapping[]> {
    if (!user) return []

    const { data, error } = await supabase
      .from("export_category_mappings")
      .select("id, user_id, provider, category, account_code, tax_type, export_enabled, item_code_policy, is_user_confirmed, source")
      .eq("user_id", user.id)
      .eq("provider", "xero")

    if (error) {
      console.warn("Could not load export mappings for Xero payload", error.message)
      return []
    }

    return (data ?? []) as ExportCategoryMapping[]
  }

  async function handleSaveDraft() {
    setSaveState("saving")
    setSaveMessage("")

    const editedQuote = editableSectionsToProcessedQuote(sections, processedQuote)
    const result = await saveGeneratedQuoteDraft(originalTranscript, editedQuote, sections, activeDraftId)

    setSaveState(result.ok ? "success" : "error")
    setSaveMessage(result.message)

    if (result.ok) {
      const savedId = result.draftId ?? activeDraftId
      setActiveDraftId(savedId)
      setDirtyKeys(new Set())
      onSaved(savedId)
    }
  }

  async function handlePushToJobManagement() {
    setExportState("exporting")
    setExportMessage("")

    try {
      const editedQuote = editableSectionsToProcessedQuote(sections, processedQuote)
      const exportMappings = await loadExportMappingsForPayload()
      const response = await fetch("/api/export-xero-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processed_quote: buildCustomerPreviewQuoteInput({
            processedQuote: editedQuote,
            rawTranscript,
            originalTranscript,
            selectedTemplate,
            pricingFacts,
          }),
          draft_id: activeDraftId ?? null,
          export_mappings: exportMappings,
        }),
      })
      const result = await response.json().catch(() => null)
      const message =
        typeof result?.message === "string"
          ? result.message
          : response.ok
            ? "Xero draft quote payload generated."
            : "Could not generate Xero export payload."

      if (result?.status === "missing_webhook") {
        console.log("xero export payload ready", result.payload)
        setExportState("not_configured")
        setExportMessage(message)
        return
      }

      setExportState(response.ok && result?.ok ? "success" : "error")
      setExportMessage(message)
    } catch (error) {
      setExportState("error")
      setExportMessage(error instanceof Error ? error.message : "Could not generate Xero export payload.")
    }
  }

  function handleSaveSection(key: string, content: string) {
    setSections((current) => {
      const nextSections = current.map((section) => (section.key === key ? { ...section, content } : section))
      onQuoteEdited(editableSectionsToProcessedQuote(nextSections, processedQuote))
      onSectionsEdited(nextSections)
      return nextSections
    })
    setDirtyKeys((current) => new Set(current).add(key))
    setSaveState("idle")
    setSaveMessage("")
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Review Generated Quote</h2>
          <p className="text-xs text-muted-foreground">
            Structured AI output{hasUnsavedChanges ? " · Unsaved changes" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close review"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Segmented control */}
      <div className="bg-card px-5 pb-4">
        <div className="flex rounded-xl bg-secondary p-1">
          {(
            [
              { id: "customer", label: "Customer View" },
              { id: "internal", label: "Internal View" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                view === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable cards */}
      <div className="flex-1 overflow-y-auto px-5 py-4 pb-44">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Transcript</h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{rawTranscript}</p>
          </section>

          {view === "internal" && processedQuote.shadow_report && (
            <ShadowPlannerCard report={processedQuote.shadow_report} />
          )}
          {view === "internal" && reviewNotices.length > 0 && <ReviewNoticesCard notices={reviewNotices} />}
          {view === "internal" && pricingFacts.length > 0 && <PricingFactsCard pricing={pricingFacts} />}
          {view === "internal" && (
            <TemplateDiagnosticsCard
              templates={reviewedTemplates}
              selectedTemplate={selectedTemplate}
              selectedTemplateSource={selectedTemplateSource}
              recommendation={templateRecommendation}
            />
          )}
          {view === "internal" && deckingReview && <DeckingReviewCard review={deckingReview} />}
          {view === "internal" && retainingReview && <RetainingReviewCard review={retainingReview} />}
          {view === "internal" && labourExportPrice.pricingSource !== "unpriced" && (
            <LabourPricingCard labourPrice={labourExportPrice} />
          )}
          {view === "internal" && processedQuote.audit_result && (
            <QuoteAuditCard auditResult={processedQuote.audit_result} />
          )}
          {view === "internal" && <QuoteOverseerCard result={overseerResult} />}
          {view === "internal" && (editedQuoteForReview.optional_priced_works?.length ?? 0) > 0 && (
            <OptionalPricedWorksCard works={editedQuoteForReview.optional_priced_works!} />
          )}

          {view === "customer" && (
            <TemplatePreviewControls
              templates={reviewedTemplates}
              recommendation={displayedTemplateRecommendation}
              selectedTemplateId={selectedTemplateId}
              selectedTemplate={selectedTemplate}
              selectedTemplateSource={selectedTemplateSource}
              templateSectionsAvailable={selectedTemplateSections.length > 0}
              previewMode={customerPreviewMode}
              loadingTemplates={templatesLoading}
              loadingSections={templateSectionsLoading}
              message={templatePreviewMessage}
              onTemplateChange={(templateId) => {
                setSelectedTemplateId(templateId)
                setSelectedTemplateSource("manual")
                setCustomerPreviewMode("standard")
              }}
              onPreviewModeChange={setCustomerPreviewMode}
              onUseTemplateAsQuote={() => setCustomerPreviewMode("template")}
            />
          )}

          {visible.map((section) => (
            view === "customer" && customerPreviewMode === "template" ? null : (
              <EditableCard
                key={section.key}
                section={section}
                dirty={dirtyKeys.has(section.key)}
                onSave={handleSaveSection}
              />
            )
          ))}

          {view === "customer" && customerPreviewMode === "template" && (
            <TemplatePreviewCard
              sections={renderedTemplatePreviewSections}
              loading={templateSectionsLoading}
              hasSelection={Boolean(selectedTemplateId)}
            />
          )}

          {view === "customer" && customerPreviewMode === "standard" && customerQuoteOptionGroups.length > 0 && (
            <CustomerQuoteOptionsCard groups={customerQuoteOptionGroups} />
          )}

          <SitePhotosCard draftId={activeDraftId} />

          <button
            type="button"
            onClick={() => {
              const mode =
                customerPreviewMode === "template" && selectedTemplateSections.length > 0 ? "template" : "standard"
              const quoteForDraftPreview = buildQuoteHandoffForDraftPreview({
                sections,
                baseQuote: editedQuoteForReview,
                customerScopeItems: customerPreview.scopeItems,
                dirtyKeys,
              })
              onPreviewDraft({
                mode,
                templateSections: mode === "template" ? selectedTemplateSections : [],
                selectedTemplate,
                selectedTemplateSource,
                processedQuote: quoteForDraftPreview,
                pricingFacts,
              })
            }}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-accent py-3.5 text-sm font-semibold text-primary active:scale-[0.99]"
          >
            <FileText className="h-4 w-4" />
            Preview Customer Quote Draft
          </button>
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
          {hasUnsavedChanges && saveState !== "success" && (
            <p className="mb-3 text-center text-xs font-medium text-warning-foreground">Unsaved changes</p>
          )}
          {exportMessage && (
            <p
              className={cn(
                "mb-3 text-center text-xs leading-relaxed",
                exportState === "success"
                  ? "text-success"
                  : exportState === "not_configured"
                    ? "text-warning-foreground"
                    : "text-destructive",
              )}
            >
              {exportMessage}
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
              onClick={handlePushToJobManagement}
              disabled={exportState === "exporting"}
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.99]"
            >
              {exportState === "exporting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Push to Job Management
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function severityClassName(severity: ReviewNotice["severity"]) {
  if (severity === "error") return "bg-destructive/10 text-destructive"
  if (severity === "warning") return "bg-warning/10 text-warning-foreground"
  return "bg-secondary text-muted-foreground"
}

function ReviewNoticesCard({ notices }: { notices: ReviewNotice[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Review Notices</h3>
          <p className="mt-1 text-xs text-muted-foreground">Guidance only. Review notices do not block quote creation.</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">Internal</span>
      </div>

      <div className="grid gap-2">
        {notices.map((notice) => (
          <div key={notice.id} className="rounded-xl border border-border bg-background p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-1 text-xs font-semibold capitalize", severityClassName(notice.severity))}>
                {notice.severity}
              </span>
              <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground capitalize">
                {notice.category.replaceAll("_", " ")}
              </span>
              <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground capitalize">
                {notice.source}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground">{notice.message}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function DeckingReviewCard({ review }: { review: DeckingReviewModel }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Decking Review</h3>
          <p className="mt-1 text-xs text-muted-foreground">Decking detected. Review assumptions before sending or export.</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">Internal</span>
      </div>

      <div className="grid gap-2">
        {review.areas.map((area, index) => (
          <div key={`${area.label}-${index}`} className="rounded-xl border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{area.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {area.dimensionsText} = {area.areaText}
                </p>
              </div>
              <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
                {area.buildScopeText}
              </span>
            </div>
            {(area.existingPostsRetained || area.existingSubframeRetained) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {area.existingPostsRetained && (
                  <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground">
                    Existing posts retained
                  </span>
                )}
                {area.existingSubframeRetained && (
                  <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground">
                    Existing subframe retained
                  </span>
                )}
              </div>
            )}
            {area.notices.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-warning-foreground">
                {area.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {review.totalAreaText && (
        <div className="mt-3 rounded-xl bg-secondary/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total area</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{review.totalAreaText}</p>
        </div>
      )}

      {review.wasteRemovalNotes.length > 0 && (
        <div className="mt-3 rounded-xl bg-secondary/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waste / removal</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-foreground">
            {review.wasteRemovalNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {review.notices.length > 0 && (
        <div className="mt-3 flex gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Some decking assumptions need review before sending.</p>
        </div>
      )}
    </section>
  )
}

function RetainingReviewCard({ review }: { review: RetainingReviewModel }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Retaining Review</h3>
          <p className="mt-1 text-xs text-muted-foreground">Retaining detected. Review assumptions before sending or export.</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">Internal</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground">
          {review.wallKindText}
        </span>
        {review.timberRetaining && (
          <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground">
            Timber retaining
          </span>
        )}
        {review.drainageMentioned && (
          <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground">
            Drainage included
          </span>
        )}
        {review.postsMentioned && (
          <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground">
            Posts / post holes mentioned
          </span>
        )}
        {review.accessDifficulty && (
          <span className="rounded-full bg-secondary/70 px-2 py-1 text-xs font-medium text-muted-foreground">
            Access difficulty
          </span>
        )}
      </div>

      <div className="grid gap-2">
        {review.sections.map((section, index) => (
          <div key={`${section.label}-${index}`} className="rounded-xl border border-border bg-background p-3">
            <p className="text-sm font-semibold text-foreground">{section.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {section.dimensionsText} = {section.areaText}
            </p>
            {section.notices.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-warning-foreground">
                {section.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {review.totalAreaText && (
        <div className="mt-3 rounded-xl bg-secondary/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total wall face area</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{review.totalAreaText}</p>
        </div>
      )}

      {review.wasteRemovalNotes.length > 0 && (
        <div className="mt-3 rounded-xl bg-secondary/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waste / removal</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-foreground">
            {review.wasteRemovalNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {review.notices.length > 0 && (
        <div className="mt-3 flex gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Some retaining assumptions need review before sending.</p>
        </div>
      )}
    </section>
  )
}

function LabourPricingCard({ labourPrice }: { labourPrice: ReturnType<typeof resolveLabourExportPrice> }) {
  const w = labourPrice.allowanceWorkings
  const isStructured = labourPrice.pricingSource === "structured_allowance"
  const isSpoken = labourPrice.pricingSource === "spoken_fixed"

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Labour Pricing</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            This is the labour price that will export to Xero.
          </p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">Internal</span>
      </div>

      <div className="rounded-xl border border-border bg-background p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
            {isStructured ? "Structured allowance" : isSpoken ? "Spoken fixed price" : "Unpriced"}
          </span>
          <span className="text-sm font-semibold text-foreground">{money(labourPrice.unitAmount)}</span>
        </div>

        {isStructured && w && (
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">{w.people}</span> people ×{" "}
              <span className="font-semibold text-foreground">{w.days}</span> days ×{" "}
              <span className="font-semibold text-foreground">{w.hoursPerPerson}</span> hrs/day ={" "}
              <span className="font-semibold text-foreground">{w.totalHours} hrs</span> total
            </p>
            <p>
              Labour rate:{" "}
              <span className="font-semibold text-foreground">
                ${w.rate} per labour hour
              </span>
            </p>
            <p>
              Total:{" "}
              <span className="font-semibold text-foreground">{money(labourPrice.unitAmount)}</span>
            </p>
            <p className="mt-1 italic text-muted-foreground/80">Source: &ldquo;{w.sourceText}&rdquo;</p>
          </div>
        )}

        {isSpoken && (
          <p className="mt-1 text-xs text-muted-foreground">
            Spoken customer price captured from transcript. Overrides allowance-based calculation.
          </p>
        )}
      </div>
    </section>
  )
}

function QuoteAuditCard({ auditResult }: { auditResult: NonNullable<ProcessedQuote["audit_result"]> }) {
  const hasErrors = auditResult.issues.some((i) => i.severity === "error")
  const hasWarnings = auditResult.issues.some((i) => i.severity === "warning")

  const statusColour = hasErrors
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : hasWarnings
      ? "bg-warning/10 text-warning-foreground border-warning/30"
      : "bg-green-50 text-green-800 border-green-200"

  const statusLabel =
    auditResult.audit_status === "pass"
      ? "Pass"
      : auditResult.audit_status === "needs_review"
        ? "Needs Review"
        : auditResult.audit_status === "fail"
          ? "Fail"
          : "Corrected"

  if (auditResult.audit_status === "pass" && auditResult.issues.length === 0) {
    return null
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quote Audit</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Deterministic post-processing checks. Internal only — does not affect customer preview.
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusColour}`}>
          {statusLabel}
        </span>
      </div>

      <div className="grid gap-2">
        {auditResult.issues.map((issue) => {
          const severityColour =
            issue.severity === "error"
              ? "border-destructive/40 bg-destructive/5"
              : issue.severity === "warning"
                ? "border-warning/40 bg-warning/5"
                : "border-border bg-secondary/30"
          return (
            <div key={issue.id} className={`rounded-xl border p-3 ${severityColour}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-semibold text-muted-foreground">{issue.id}</span>
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {issue.category.replace("_", " ")}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  issue.severity === "error" ? "bg-destructive/20 text-destructive" : issue.severity === "warning" ? "bg-warning/20 text-warning-foreground" : "bg-secondary text-muted-foreground"
                }`}>
                  {issue.severity}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-foreground">{issue.message}</p>
              {issue.evidence && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-semibold">Evidence:</span> {issue.evidence}
                </p>
              )}
              {issue.expected && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-semibold">Expected:</span> {issue.expected}
                </p>
              )}
              {issue.actual && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-semibold">Actual:</span> {issue.actual}
                </p>
              )}
              {issue.suggested_fix && (
                <p className="mt-1 text-xs italic text-muted-foreground">{issue.suggested_fix}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function QuoteOverseerCard({ result }: { result: QuoteOverseerResult }) {
  const statusColour =
    result.status === "blocked"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : result.status === "review"
        ? "bg-warning/10 text-warning-foreground border-warning/30"
        : "bg-green-50 text-green-800 border-green-200"

  const statusLabel = result.status === "blocked" ? "Blocked" : result.status === "review" ? "Review" : "OK"

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quote Overseer</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Deterministic post-generation review of the rendered customer copy. Internal only — does not affect the quote.
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusColour}`}>{statusLabel}</span>
      </div>

      {result.findings.length === 0 ? (
        <p className="text-sm text-green-800">✅ Quote Overseer: no customer-preview issues found.</p>
      ) : (
        <div className="grid gap-2">
          {result.findings.map((finding, index) => {
            const severityColour =
              finding.severity === "error"
                ? "border-destructive/40 bg-destructive/5"
                : finding.severity === "warning"
                  ? "border-warning/40 bg-warning/5"
                  : "border-border bg-secondary/30"
            return (
              <div key={`${finding.id}-${index}`} className={`rounded-xl border p-3 ${severityColour}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-muted-foreground">{finding.id}</span>
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {finding.layer.replace("_", " ")}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      finding.severity === "error"
                        ? "bg-destructive/20 text-destructive"
                        : finding.severity === "warning"
                          ? "bg-warning/20 text-warning-foreground"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {finding.severity}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-foreground">{finding.message}</p>
                {finding.evidence && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-semibold">Evidence:</span> {finding.evidence}
                  </p>
                )}
                {finding.suggestion && <p className="mt-1 text-xs italic text-muted-foreground">{finding.suggestion}</p>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function OptionalPricedWorksCard({ works }: { works: NonNullable<ProcessedQuote["optional_priced_works"]> }) {
  const money = (value: number) =>
    Number.isFinite(value) ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Optional Works (priceable)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional works with their own labour, derived from the quote plan. Internal only — not shown to the customer or exported yet; review and price before sending.
        </p>
      </div>

      <div className="grid gap-2">
        {works.map((work) => {
          const needsRate = (work.warnings ?? []).some((w) => /rate missing/i.test(w))
          return (
            <div key={work.id} className={`rounded-xl border p-3 ${needsRate ? "border-warning/40 bg-warning/5" : "border-border bg-secondary/30"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{work.title}</span>
                <span className="text-sm font-semibold text-foreground">{needsRate ? "Rate missing" : money(work.subtotal)}</span>
              </div>
              {work.lineItems.map((line, index) => (
                <p key={`${work.id}-${index}`} className="mt-1 text-xs text-muted-foreground">
                  {line.itemName}: {line.quantity} {line.unit}
                  {needsRate ? "" : ` × ${money(line.unitPrice)} = ${money(line.total)}`}
                </p>
              ))}
              {(work.warnings ?? []).map((warning, index) => (
                <p key={`${work.id}-w-${index}`} className="mt-1 text-xs italic text-warning-foreground">
                  {warning}
                </p>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PricingFactsCard({ pricing }: { pricing: PricingFact[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Pricing Facts</h3>
          <p className="mt-1 text-xs text-muted-foreground">Internal extraction only. Review before using for pricing or export.</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">Internal</span>
      </div>

      <div className="grid gap-2">
        {pricing.map((fact) => (
          <div key={fact.id} className="rounded-xl border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{pricingFactTitle(fact)}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {fact.type.replaceAll("_", " ")} · {fact.confidence}
                </p>
              </div>
              {fact.cadence && (
                <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {fact.cadence.replaceAll("_", " ")}
                </span>
              )}
            </div>
            {fact.inclusions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inclusions</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-foreground">
                  {fact.inclusions.map((inclusion) => (
                    <li key={inclusion}>{inclusion}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Source: {fact.source_text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function TemplateDiagnosticsCard({
  templates,
  selectedTemplate,
  selectedTemplateSource,
  recommendation,
}: {
  templates: QuoteTemplateLibraryItem[]
  selectedTemplate: QuoteTemplateLibraryItem | null
  selectedTemplateSource: TemplateSelectionSource
  recommendation: TemplateRecommendation | null
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Template Diagnostics</h3>
          <p className="mt-1 text-xs text-muted-foreground">Internal template loading and selection state.</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">Internal</span>
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground">
        <p>
          Loaded templates: <span className="font-semibold text-foreground">{templates.length}</span>
        </p>
        <p>
          Selected:{" "}
          <span className="font-semibold text-foreground">
            {selectedTemplate ? displayTemplateName(selectedTemplate) : "None"}
          </span>{" "}
          ({selectedTemplateSource})
        </p>
        <p>
          Recommendation:{" "}
          <span className="font-semibold text-foreground">
            {recommendation ? `${recommendation.templateName} (${recommendation.confidence} · ${recommendation.score})` : "None"}
          </span>
        </p>
        {templates.length > 0 && (
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">Eligible templates</p>
            <ul className="grid gap-1">
              {templates.map((template) => (
                <li key={template.id}>
                  {displayTemplateName(template)} ·{" "}
                  {[template.category, template.job_type, template.trade, template.status].filter(Boolean).join(" · ") ||
                    "metadata not set"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function pricingFactTitle(fact: PricingFact) {
  if (fact.type === "price_range" && typeof fact.amount_min === "number" && typeof fact.amount_max === "number") {
    return `${money(fact.amount_min)} - ${money(fact.amount_max)}`
  }

  if (typeof fact.amount === "number") return money(fact.amount)
  return fact.label || "Pricing fact"
}

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}


function TemplatePreviewControls({
  templates,
  recommendation,
  selectedTemplateId,
  selectedTemplate,
  selectedTemplateSource,
  templateSectionsAvailable,
  previewMode,
  loadingTemplates,
  loadingSections,
  message,
  onTemplateChange,
  onPreviewModeChange,
  onUseTemplateAsQuote,
}: {
  templates: QuoteTemplateLibraryItem[]
  recommendation: TemplateRecommendation | null
  selectedTemplateId: string
  selectedTemplate: QuoteTemplateLibraryItem | null
  selectedTemplateSource: TemplateSelectionSource
  templateSectionsAvailable: boolean
  previewMode: CustomerPreviewMode
  loadingTemplates: boolean
  loadingSections: boolean
  message: string
  onTemplateChange: (templateId: string) => void
  onPreviewModeChange: (mode: CustomerPreviewMode) => void
  onUseTemplateAsQuote: () => void
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Template</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Standard Preview is the customer quote. Template wording is experimental and not used for export.
          </p>
        </div>
        {(loadingTemplates || loadingSections) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Reviewed template
        <select
          value={selectedTemplateId}
          onChange={(event) => onTemplateChange(event.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
        >
          <option value="">No template selected</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {displayTemplateName(template)}
            </option>
          ))}
        </select>
      </label>

      {selectedTemplate && (
        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Selected Template</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{displayTemplateName(selectedTemplate)}</p>
          <p className="mt-1 text-xs capitalize text-muted-foreground">
            {[selectedTemplate.category, selectedTemplate.trade, selectedTemplate.job_type].filter(Boolean).join(" · ") ||
              "Metadata not set"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Selection source: {selectedTemplateSource}</p>
        </div>
      )}

      {recommendation && (
        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Suggested Template</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {recommendation.templateName || displayTemplateName(recommendation.template)}
              </p>
            </div>
            <span className="rounded-full bg-background px-2 py-1 text-xs font-semibold capitalize text-muted-foreground">
              {recommendation.confidence} · {recommendation.score}
            </span>
          </div>
          <RecommendationEvidence
            title="Why this was suggested"
            items={recommendation.positiveReasons}
          />
          <RecommendationEvidence
            title="Weak signals"
            items={recommendation.weakSignals}
            emptyText="No major weak signals found."
          />
          {recommendation.matchedQuoteFactCategories.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Matched categories: {recommendation.matchedQuoteFactCategories.join(", ")}
            </p>
          )}
          {recommendation.matchedKeywords.length > 0 && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Matched terms: {recommendation.matchedKeywords.join(", ")}
            </p>
          )}
          {selectedTemplateId !== recommendation.template.id && (
            <button
              type="button"
              onClick={() => onTemplateChange(recommendation.template.id)}
              className="mt-3 rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs font-semibold text-primary active:scale-[0.99]"
            >
              Use suggestion
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex rounded-xl bg-secondary/60 p-1">
        {(
          [
            { id: "standard", label: "Standard Preview" },
            { id: "template", label: "Template Wording (experimental)" },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onPreviewModeChange(mode.id)}
            disabled={mode.id === "template" && !templateSectionsAvailable}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              previewMode === mode.id
                ? mode.id === "standard"
                  ? "bg-card text-foreground shadow-sm"
                  : "bg-card text-muted-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {selectedTemplateId && (
        <div className="mt-3 rounded-xl bg-secondary/40 p-3">
          {previewMode === "template" ? (
            <p className="text-xs text-muted-foreground">
              Template wording preview is active. This is not the customer quote — switch to Standard Preview before sending.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Template selected for metadata only. Standard Preview is used for the customer quote.
              </p>
              <button
                type="button"
                onClick={onUseTemplateAsQuote}
                disabled={loadingSections || !templateSectionsAvailable}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Preview template wording (experimental)
              </button>
            </div>
          )}
        </div>
      )}

      {templates.length === 0 && !loadingTemplates && (
        <p className="mt-3 rounded-xl bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          No reviewed templates are available yet.
        </p>
      )}
      {message && <p className="mt-3 rounded-xl bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">{message}</p>}
    </section>
  )
}

function RecommendationEvidence({
  title,
  items,
  emptyText,
}: {
  title: string
  items: string[]
  emptyText?: string
}) {
  if (items.length === 0 && !emptyText) return null

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  )
}

function TemplatePreviewCard({
  sections,
  loading,
  hasSelection,
}: {
  sections: ReturnType<typeof renderTemplatePreviewSections>
  loading: boolean
  hasSelection: boolean
}) {
  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Template Wording Preview</h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Experimental — not used for quote</p>
        </div>
        <span className="rounded-full bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
          Not used for export
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl bg-background p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading template sections...
        </div>
      ) : !hasSelection ? (
        <p className="rounded-xl bg-background p-3 text-sm text-muted-foreground">
          Choose a reviewed template to preview this quote in that structure.
        </p>
      ) : sections.length === 0 ? (
        <p className="rounded-xl bg-background p-3 text-sm text-muted-foreground">
          No customer-facing sections are available for this template.
        </p>
      ) : (
        <div className="grid gap-3">
          {sections.map((section) => (
            <article key={section.id} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">{section.sectionName}</h4>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {section.category.replaceAll("_", " ")}
                </span>
              </div>
              {section.renderedText ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{section.renderedText}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">Missing data for this template section.</p>
              )}
              {section.missingPlaceholders.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Missing quote data for {section.missingPlaceholders.join(", ")}.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

type Mode = "view" | "edit"

function EditableCard({
  section,
  dirty,
  onSave,
}: {
  section: EditableQuoteSection
  dirty: boolean
  onSave: (key: string, content: string) => void
}) {
  const [mode, setMode] = useState<Mode>("view")
  const [draftContent, setDraftContent] = useState(section.content)
  const isWarnings = section.kind === "warnings"

  function startEdit() {
    setDraftContent(section.content)
    setMode("edit")
  }

  function cancelEdit() {
    setDraftContent(section.content)
    setMode("view")
  }

  function saveEdit() {
    onSave(section.key, draftContent)
    setMode("view")
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {isWarnings && <AlertTriangle className="h-4 w-4 text-warning-foreground" />}
          {section.title}
        </h3>
        <div className="flex items-center gap-1.5">
          {dirty && (
            <span className="rounded-full bg-warning/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-foreground">
              Unsaved
            </span>
          )}
          {section.customer_visible !== section.internal_visible && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {section.customer_visible ? "customer" : "internal"}
            </span>
          )}
        </div>
      </div>

      {mode === "edit" ? (
        <textarea
          value={draftContent}
          onChange={(event) => setDraftContent(event.target.value)}
          rows={Math.max(3, draftContent.split("\n").length)}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-accent"
        />
      ) : (
        <SectionBody section={section} />
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        {mode === "view" ? (
          <CardAction icon={<Pencil className="h-3.5 w-3.5" />} label="Edit" onClick={startEdit} />
        ) : (
          <>
            <button
              type="button"
              onClick={saveEdit}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:scale-95"
            >
              <Check className="h-3.5 w-3.5" />
              Save changes
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground active:scale-95"
            >
              Cancel edit
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function CardAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground active:scale-95"
    >
      {icon}
      {label}
    </button>
  )
}

function SectionBody({ section }: { section: EditableQuoteSection }) {
  const lines = section.content
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)

  if (section.kind === "field") {
    return (
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
        {section.content || "Not captured"}
      </p>
    )
  }

  if (section.kind === "warnings") {
    if (lines.length === 0) {
      return <p className="text-sm text-muted-foreground">No confidence warnings.</p>
    }

    return (
      <ul className="flex flex-col gap-2">
        {lines.map((warning, i) => (
          <li key={i} className="rounded-xl bg-warning/25 p-3">
            <div className="flex items-center gap-2">
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
                <AlertTriangle className="h-3 w-3" />!
              </span>
              <p className="text-sm font-medium text-foreground">{warning}</p>
            </div>
            <p className="mt-1 pl-1 text-xs text-warning-foreground">Review before sending.</p>
          </li>
        ))}
      </ul>
    )
  }

  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Not captured</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {lines.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span className="text-sm leading-relaxed text-foreground">{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Site Photos — upload and view site-visit photos against a quote draft.
// Photo data never enters the estimating pipeline.
// ─────────────────────────────────────────────────────────────────────────────

function SitePhotosCard({ draftId }: { draftId: string | null }) {
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!draftId) return

    let active = true
    setLoading(true)

    loadDraftPhotos(draftId).then((result) => {
      if (!active) return
      setPhotos(result)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [draftId])

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0 || !draftId) return

    event.target.value = ""
    setUploading(true)
    setErrorMessage("")

    for (const file of files) {
      const result = await uploadDraftPhoto(draftId, file)
      if (!result.ok) {
        setErrorMessage(result.message)
        break
      }
      if (result.photo) {
        setPhotos((current) => [...current, result.photo!])
      }
    }

    setUploading(false)
  }

  async function handleDelete(photo: DraftPhoto) {
    const result = await deleteDraftPhoto(photo.id, photo.storage_path)
    if (result.ok) {
      setPhotos((current) => current.filter((p) => p.id !== photo.id))
    } else {
      setErrorMessage(result.message)
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              Site Photos
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Attach photos from the site visit. Internal only — not included in customer quotes.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
            Internal
          </span>
        </div>

        {!draftId ? (
          <p className="rounded-xl bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
            Save the draft first to attach site photos.
          </p>
        ) : (
          <>
            {loading && (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading photos...
              </div>
            )}

            {!loading && photos.length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl bg-secondary">
                    {photo.signedUrl ? (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(photo.signedUrl!)}
                        className="h-full w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.signedUrl}
                          alt="Site photo"
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(photo)}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!loading && photos.length === 0 && (
              <p className="mb-3 rounded-xl bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
                No photos attached yet.
              </p>
            )}

            {errorMessage && (
              <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{errorMessage}</p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              onChange={handleFilesSelected}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 py-3 text-sm font-medium text-muted-foreground transition-colors active:bg-secondary disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  Add Photo
                </>
              )}
            </button>
          </>
        )}
      </section>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close photo"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Site photo full size"
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
