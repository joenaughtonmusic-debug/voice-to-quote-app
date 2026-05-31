"use client"

import { useState } from "react"
import { ArrowLeft, Check, Send, Save, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { quoteDraft } from "@/lib/quote-data"
import { saveGeneratedQuoteDraft } from "@/lib/save-quote-draft"
import { processedQuoteToEditableSections, type ProcessedQuote } from "@/lib/processed-quote"

type SaveState = "idle" | "saving" | "success" | "error"

export function QuoteDraft({
  onBack,
  onSaved,
  rawTranscript,
  processedQuote,
}: {
  onBack: () => void
  onSaved: () => void
  rawTranscript: string
  processedQuote: ProcessedQuote
}) {
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveMessage, setSaveMessage] = useState("")

  async function handleSaveDraft() {
    setSaveState("saving")
    setSaveMessage("")

    const result = await saveGeneratedQuoteDraft(
      rawTranscript,
      processedQuote,
      processedQuoteToEditableSections(processedQuote),
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
            <p className="mt-1 text-sm font-medium text-foreground">{quoteDraft.client.name}</p>
            <p className="text-sm text-muted-foreground">{quoteDraft.client.address}</p>
          </div>

          <p className="text-pretty text-sm leading-relaxed text-foreground">{quoteDraft.intro}</p>

          {/* Line items */}
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quotation</p>
            <div className="divide-y divide-border rounded-xl border border-border">
              {quoteDraft.lineItems.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm text-foreground">{item.label}</span>
                  <span className="shrink-0 text-sm font-medium text-foreground">{item.amount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="mt-3 space-y-1.5 rounded-xl bg-secondary p-3 text-sm">
            <Row label="Subtotal" value={quoteDraft.subtotal} />
            <Row label={`GST (15%)`} value={quoteDraft.gst} />
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
              <span>Total (incl. GST)</span>
              <span>{quoteDraft.total}</span>
            </div>
          </div>

          {/* Inclusions / exclusions */}
          <div className="mt-5 grid grid-cols-1 gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Includes</p>
              <ul className="flex flex-col gap-1.5">
                {quoteDraft.inclusions.map((inc) => (
                  <li key={inc} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {inc}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Excludes</p>
              <ul className="flex flex-col gap-1.5">
                {quoteDraft.exclusions.map((exc) => (
                  <li key={exc} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {exc}
                  </li>
                ))}
              </ul>
            </div>
          </div>

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
