"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle,
  CloudUpload,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  XCircle,
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { supabase } from "@/lib/supabase"

const QUOTE_EXAMPLES_BUCKET = "quote-examples"
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]
const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx"]

type UploadStatus = "uploaded" | "analysing" | "completed" | "failed"
type KnowledgeDocumentType =
  | "quote_template"
  | "materials_price_list"
  | "plant_list"
  | "supplier_catalogue"
  | "terms_conditions"
  | "common_exclusions"
  | "historical_quote_example"

const DOCUMENT_TYPES: { value: KnowledgeDocumentType; label: string }[] = [
  { value: "quote_template", label: "Quote Template" },
  { value: "materials_price_list", label: "Materials / Price List" },
  { value: "plant_list", label: "Plant List" },
  { value: "supplier_catalogue", label: "Supplier Catalogue" },
  { value: "terms_conditions", label: "Terms & Conditions" },
  { value: "common_exclusions", label: "Common Exclusions" },
  { value: "historical_quote_example", label: "Historical Quote Example" },
]

type UploadedQuoteExample = {
  id: string
  file_name: string
  storage_path: string | null
  document_type?: KnowledgeDocumentType | string | null
  analysis_summary?: Record<string, unknown> | null
  tone_analysis?: string | null
  extracted_exclusions?: unknown
  suggested_rules?: Record<string, unknown> | null
  ai_analysis_status: UploadStatus | string | null
  created_at: string | null
  updated_at?: string | null
}

export function UploadsScreen({
  embedded = false,
  onTemplateCreated,
}: {
  embedded?: boolean
  onTemplateCreated?: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [examples, setExamples] = useState<UploadedQuoteExample[]>([])
  const [loadingExamples, setLoadingExamples] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [openingFileId, setOpeningFileId] = useState<string | null>(null)
  const [analysingFileId, setAnalysingFileId] = useState<string | null>(null)
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null)
  const [viewingAnalysisId, setViewingAnalysisId] = useState<string | null>(null)
  const [selectedDocumentType, setSelectedDocumentType] = useState<KnowledgeDocumentType>("quote_template")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const loadExamples = useCallback(async () => {
    if (!user) {
      setExamples([])
      return
    }

    setLoadingExamples(true)
    setError("")

    const { data, error } = await supabase
      .from("uploaded_quote_examples")
      .select(
        "id, file_name, storage_path, document_type, analysis_summary, tone_analysis, extracted_exclusions, suggested_rules, ai_analysis_status, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    setLoadingExamples(false)

    if (error) {
      setError(`Could not load uploaded examples: ${error.message}`)
      return
    }

    setExamples((data ?? []) as UploadedQuoteExample[])
  }, [user])

  useEffect(() => {
    void loadExamples()
  }, [loadExamples])

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return

    setMessage("")
    setError("")

    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !currentUser) {
      setError(userError?.message ?? "Sign in before uploading knowledge items.")
      return
    }

    const selectedFiles = Array.from(files)
    const invalidFile = selectedFiles.find((file) => !isAcceptedFile(file))

    if (invalidFile) {
      setError(`${invalidFile.name} is not supported. Upload PDF, DOC, or DOCX files only.`)
      return
    }

    setUploading(true)

    for (const file of selectedFiles) {
      const storagePath = `${currentUser.id}/${Date.now()}-${sanitizeFileName(file.name)}`

      const { error: uploadError } = await supabase.storage
        .from(QUOTE_EXAMPLES_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        })

      if (uploadError) {
        setUploading(false)
        setError(`Could not upload ${file.name}: ${uploadError.message}`)
        return
      }

      const { error: insertError } = await supabase.from("uploaded_quote_examples").insert({
        user_id: currentUser.id,
        file_name: file.name,
        storage_path: storagePath,
        document_type: selectedDocumentType,
        ai_analysis_status: "uploaded",
      })

      if (insertError) {
        setUploading(false)
        setError(`Uploaded ${file.name}, but could not save its database row: ${insertError.message}`)
        return
      }
    }

    setUploading(false)
    setMessage("Knowledge item uploaded successfully.")
    if (inputRef.current) inputRef.current.value = ""
    await loadExamples()
  }

  async function handleOpenFile(file: UploadedQuoteExample) {
    setMessage("")
    setError("")

    if (!file.storage_path) {
      setError("This uploaded example does not have a storage path.")
      return
    }

    setOpeningFileId(file.id)

    const { data, error } = await supabase.storage
      .from(QUOTE_EXAMPLES_BUCKET)
      .createSignedUrl(file.storage_path, 60)

    setOpeningFileId(null)

    if (error || !data?.signedUrl) {
      setError(`Could not open ${file.file_name}: ${error?.message ?? "Signed URL was not created."}`)
      return
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function handleAnalyse(file: UploadedQuoteExample) {
    setMessage("")
    setError("")
    setAnalysingFileId(file.id)
    setExamples((currentExamples) =>
      currentExamples.map((example) =>
        example.id === file.id ? { ...example, ai_analysis_status: "analysing" } : example,
      ),
    )

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setAnalysingFileId(null)
      setError(sessionError?.message ?? "Sign in before analysing knowledge uploads.")
      await loadExamples()
      return
    }

    const response = await fetch("/api/analyse-uploaded-quote", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uploaded_quote_example_id: file.id,
      }),
    })

    const result = await response.json().catch(() => null)
    setAnalysingFileId(null)

    if (!response.ok) {
      const stage = typeof result?.failed_stage === "string" ? ` [${result.failed_stage}]` : ""
      const message =
        typeof result?.error_message === "string"
          ? result.error_message
          : typeof result?.error === "string"
            ? result.error
            : "Could not analyse knowledge upload."

      setError(`${message}${stage}`)
      await loadExamples()
      return
    }

    setMessage("Knowledge item analysed successfully.")
    if (result?.template_created) onTemplateCreated?.()
    await loadExamples()
  }

  async function handleCreateTemplate(file: UploadedQuoteExample) {
    setMessage("")
    setError("")

    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !currentUser) {
      setError(userError?.message ?? "Sign in before creating templates.")
      return
    }

    if (!canCreateTemplate(file)) {
      setError("Templates can only be created from Quote Template or Historical Quote Example uploads.")
      return
    }

    const summary = file.analysis_summary ?? {}
    const documentType = getNormalizedDocumentType(file.document_type)
    const templateName = getTemplateName(summary)
    const category = inferTemplateCategory(summary, templateName)

    setCreatingTemplateId(file.id)

    const { data: existingTemplate } = await supabase
      .from("quote_templates")
      .select("id")
      .eq("source_uploaded_quote_example_id", file.id)
      .eq("user_id", currentUser.id)
      .maybeSingle()

    if (existingTemplate?.id) {
      setCreatingTemplateId(null)
      setMessage("Template already exists for this knowledge item.")
      return
    }

    const templatePayload =
      documentType === "quote_template"
        ? {
            user_id: currentUser.id,
            template_name: templateName,
            category,
            default_scope: [
              ...(getStringArray(summary.standard_scope) ?? []),
              ...(getStringArray(summary.standard_inclusions) ?? []),
              ...(getStringArray(summary.customer_wording) ?? []),
            ],
            default_exclusions: getStringArray(summary.standard_exclusions) ?? [],
            default_pricing_structure: [
              ...(getStringArray(summary.pricing_rules) ?? []),
              ...(getStringArray(summary.estimate_wording) ?? []),
              ...(getStringArray(summary.materials_or_line_items) ?? []),
            ],
            template_content: summary,
            source_uploaded_quote_example_id: file.id,
          }
        : {
            user_id: currentUser.id,
            template_name: templateName,
            category,
            default_scope: getStringArray(summary.reusable_customer_wording) ?? [],
            default_exclusions: getStringArray(summary.exclusions_and_conditions) ?? getStringArray(file.extracted_exclusions) ?? [],
            default_pricing_structure: [
              ...(getStringArray(summary.pricing_rules_detected) ?? []),
              ...(getStringArray(summary.common_line_items) ?? []),
            ],
            template_content: summary,
            source_uploaded_quote_example_id: file.id,
          }

    const { error } = await supabase.from("quote_templates").insert(templatePayload)

    setCreatingTemplateId(null)

    if (error) {
      setError(`Could not create template: ${error.message}`)
      return
    }

    setMessage("Template saved.")
    onTemplateCreated?.()
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
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary">
            <CloudUpload className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Sign in to upload knowledge</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Knowledge Base uploads are stored against your Supabase user account.
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
        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Uploads</h1>
          <p className="text-sm text-muted-foreground">Knowledge Base uploads</p>
        </header>
      )}

      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-accent/40 px-4 py-9 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card text-primary shadow-sm">
          <CloudUpload className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">Upload Knowledge Item</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Choose the source type before uploading so analysis extracts the right business knowledge.
        </p>
        <label className="mx-auto mt-4 grid max-w-xs gap-1 text-left text-xs font-semibold text-muted-foreground">
          Document type
          <select
            value={selectedDocumentType}
            onChange={(event) => setSelectedDocumentType(event.target.value as KnowledgeDocumentType)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary"
          >
            {DOCUMENT_TYPES.map((documentType) => (
              <option key={documentType.value} value={documentType.value}>
                {documentType.label}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          className="hidden"
          onChange={(event) => void handleUpload(event.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {uploading ? "Uploading..." : "Browse files"}
        </button>
      </div>

      {(message || error) && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            error
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <p>{error || message}</p>
        </div>
      )}

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {embedded ? "Knowledge Base Uploads" : "Knowledge Base Uploads"}
      </h2>

      {loadingExamples ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading knowledge uploads...
        </div>
      ) : examples.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          No knowledge items uploaded yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-3 pb-4">
          {examples.map((file) => (
            <li key={file.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-3 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{file.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {getDocumentTypeLabel(file.document_type)} · {formatDate(file.created_at)}
                  </p>
                </div>
                <StatusBadge status={file.ai_analysis_status} />
                {getNormalizedStatus(file.ai_analysis_status) === "uploaded" && (
                  <button
                    type="button"
                    onClick={() => void handleAnalyse(file)}
                    disabled={analysingFileId === file.id}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-2 text-xs font-semibold text-primary-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {analysingFileId === file.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Analyse
                  </button>
                )}
                {getNormalizedStatus(file.ai_analysis_status) === "completed" && (
                  <button
                    type="button"
                    onClick={() => setViewingAnalysisId((currentId) => (currentId === file.id ? null : file.id))}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-2 text-xs font-semibold text-primary"
                  >
                    {getNormalizedDocumentType(file.document_type) === "quote_template" ? "Preview" : "View Analysis"}
                  </button>
                )}
                {getNormalizedStatus(file.ai_analysis_status) === "completed" && canCreateTemplate(file) && (
                  <button
                    type="button"
                    onClick={() => void handleCreateTemplate(file)}
                    disabled={creatingTemplateId === file.id}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-2 text-xs font-semibold text-primary-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {creatingTemplateId === file.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {getNormalizedDocumentType(file.document_type) === "quote_template" ? "Save Template" : "Create Template"}
                  </button>
                )}
                {getNormalizedStatus(file.ai_analysis_status) === "failed" && (
                  <button
                    type="button"
                    onClick={() => void handleAnalyse(file)}
                    disabled={analysingFileId === file.id}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-2 text-xs font-semibold text-primary-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {analysingFileId === file.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Retry Analysis
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleOpenFile(file)}
                  disabled={!file.storage_path || openingFileId === file.id}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Open ${file.file_name}`}
                  title="Open file"
                >
                  {openingFileId === file.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                </button>
              </div>
              {file.storage_path && (
                <div className="border-t border-border bg-secondary/30 px-3 py-2">
                  <p className="truncate text-xs text-muted-foreground">{file.storage_path}</p>
                </div>
              )}
              {getNormalizedStatus(file.ai_analysis_status) === "completed" && viewingAnalysisId === file.id && (
                <AnalysisSummary file={file} />
              )}
              {getNormalizedStatus(file.ai_analysis_status) === "failed" && <FailureSummary file={file} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function isAcceptedFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return ACCEPTED_FILE_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function sanitizeFileName(fileName: string) {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-")
}

function formatDate(value: string | null) {
  if (!value) return "Uploaded date unavailable"
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function getNormalizedStatus(status: UploadedQuoteExample["ai_analysis_status"]): UploadStatus {
  if (status === "completed" || status === "failed" || status === "analysing" || status === "uploaded") {
    return status
  }

  if (status === "processing") return "uploaded"

  return "uploaded"
}

function getNormalizedDocumentType(documentType: UploadedQuoteExample["document_type"]): KnowledgeDocumentType {
  if (
    documentType === "quote_template" ||
    documentType === "materials_price_list" ||
    documentType === "plant_list" ||
    documentType === "supplier_catalogue" ||
    documentType === "terms_conditions" ||
    documentType === "common_exclusions" ||
    documentType === "historical_quote_example"
  ) {
    return documentType
  }

  return "historical_quote_example"
}

function getDocumentTypeLabel(documentType: UploadedQuoteExample["document_type"]) {
  const normalizedType = getNormalizedDocumentType(documentType)
  return DOCUMENT_TYPES.find((type) => type.value === normalizedType)?.label ?? "Historical Quote Example"
}

function canCreateTemplate(file: UploadedQuoteExample) {
  const documentType = getNormalizedDocumentType(file.document_type)
  return documentType === "quote_template" || documentType === "historical_quote_example"
}

function StatusBadge({ status }: { status: UploadedQuoteExample["ai_analysis_status"] }) {
  const normalizedStatus = getNormalizedStatus(status)

  if (normalizedStatus === "completed") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[11px] font-semibold text-success">
        <Sparkles className="h-3 w-3" />
        Completed
      </span>
    )
  }

  if (normalizedStatus === "failed") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    )
  }

  if (normalizedStatus === "analysing") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Analysing
      </span>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">
      <FileText className="h-3 w-3" />
      Uploaded
    </span>
  )
}

function AnalysisSummary({ file }: { file: UploadedQuoteExample }) {
  const summary = file.analysis_summary ?? {}
  const documentType = getNormalizedDocumentType(file.document_type ?? getString(summary.document_type))

  if (documentType === "quote_template") {
    return <TemplatePreview summary={summary} />
  }

  const reusableWording =
    getStringArray(summary.reusable_customer_wording) || getStringArray(summary.suggested_reusable_template_wording)
  const pricingRules =
    getStringArray(summary.pricing_rules_detected) || getStringArray(file.suggested_rules?.pricing_rules_detected)
  const exclusions =
    getStringArray(summary.exclusions_and_conditions) ||
    getStringArray(summary.repeated_exclusions) ||
    getStringArray(file.extracted_exclusions)
  const commonLineItems = getStringArray(summary.common_line_items)
  const vocabulary = getStringArray(summary.trade_vocabulary_terms)
  const templateSuggestions =
    getStringArray(summary.quote_template_suggestions) || getStringArray(file.suggested_rules?.quote_template_suggestions)
  const promptRules = getStringArray(summary.ai_prompt_rules) || getStringArray(file.suggested_rules?.ai_prompt_rules)
  const materials = getObjectList(summary.materials_price_items)
  const plants = getObjectList(summary.plant_items)
  const terms = getStringArray(summary.terms_conditions)
  const commonExclusions = getStringArray(summary.common_exclusion_clauses)

  return (
    <div className="border-t border-border bg-secondary/30 px-3 py-3 text-xs">
      <div className="grid gap-4">
        {(documentType === "materials_price_list" || documentType === "supplier_catalogue") && (
          <AnalysisBulletSection title="Materials / price items" items={materials} />
        )}
        {documentType === "plant_list" && <AnalysisBulletSection title="Plant list items" items={plants} />}
        {documentType === "terms_conditions" && <AnalysisBulletSection title="Terms & conditions found" items={terms} />}
        {documentType === "common_exclusions" && (
          <AnalysisBulletSection title="Common exclusion clauses" items={commonExclusions} />
        )}
        <AnalysisBulletSection title="Reusable wording found" items={reusableWording} />
        <AnalysisBulletSection title="Pricing rules detected" items={pricingRules} />
        <AnalysisBulletSection title="Default exclusions/conditions" items={exclusions} />
        <AnalysisBulletSection title="Common line items" items={commonLineItems} />
        <AnalysisBulletSection title="Trade vocabulary" items={vocabulary} />
        <AnalysisBulletSection title="Suggested quote templates" items={templateSuggestions} />
        <AnalysisBulletSection title="Rules to apply to future AI quote drafts" items={promptRules} />
      </div>
    </div>
  )
}

function TemplatePreview({ summary }: { summary: Record<string, unknown> }) {
  const variables = summary.variables && typeof summary.variables === "object" ? summary.variables as Record<string, unknown> : {}
  const optionalVariables = getStringArray(variables.optional_variables) ?? []
  const detectedVariables = [
    getString(variables.client_name),
    getString(variables.site_address),
    getString(variables.quote_date),
    getString(variables.expiry_date),
    getString(variables.frequency),
    getString(variables.price_or_estimate_range),
    ...optionalVariables,
  ].filter((item): item is string => Boolean(item))

  return (
    <div className="border-t border-border bg-secondary/30 px-3 py-3 text-xs">
      <div className="grid gap-4">
        <AnalysisRow label="Name" value={getString(summary.template_name) ?? "Untitled template"} />
        <AnalysisRow label="Category" value={getString(summary.category) ?? "custom"} />
        <AnalysisBulletSection title="Standard scope" items={getStringArray(summary.standard_scope)} />
        <AnalysisBulletSection title="Standard inclusions" items={getStringArray(summary.standard_inclusions)} />
        <AnalysisBulletSection title="Standard exclusions" items={getStringArray(summary.standard_exclusions)} />
        <AnalysisBulletSection title="Pricing rules" items={getStringArray(summary.pricing_rules)} />
        <AnalysisBulletSection title="Estimate wording" items={getStringArray(summary.estimate_wording)} />
        <AnalysisBulletSection title="Site-specific notes" items={getStringArray(summary.site_specific_notes)} />
        <AnalysisBulletSection title="Variables detected" items={detectedVariables.length ? detectedVariables : null} />
        <AnalysisBulletSection title="Trade vocabulary" items={getStringArray(summary.trade_vocabulary)} />
      </div>
    </div>
  )
}

function AnalysisBulletSection({ title, items }: { title: string; items: string[] | null }) {
  return (
    <section>
      <h3 className="font-semibold text-foreground">{title}</h3>
      {items?.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
          {items.map((item) => (
            <li key={`${title}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted-foreground">No specific items found.</p>
      )}
    </section>
  )
}

function FailureSummary({ file }: { file: UploadedQuoteExample }) {
  const summary = file.analysis_summary ?? {}
  const failedStage = getString(summary.failed_stage) ?? "Unknown stage"
  const errorMessage = getString(summary.error_message) ?? "No failure message saved."
  const debugTextPreview = getString(summary.debug_text_preview)
  const extractedTextLength = getNumber(summary.extracted_text_length)
  const cleanedTextPreview = getString(summary.cleaned_text_preview)

  return (
    <div className="border-t border-border bg-destructive/5 px-3 py-3 text-xs">
      <dl className="grid gap-2">
        <AnalysisRow label="Stage" value={failedStage} />
        <AnalysisRow label="Error" value={errorMessage} />
        {typeof extractedTextLength === "number" && <AnalysisRow label="Length" value={`${extractedTextLength} chars`} />}
        {cleanedTextPreview && <AnalysisRow label="Cleaned" value={cleanedTextPreview} />}
        {debugTextPreview && <AnalysisRow label="Preview" value={debugTextPreview} />}
      </dl>
    </div>
  )
}

function AnalysisRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  )
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return null

  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  return strings.length > 0 ? strings : null
}

function getObjectList(value: unknown) {
  if (!Array.isArray(value)) return null

  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") return null

      return Object.entries(item)
        .filter(([, entryValue]) => typeof entryValue === "string" && entryValue.trim().length > 0)
        .map(([key, entryValue]) => `${key.replaceAll("_", " ")}: ${entryValue}`)
        .join(" · ")
    })
    .filter((item): item is string => Boolean(item))

  return items.length > 0 ? items : null
}

function getTemplateName(summary: Record<string, unknown>) {
  const strictName = getString(summary.template_name)
  if (strictName) return strictName

  const suggestedNames = getStringArray(summary.quote_template_suggestions)
  if (suggestedNames?.[0]) return suggestedNames[0]

  const lineItems = getStringArray(summary.common_line_items)
  if (lineItems?.[0]) return `${lineItems[0]} Template`

  return "Custom Quote Template"
}

function inferTemplateCategory(summary: Record<string, unknown>, templateName: string) {
  const strictCategory = getString(summary.category)
  if (strictCategory) return strictCategory

  const haystack = [
    templateName,
    ...(getStringArray(summary.trade_vocabulary) ?? []),
    ...(getStringArray(summary.materials_or_line_items) ?? []),
    ...(getStringArray(summary.trade_vocabulary_terms) ?? []),
    ...(getStringArray(summary.common_line_items) ?? []),
    ...(getStringArray(summary.quote_template_suggestions) ?? []),
  ]
    .join(" ")
    .toLowerCase()

  if (haystack.includes("deck") || haystack.includes("timber") || haystack.includes("pergola")) return "decking"
  if (haystack.includes("hedge") || haystack.includes("trim") || haystack.includes("pruning")) return "hedge"
  if (haystack.includes("plant") || haystack.includes("mulch") || haystack.includes("soil")) return "planting"
  if (haystack.includes("landscap") || haystack.includes("paver") || haystack.includes("aggregate")) return "landscaping"
  if (haystack.includes("maintenance") || haystack.includes("tidy") || haystack.includes("greenwaste")) return "maintenance"

  return "custom"
}
