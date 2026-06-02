"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, Loader2, Plus, Save } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const TEMPLATE_CATEGORIES = ["maintenance", "landscaping", "decking", "hedge", "planting", "custom"] as const

type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

type QuoteTemplate = {
  id: string
  user_id?: string | null
  template_name: string
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
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [form, setForm] = useState<TemplateForm | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const loadTemplates = useCallback(async () => {
    if (!user) {
      setTemplates([])
      return
    }

    setLoadingTemplates(true)
    setError("")

    const { data, error } = await supabase
      .from("quote_templates")
      .select(
        "id, user_id, template_name, category, default_scope, default_exclusions, default_pricing_structure, template_content, source_uploaded_quote_example_id, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

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
          No templates yet. Create one from a completed Knowledge Base upload.
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
                  onClick={() => {
                    setOpenId(isOpen ? null : template.id)
                    if (!isOpen) cancelEdit()
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors",
                    isOpen && "bg-accent",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{template.template_name}</p>
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
                      <TemplateDetail template={template} onEdit={() => startEdit(template)} />
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

function TemplateDetail({ template, onEdit }: { template: QuoteTemplate; onEdit: () => void }) {
  return (
    <div className="grid gap-4">
      <DetailSection title="Default scope" value={template.default_scope} />
      <DetailSection title="Default exclusions" value={template.default_exclusions} />
      <DetailSection title="Pricing rules" value={template.default_pricing_structure} />
      <DetailSection title="Template content" value={template.template_content} json />
      <button
        type="button"
        onClick={onEdit}
        className="w-full rounded-xl border border-border bg-background py-2.5 text-sm font-semibold text-foreground active:scale-[0.99]"
      >
        Edit template
      </button>
    </div>
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
