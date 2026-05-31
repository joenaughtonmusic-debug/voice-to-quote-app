"use client"

import { useState } from "react"
import {
  X,
  AlertTriangle,
  Save,
  Send,
  Pencil,
  Mic,
  Check,
  FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { reviewSections, type ReviewSection } from "@/lib/quote-data"

type View = "customer" | "internal"

export function QuoteReview({
  onClose,
  onPreviewDraft,
}: {
  onClose: () => void
  onPreviewDraft: () => void
}) {
  const [view, setView] = useState<View>("internal")

  const visible = reviewSections.filter((s) => {
    if (!s.scope || s.scope === "both") return true
    return s.scope === view
  })

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Review Generated Quote</h2>
          <p className="text-xs text-muted-foreground">Structured AI output · Quote #1042</p>
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
          {visible.map((section) => (
            <EditableCard key={section.id} section={section} />
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
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-foreground active:scale-[0.99]"
          >
            <Save className="h-4 w-4" />
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
  )
}

type Mode = "view" | "text" | "voice"

function EditableCard({ section }: { section: ReviewSection }) {
  const [mode, setMode] = useState<Mode>("view")
  const isWarnings = section.kind === "warnings"

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {isWarnings && <AlertTriangle className="h-4 w-4 text-warning-foreground" />}
          {section.title}
        </h3>
        {section.scope && section.scope !== "both" && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {section.scope}
          </span>
        )}
      </div>

      {/* Content */}
      {section.kind === "field" && (
        <FieldBody value={section.value ?? ""} editing={mode === "text"} />
      )}
      {section.kind === "list" && (
        <ListBody items={section.items ?? []} editing={mode === "text"} />
      )}
      {isWarnings && <WarningsBody warnings={section.warnings ?? []} />}

      {/* Voice editing indicator */}
      {mode === "voice" && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5">
          <span className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-primary animate-wave"
                style={{ height: 14, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </span>
          <span className="text-sm font-medium text-primary">Listening… speak your correction</span>
        </div>
      )}

      {/* Per-card actions */}
      {!isWarnings && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          {mode === "view" && (
            <>
              <CardAction icon={<Pencil className="h-3.5 w-3.5" />} label="Edit text" onClick={() => setMode("text")} />
              <CardAction icon={<Mic className="h-3.5 w-3.5" />} label="Edit by voice" onClick={() => setMode("voice")} />
            </>
          )}
          {mode !== "view" && (
            <button
              type="button"
              onClick={() => setMode("view")}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:scale-95"
            >
              <Check className="h-3.5 w-3.5" />
              Save changes
            </button>
          )}
        </div>
      )}
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

function FieldBody({ value, editing }: { value: string; editing: boolean }) {
  if (editing) {
    return (
      <textarea
        defaultValue={value}
        rows={Math.max(2, value.split("\n").length)}
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-accent"
      />
    )
  }
  return <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{value}</p>
}

function ListBody({ items, editing }: { items: string[]; editing: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          {editing ? (
            <textarea
              defaultValue={item}
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-accent"
            />
          ) : (
            <span className="text-sm leading-relaxed text-foreground">{item}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function WarningsBody({ warnings }: { warnings: { label: string; detail: string }[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {warnings.map((w, i) => (
        <li key={i} className="rounded-xl bg-warning/25 p-3">
          <div className="flex items-center gap-2">
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
              <AlertTriangle className="h-3 w-3" />!
            </span>
            <p className="text-sm font-medium text-foreground">{w.label}</p>
          </div>
          <p className="mt-1 pl-1 text-xs text-warning-foreground">{w.detail}</p>
        </li>
      ))}
    </ul>
  )
}
