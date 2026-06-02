"use client"

import { useState } from "react"
import {
  X,
  AlertTriangle,
  Save,
  Send,
  Pencil,
  Check,
  FileText,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  editableSectionsToProcessedQuote,
  processedQuoteToEditableSections,
  type EditableQuoteSection,
  type ProcessedQuote,
} from "@/lib/processed-quote"
import { saveGeneratedQuoteDraft } from "@/lib/save-quote-draft"

type View = "customer" | "internal"
type SaveState = "idle" | "saving" | "success" | "error"

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
  onPreviewDraft: () => void
  onSaved: () => void
  rawTranscript: string
  originalTranscript: string
  processedQuote: ProcessedQuote
  onQuoteEdited: (processedQuote: ProcessedQuote) => void
  onSectionsEdited: (sections: EditableQuoteSection[]) => void
  draftId?: string | null
  initialSections?: EditableQuoteSection[] | null
}) {
  const [view, setView] = useState<View>("internal")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveMessage, setSaveMessage] = useState("")
  const [sections, setSections] = useState<EditableQuoteSection[]>(() =>
    initialSections ?? processedQuoteToEditableSections(processedQuote),
  )
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())

  const visible = sections.filter((section) => {
    if (view === "customer") return section.customer_visible
    return section.internal_visible
  })
  const hasUnsavedChanges = dirtyKeys.size > 0

  async function handleSaveDraft() {
    setSaveState("saving")
    setSaveMessage("")

    const editedQuote = editableSectionsToProcessedQuote(sections, processedQuote)
    const result = await saveGeneratedQuoteDraft(originalTranscript, editedQuote, sections, draftId)

    setSaveState(result.ok ? "success" : "error")
    setSaveMessage(result.message)

    if (result.ok) {
      setDirtyKeys(new Set())
      onSaved()
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

          {visible.map((section) => (
            <EditableCard
              key={section.key}
              section={section}
              dirty={dirtyKeys.has(section.key)}
              onSave={handleSaveSection}
            />
          ))}

          <button
            type="button"
            onClick={onPreviewDraft}
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
              onClick={onClose}
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.99]"
            >
              <Send className="h-4 w-4" />
              Push to Job Management
            </button>
          </div>
        </div>
      </div>
    </div>
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
