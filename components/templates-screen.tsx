"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { ChevronDown, Eye, FileText, Loader2, Plus, Save, Trash2, Upload } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { supabase } from "@/lib/supabase"
import {
  TEMPLATE_SECTION_CATEGORIES,
  displayTemplateName,
  displayTemplateStatus,
  extractTemplateSectionCandidates,
  type QuoteTemplateLibraryItem,
  type QuoteTemplateSectionDraft,
  type TemplateSectionCandidate,
  type TemplateSectionCategory,
} from "@/lib/template-import-learning"
import { renderTemplateSandboxSections } from "@/lib/template-preview-sandbox"
import { buildReviewedTemplateUpdatePayload, buildReviewTemplateCreatePayload } from "@/lib/template-review-metadata"
import { cn } from "@/lib/utils"

const TEMPLATE_CATEGORIES = ["maintenance", "landscaping", "decking", "hedge", "planting", "custom"] as const

type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

type QuoteTemplate = {
  id: string
  user_id?: string | null
  name?: string | null
  template_name?: string | null
  trade?: string | null
  job_type?: string | null
  source_type?: string | null
  source_filename?: string | null
  source_text?: string | null
  status?: string | null
  category: TemplateCategory | string | null
  default_scope: unknown
  default_exclusions: unknown
  default_pricing_structure: unknown
  template_content: unknown
  source_uploaded_quote_example_id?: string | null
  created_at: string | null
  updated_at?: string | null
}

type TemplateForm = {
  template_name: string
  category: TemplateCategory | string
  default_scope: string
  default_exclusions: string
  default_pricing_structure: string
  template_content: string
}

export function TemplatesScreen({ embedded = false }: { embedded?: boolean }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [templateSections, setTemplateSections] = useState<Record<string, QuoteTemplateSectionDraft[]>>({})
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [loadingSectionsId, setLoadingSectionsId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [previewSandboxId, setPreviewSandboxId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<TemplateForm | null>(null)
  const [importName, setImportName] = useState("")
  const [importText, setImportText] = useState("")
  const [importFilename, setImportFilename] = useState("")
  const [reviewTemplateId, setReviewTemplateId] = useState<string | null>(null)
  const [reviewSections, setReviewSections] = useState<TemplateSectionCandidate[]>([])
  const [creatingImport, setCreatingImport] = useState(false)
  const [savingSections, setSavingSections] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const loadTemplates = useCallback(async () => {
    if (!user) {
      setTemplates([])
      return
    }

    setLoadingTemplates(true)
    setError("")

    const phase3Select =
      "id, user_id, name, template_name, trade, job_type, source_type, source_filename, source_text, status, category, default_scope, default_exclusions, default_pricing_structure, template_content, source_uploaded_quote_example_id, created_at, updated_at"
    const legacySelect =
      "id, user_id, template_name, category, default_scope, default_exclusions, default_pricing_structure, template_content, source_uploaded_quote_example_id, created_at, updated_at"

    const phase3Result = await supabase
      .from("quote_templates")
      .select(
        phase3Select,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
    let data: unknown[] | null = phase3Result.data
    let error = phase3Result.error

    if (error) {
      const fallback = await supabase
        .from("quote_templates")
        .select(legacySelect)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
      data = fallback.data as unknown[] | null
      error = fallback.error
    }

    setLoadingTemplates(false)

    if (error) {
      setError(`Could not load templates: ${error.message}`)
      return
    }

    setTemplates((data ?? []) as QuoteTemplate[])
  }, [user])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const openTemplate = useMemo(() => templates.find((template) => template.id === openId) ?? null, [openId, templates])

  const loadTemplateSections = useCallback(async (templateId: string) => {
    setLoadingSectionsId(templateId)
    const { data, error } = await supabase
      .from("quote_template_sections")
      .select("id, template_id, display_order, section_name, section_category, raw_text, template_text, placeholders, customer_facing, exportable, export_category, created_at, updated_at")
      .eq("template_id", templateId)
      .order("display_order", { ascending: true })

    setLoadingSectionsId(null)

    if (error) {
      setError(`Could not load template sections: ${error.message}. Run the Template Import Learning Phase 2 SQL first.`)
      return
    }

    setTemplateSections((current) => ({
      ...current,
      [templateId]: (data ?? []) as QuoteTemplateSectionDraft[],
    }))
  }, [])

  function handleToggleTemplate(template: QuoteTemplate, isOpen: boolean) {
    setOpenId(isOpen ? null : template.id)
    if (isOpen) setPreviewSandboxId(null)
    if (!isOpen) {
      cancelEdit()
      void loadTemplateSections(template.id)
    }
  }

  function startEdit(template: QuoteTemplate) {
    setEditingId(template.id)
    setForm({
      template_name: template.template_name ?? "",
      category: template.category ?? "custom",
      default_scope: toEditableText(template.default_scope),
      default_exclusions: toEditableText(template.default_exclusions),
      default_pricing_structure: toEditableText(template.default_pricing_structure),
      template_content: JSON.stringify(template.template_content ?? {}, null, 2),
    })
    setMessage("")
    setError("")
  }

  function cancelEdit() {
    setEditingId(null)
    setPreviewSandboxId(null)
    setForm(null)
  }

  async function saveTemplate(template: QuoteTemplate) {
    if (!user || !form) return

    let parsedTemplateContent: unknown
    try {
      parsedTemplateContent = JSON.parse(form.template_content || "{}")
    } catch {
      setError("Template content must be valid JSON.")
      return
    }

    setSavingId(template.id)
    setMessage("")
    setError("")

    const { error } = await supabase
      .from("quote_templates")
      .update({
        template_name: form.template_name.trim() || "Untitled template",
        category: form.category || "custom",
        default_scope: linesToArray(form.default_scope),
        default_exclusions: linesToArray(form.default_exclusions),
        default_pricing_structure: linesToArray(form.default_pricing_structure),
        template_content: parsedTemplateContent,
      })
      .eq("id", template.id)
      .eq("user_id", user.id)

    setSavingId(null)

    if (error) {
      setError(`Could not save template: ${error.message}`)
      return
    }

    setMessage("Template saved.")
    setEditingId(null)
    setForm(null)
    await loadTemplates()
  }

  async function deleteTemplate(template: QuoteTemplate) {
    if (!user) return
    if (!window.confirm("Delete this template?")) return

    setDeletingId(template.id)
    setMessage("")
    setError("")

    const { error } = await supabase
      .from("quote_templates")
      .delete()
      .eq("id", template.id)
      .eq("user_id", user.id)

    setDeletingId(null)

    if (error) {
      setError(`Could not delete template: ${error.message}`)
      return
    }

    setMessage("Template deleted.")
    setOpenId(null)
    setEditingId(null)
    setForm(null)
    await loadTemplates()
  }

  async function handlePlainTextFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return

    if (file.type && file.type !== "text/plain" && !file.name.toLowerCase().endsWith(".txt")) {
      setError("Upload a plain text .txt template for this Phase 3 review flow.")
      return
    }

    const text = await file.text()
    setImportFilename(file.name)
    setImportName((current) => current || file.name.replace(/\.[^.]+$/, ""))
    setImportText(text)
    setMessage("Plain text template loaded. Review the text, then extract sections.")
    setError("")
  }

  async function createTemplateForReview() {
    if (!user) return

    const sourceText = importText.trim()
    if (!sourceText) {
      setError("Paste template text or upload a plain text file first.")
      return
    }

    const candidates = extractTemplateSectionCandidates(sourceText)
    if (candidates.length === 0) {
      setError("No reviewable sections found in this template text.")
      return
    }

    const templatePayload = buildReviewTemplateCreatePayload({
      userId: user.id,
      importName,
      importFilename,
      sourceText,
      sectionCount: candidates.length,
      existingTemplates: templates,
    })
    setCreatingImport(true)
    setMessage("")
    setError("")

    const { data, error } = await supabase
      .from("quote_templates")
      .insert(templatePayload)
      .select("id")
      .single()

    setCreatingImport(false)

    if (error || !data?.id) {
      setError(`Could not create template record: ${error?.message ?? "No template id returned."}`)
      return
    }

    setReviewTemplateId(data.id)
    setReviewSections(candidates)
    setOpenId(data.id)
    setTemplateSections((current) => ({ ...current, [data.id]: [] }))
    setMessage("Template created. Review and save the extracted sections.")
    await loadTemplates()
  }

  async function saveReviewedSections() {
    if (!user || !reviewTemplateId || reviewSections.length === 0) return

    setSavingSections(true)
    setMessage("")
    setError("")

    const { error: deleteError } = await supabase
      .from("quote_template_sections")
      .delete()
      .eq("template_id", reviewTemplateId)

    if (deleteError) {
      setSavingSections(false)
      setError(`Could not replace existing template sections: ${deleteError.message}`)
      return
    }

    const rows = reviewSections.map((section) => ({
      template_id: reviewTemplateId,
      display_order: section.display_order,
      section_name: section.section_name,
      section_category: section.section_category,
      raw_text: section.raw_text,
      template_text: section.template_text,
      placeholders: section.placeholders,
      customer_facing: section.customer_facing,
      exportable: section.exportable,
      export_category: section.export_category || null,
    }))

    const { error: insertError } = await supabase.from("quote_template_sections").insert(rows)

    if (insertError) {
      setSavingSections(false)
      setError(`Could not save reviewed sections: ${insertError.message}`)
      return
    }

    const reviewedTemplate = templates.find((template) => template.id === reviewTemplateId) ?? null
    const updatePayload = buildReviewedTemplateUpdatePayload({
      template: reviewedTemplate,
      sectionCount: reviewSections.length,
      reviewedAt: new Date().toISOString(),
    })

    const { error: updateError } = await supabase
      .from("quote_templates")
      .update(updatePayload)
      .eq("id", reviewTemplateId)
      .eq("user_id", user.id)

    setSavingSections(false)

    if (updateError) {
      setError(`Sections saved, but template status could not be updated: ${updateError.message}`)
      await loadTemplateSections(reviewTemplateId)
      return
    }

    setMessage("Reviewed template sections saved.")
    setReviewSections([])
    setReviewTemplateId(null)
    setImportText("")
    setImportName("")
    setImportFilename("")
    if (fileInputRef.current) fileInputRef.current.value = ""
    await loadTemplateSections(reviewTemplateId)
    await loadTemplates()
  }

  if (authLoading) {
    return (
      <div className={embedded ? "flex flex-col" : "flex min-h-full flex-col px-5 pt-6"}>
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Checking sign-in...
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className={embedded ? "flex flex-col" : "flex min-h-full flex-col px-5 pt-6"}>
        <div className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Sign in to use templates</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Your quote templates are linked to your Supabase user account.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
          >
            Continue with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={embedded ? "flex flex-col" : "flex min-h-full flex-col px-5 pt-6"}>
      {!embedded && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Templates</h1>
            <p className="text-sm text-muted-foreground">Reusable quote wording, exclusions &amp; pricing rules</p>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm opacity-60"
            aria-label="Add template"
            title="Create templates from completed upload analysis"
          >
            <Plus className="h-5 w-5" />
          </button>
        </header>
      )}

      <TemplateImportReviewPanel
        fileInputRef={fileInputRef}
        templates={templates}
        importName={importName}
        importText={importText}
        importFilename={importFilename}
        reviewSections={reviewSections}
        creatingImport={creatingImport}
        savingSections={savingSections}
        onImportNameChange={setImportName}
        onImportTextChange={setImportText}
        onUploadClick={() => fileInputRef.current?.click()}
        onFileSelected={(files) => void handlePlainTextFile(files)}
        onExtract={() => void createTemplateForReview()}
        onSaveSections={() => void saveReviewedSections()}
        onSectionChange={(sectionId, nextSection) =>
          setReviewSections((current) => current.map((section) => (section.id === sectionId ? nextSection : section)))
        }
      />

      {(message || error) && (
        <div
          className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
            error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {error || message}
        </div>
      )}

      {loadingTemplates ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          No saved template records yet. Template import review is coming next.
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          {templates.map((template) => {
            const isOpen = openTemplate?.id === template.id
            const isEditing = editingId === template.id && form

            return (
              <div key={template.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <button
                  type="button"
                  onClick={() => handleToggleTemplate(template, isOpen)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors",
                    isOpen && "bg-accent",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{displayTemplateName(template)}</p>
                    <p className="text-sm font-medium capitalize text-primary">{template.category ?? "custom"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(template.created_at)}</p>
                  </div>
                  <ChevronDown
                    className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 py-4">
                    {isEditing ? (
                      <TemplateEditor
                        form={form}
                        onChange={setForm}
                        onCancel={cancelEdit}
                        onSave={() => void saveTemplate(template)}
                        saving={savingId === template.id}
                      />
                    ) : (
                      <TemplateDetail
                        template={template}
                        sections={templateSections[template.id] ?? []}
                        loadingSections={loadingSectionsId === template.id}
                        onEdit={() => startEdit(template)}
                        onDelete={() => void deleteTemplate(template)}
                        onPreview={() => setPreviewSandboxId((current) => (current === template.id ? null : template.id))}
                        showPreview={previewSandboxId === template.id}
                        deleting={deletingId === template.id}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TemplateImportReviewPanel({
  fileInputRef,
  templates,
  onUploadClick,
  onFileSelected,
  importName,
  importText,
  importFilename,
  reviewSections,
  creatingImport,
  savingSections,
  onImportNameChange,
  onImportTextChange,
  onExtract,
  onSaveSections,
  onSectionChange,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>
  templates: QuoteTemplateLibraryItem[]
  onUploadClick: () => void
  onFileSelected: (files: FileList | null) => void
  importName: string
  importText: string
  importFilename: string
  reviewSections: TemplateSectionCandidate[]
  creatingImport: boolean
  savingSections: boolean
  onImportNameChange: (value: string) => void
  onImportTextChange: (value: string) => void
  onExtract: () => void
  onSaveSections: () => void
  onSectionChange: (sectionId: string, nextSection: TemplateSectionCandidate) => void
}) {
  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Template Library</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Import quote templates and past quotes for reviewed section mapping. Imported templates are not connected to live quote rendering yet.
          </p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <FileText className="h-5 w-5" />
        </span>
      </div>

      <button
        type="button"
        onClick={onUploadClick}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
      >
        <Upload className="h-4 w-4" />
        Upload Template
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(event) => onFileSelected(event.target.files)}
      />

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm font-medium text-foreground">
          Template name
          <input
            value={importName}
            onChange={(event) => onImportNameChange(event.target.value)}
            placeholder="Imported quote template"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary"
          />
        </label>

        {importFilename && (
          <p className="rounded-xl bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            Loaded plain text file: {importFilename}
          </p>
        )}

        <TemplateTextarea
          label="Paste template text"
          value={importText}
          onChange={onImportTextChange}
          rows={8}
        />

        <button
          type="button"
          onClick={onExtract}
          disabled={creatingImport}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {creatingImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Extract Sections For Review
        </button>
      </div>

      {reviewSections.length > 0 && (
        <div className="mt-5 grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Review extracted sections</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              These mappings are proposals only. Saving them will not affect live quote rendering.
            </p>
          </div>

          {reviewSections.map((section) => (
            <TemplateSectionReviewCard
              key={section.id}
              section={section}
              onChange={(nextSection) => onSectionChange(section.id, nextSection)}
            />
          ))}

          <button
            type="button"
            onClick={onSaveSections}
            disabled={savingSections}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {savingSections ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Reviewed Sections
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="mt-3 rounded-xl bg-background px-3 py-3 text-sm text-muted-foreground">
          No templates in the library yet.
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {templates.slice(0, 3).map((template) => (
            <li key={`library-${template.id}`} className="rounded-xl bg-background px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{displayTemplateName(template)}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {[template.trade, template.job_type].filter(Boolean).join(" · ") || "Trade not set"}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold capitalize text-muted-foreground">
                  {displayTemplateStatus(template.status)}
                </span>
              </div>
            </li>
          ))}
          {templates.length > 3 && (
            <li className="px-3 text-xs text-muted-foreground">{templates.length - 3} more templates in the saved list below.</li>
          )}
        </ul>
      )}
    </section>
  )
}

function TemplateSectionReviewCard({
  section,
  onChange,
}: {
  section: TemplateSectionCandidate
  onChange: (section: TemplateSectionCandidate) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Section name
          <input
            value={section.section_name}
            onChange={(event) => onChange({ ...section, section_name: event.target.value })}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
          />
        </label>

        <TemplateTextarea
          label="Raw text"
          value={section.raw_text}
          onChange={(value) => onChange({ ...section, raw_text: value, template_text: value })}
          rows={4}
        />

        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proposed category
          <select
            value={section.section_category}
            onChange={(event) => {
              const category = event.target.value as TemplateSectionCategory
              const exportable = category === "labour" || category === "plants" || category === "materials" || category === "waste" || category === "optional_works"
              onChange({
                ...section,
                section_category: category,
                exportable,
                export_category: exportable ? category : "",
              })
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
          >
            {TEMPLATE_SECTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <ToggleField
            label="Customer-facing"
            checked={section.customer_facing}
            onChange={(checked) => onChange({ ...section, customer_facing: checked })}
          />
          <ToggleField
            label="Exportable"
            checked={section.exportable}
            onChange={(checked) => onChange({ ...section, exportable: checked, export_category: checked ? section.export_category || section.section_category : "" })}
          />
        </div>

        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Export category
          <select
            value={section.export_category}
            onChange={(event) => onChange({ ...section, export_category: event.target.value as TemplateSectionCategory | "" })}
            disabled={!section.exportable}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Not exported</option>
            {TEMPLATE_SECTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      {label}
    </label>
  )
}

function TemplateDetail({
  template,
  sections,
  loadingSections,
  onEdit,
  onDelete,
  onPreview,
  showPreview,
  deleting,
}: {
  template: QuoteTemplate
  sections: QuoteTemplateSectionDraft[]
  loadingSections: boolean
  onEdit: () => void
  onDelete: () => void
  onPreview: () => void
  showPreview: boolean
  deleting: boolean
}) {
  const isReviewed = displayTemplateStatus(template.status) === "reviewed" || displayTemplateStatus(template.status) === "active"

  return (
    <div className="grid gap-4">
      <DetailSection title="Default scope" value={template.default_scope} />
      <DetailSection title="Default exclusions" value={template.default_exclusions} />
      <DetailSection title="Pricing rules" value={template.default_pricing_structure} />
      <DetailSection title="Template content" value={template.template_content} json />
      <SavedTemplateSections sections={sections} loading={loadingSections} />
      {showPreview && <TemplateSandboxPreview sections={sections} loading={loadingSections} />}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onPreview}
          disabled={!isReviewed || loadingSections || sections.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-sm font-semibold text-foreground active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingSections ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Preview with sample quote
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border border-border bg-background py-2.5 text-sm font-semibold text-foreground active:scale-[0.99]"
        >
          Edit template
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-2.5 text-sm font-semibold text-destructive active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete
        </button>
      </div>
    </div>
  )
}

function TemplateSandboxPreview({
  sections,
  loading,
}: {
  sections: QuoteTemplateSectionDraft[]
  loading: boolean
}) {
  const renderedSections = renderTemplateSandboxSections(sections)

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Template preview</h2>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary">Sandbox preview only</p>
        </div>
        <span className="rounded-full bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
          Sample quote data
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl bg-background p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading sections...
        </div>
      ) : renderedSections.length === 0 ? (
        <p className="rounded-xl bg-background p-3 text-xs text-muted-foreground">
          No reviewed sections are available for sandbox preview.
        </p>
      ) : (
        <div className="grid gap-3">
          {renderedSections.map((section) => (
            <article key={section.id} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">{section.sectionName}</h3>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {section.category.replaceAll("_", " ")}
                </span>
              </div>
              {section.renderedText ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{section.renderedText}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">Missing data for this sample preview.</p>
              )}
              {section.missingPlaceholders.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Missing sample data for {section.missingPlaceholders.join(", ")}.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function SavedTemplateSections({
  sections,
  loading,
}: {
  sections: QuoteTemplateSectionDraft[]
  loading: boolean
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewed sections</h2>
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading sections...
        </div>
      ) : sections.length === 0 ? (
        <p className="rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
          No reviewed sections saved for this template yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {sections.map((section) => (
            <li key={section.id} className="rounded-xl bg-secondary/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{section.section_name || "Untitled section"}</p>
                <span className="rounded-full bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {(section.section_category || "custom").replaceAll("_", " ")}
                </span>
              </div>
              {section.raw_text && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{section.raw_text}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {section.customer_facing ? "Customer-facing" : "Internal"} · {section.exportable ? `Export category: ${section.export_category || "unset"}` : "Not exportable"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DetailSection({ title, value, json = false }: { title: string; value: unknown; json?: boolean }) {
  const items = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {items ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={`${title}-${item}`} className="text-sm text-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary/40 p-3 text-xs text-foreground">
          {json ? JSON.stringify(value ?? {}, null, 2) : toEditableText(value)}
        </pre>
      )}
    </section>
  )
}

function TemplateEditor({
  form,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  form: TemplateForm
  onChange: (form: TemplateForm) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm font-medium text-foreground">
        Template name
        <input
          value={form.template_name}
          onChange={(event) => onChange({ ...form, template_name: event.target.value })}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium text-foreground">
        Category
        <select
          value={form.category}
          onChange={(event) => onChange({ ...form, category: event.target.value })}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary"
        >
          {TEMPLATE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <TemplateTextarea label="Scope" value={form.default_scope} onChange={(value) => onChange({ ...form, default_scope: value })} />
      <TemplateTextarea
        label="Exclusions"
        value={form.default_exclusions}
        onChange={(value) => onChange({ ...form, default_exclusions: value })}
      />
      <TemplateTextarea
        label="Pricing rules"
        value={form.default_pricing_structure}
        onChange={(value) => onChange({ ...form, default_pricing_structure: value })}
      />
      <TemplateTextarea
        label="Template content JSON"
        value={form.template_content}
        onChange={(value) => onChange({ ...form, template_content: value })}
        rows={10}
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border bg-background py-2.5 text-sm font-semibold text-foreground active:scale-[0.99]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>
    </div>
  )
}

function TemplateTextarea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-foreground">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary"
      />
    </label>
  )
}

function toEditableText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("\n")
  }

  if (typeof value === "string") return value
  if (value == null) return ""
  return JSON.stringify(value, null, 2)
}

function linesToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatDate(value: string | null) {
  if (!value) return "Created date unavailable"
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}
