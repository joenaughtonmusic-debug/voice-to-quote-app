"use client"

import { CloudUpload, FileText, Sparkles, Lightbulb, Plus } from "lucide-react"
import { uploadFiles, suggestedTemplates } from "@/lib/quote-data"

export function UploadsScreen() {
  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Uploads</h1>
        <p className="text-sm text-muted-foreground">Train your AI on your past quotes &amp; invoices</p>
      </header>

      {/* Drop zone */}
      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-accent/40 px-4 py-9 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card text-primary shadow-sm">
          <CloudUpload className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">Upload past PDF invoices &amp; quotes</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          The AI analyses tone, structure, wording, pricing layout, inclusions and exclusions to suggest reusable
          templates.
        </p>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Browse files
        </button>
      </div>

      {/* Analysed files */}
      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Analysed documents
      </h2>
      <ul className="flex flex-col gap-3">
        {uploadFiles.map((file) => (
          <li key={file.name} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{file.size}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[11px] font-semibold text-success">
                <Sparkles className="h-3 w-3" />
                Complete
              </span>
            </div>

            {file.insights && (
              <div className="border-t border-border bg-secondary/30 px-3 py-3">
                <dl className="grid grid-cols-1 gap-2 text-xs">
                  <Insight term="Tone" desc={file.insights.tone} />
                  <Insight term="Structure" desc={file.insights.structure} />
                  <Insight term="Pricing" desc={file.insights.pricing} />
                </dl>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-medium text-primary">
                  <Lightbulb className="h-3.5 w-3.5 shrink-0" />
                  {file.insights.suggestion}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Suggested templates */}
      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Suggested templates
      </h2>
      <div className="flex flex-col gap-2 pb-4">
        {suggestedTemplates.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <p className="text-sm font-medium text-foreground">{name}</p>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Insight({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold text-muted-foreground">{term}</dt>
      <dd className="text-foreground">{desc}</dd>
    </div>
  )
}
