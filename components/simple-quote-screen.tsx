"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, Copy, Loader2, Mic, Pause, Play, Plus, Send, Square, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { bearerAuthHeader } from "@/lib/auth-headers"
import {
  DEFAULT_LABOUR_RATE,
  formatNzd,
  formatNzd2,
  pricingSourceLabel,
  resolveSimplePricing,
} from "@/lib/simple/pricing"
import { renderCustomerBody, renderInternalNotes, renderPriceLines, simpleQuoteTitle } from "@/lib/simple/templates"
import { buildSimpleXeroPayload } from "@/lib/simple/xero"
import type {
  GreenwasteTreatment,
  SimpleExtraction,
  SimpleFrequency,
  SimpleJobType,
  SimpleQuote,
} from "@/lib/simple/types"

type Step = "input" | "confirm" | "preview"
type RecordingState = "idle" | "recording" | "paused" | "transcribing"

const FREQUENCY_OPTIONS: { value: SimpleFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "6-weekly", label: "6-weekly" },
  { value: "2-monthly", label: "2-monthly" },
  { value: "3-monthly", label: "3-monthly" },
  { value: "4-monthly", label: "4-monthly" },
  { value: "other", label: "Other" },
]

const GREENWASTE_OPTIONS: { value: GreenwasteTreatment; label: string }[] = [
  { value: "included", label: "Included in price" },
  { value: "separate_line", label: "Separate line" },
  { value: "not_mentioned", label: "Not mentioned" },
]

function getSupportedMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
  return types.find((type) => MediaRecorder.isTypeSupported(type))
}

function extractionToQuote(
  extraction: SimpleExtraction,
  jobType: SimpleJobType,
  rawTranscript: string,
): SimpleQuote {
  return {
    jobType,
    clientName: extraction.client_name ?? "",
    siteAddress: extraction.site_address ?? "",
    frequency: extraction.frequency ?? "monthly",
    frequencyOther: extraction.frequency === "other" ? (extraction.frequency_note ?? "") : "",
    frequencyNote: extraction.frequency === "other" ? "" : (extraction.frequency_note ?? ""),
    tasks: extraction.tasks,
    statedTotalHours: extraction.stated_total_hours,
    spokenRate: extraction.spoken_rate,
    spokenTotal: extraction.spoken_total,
    manualTotal: null,
    greenwaste: extraction.greenwaste,
    extras: extraction.extras,
    internalNotes: extraction.internal_notes,
    rawTranscript,
  }
}

function parseNumberInput(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ""))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function SimpleQuoteScreen() {
  const [step, setStep] = useState<Step>("input")
  const [jobType, setJobType] = useState<SimpleJobType>("maintenance")
  const [notes, setNotes] = useState("")
  const [recordingState, setRecordingState] = useState<RecordingState>("idle")
  const [seconds, setSeconds] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState("")
  const [quote, setQuote] = useState<SimpleQuote | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  useEffect(() => {
    if (recordingState !== "recording") return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recordingState])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Audio recording is not supported in this browser.")
      return
    }
    try {
      setError("")
      setSeconds(0)
      chunksRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        chunksRef.current = []
        stopStream()
        mediaRecorderRef.current = null
        await transcribe(blob)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingState("recording")
    } catch {
      stopStream()
      setRecordingState("idle")
      setError("Could not access the microphone. Check browser permissions.")
    }
  }

  function togglePause() {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    if (recorder.state === "recording") {
      recorder.pause()
      setRecordingState("paused")
    } else if (recorder.state === "paused") {
      recorder.resume()
      setRecordingState("recording")
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === "inactive") return
    setRecordingState("transcribing")
    recorder.stop()
  }

  async function transcribe(blob: Blob) {
    try {
      const formData = new FormData()
      formData.append("audio", blob, "recording.webm")
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: await bearerAuthHeader(),
        body: formData,
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || typeof result?.transcript !== "string") {
        throw new Error(typeof result?.error === "string" ? result.error : "Transcription failed.")
      }
      setNotes((current) => (current.trim() ? `${current.trim()}\n${result.transcript.trim()}` : result.transcript.trim()))
    } catch (transcribeError) {
      setError(transcribeError instanceof Error ? transcribeError.message : "Transcription failed.")
    } finally {
      setRecordingState("idle")
      setSeconds(0)
    }
  }

  async function extract() {
    const transcript = notes.trim()
    if (!transcript) return
    setExtracting(true)
    setError("")
    try {
      const response = await fetch("/api/simple-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await bearerAuthHeader()) },
        body: JSON.stringify({ transcript, job_type: jobType }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.extraction) {
        throw new Error(typeof result?.error === "string" ? result.error : "Extraction failed.")
      }
      setQuote(extractionToQuote(result.extraction as SimpleExtraction, jobType, transcript))
      setExportResult(null)
      setStep("confirm")
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Extraction failed.")
    } finally {
      setExtracting(false)
    }
  }

  async function exportToXero() {
    if (!quote) return
    setExporting(true)
    setExportResult(null)
    try {
      const payload = buildSimpleXeroPayload(quote)
      const response = await fetch("/api/export-xero-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await bearerAuthHeader()) },
        body: JSON.stringify({ payload }),
      })
      const result = await response.json().catch(() => null)
      if (result?.ok) {
        setExportResult({ ok: true, message: result.idempotent_replay ? "Already exported (no duplicate created)." : "Sent to Xero as a draft quote." })
      } else {
        setExportResult({ ok: false, message: typeof result?.message === "string" ? result.message : "Xero export failed." })
      }
    } catch (exportError) {
      setExportResult({ ok: false, message: exportError instanceof Error ? exportError.message : "Xero export failed." })
    } finally {
      setExporting(false)
    }
  }

  async function copyQuoteText() {
    if (!quote) return
    const pricing = resolveSimplePricing(quote)
    const text = [renderCustomerBody(quote), renderPriceLines(quote, pricing)].filter(Boolean).join("\n\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function startOver() {
    setStep("input")
    setNotes("")
    setQuote(null)
    setError("")
    setExportResult(null)
  }

  function updateQuote(update: Partial<SimpleQuote>) {
    setQuote((current) => (current ? { ...current, ...update } : current))
  }

  const pricing = quote ? resolveSimplePricing(quote) : null

  return (
    <div className="px-5 pb-8 pt-4">
      {step === "input" && (
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label="Job type"
            className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-muted/50 p-1"
          >
            {(
              [
                { value: "maintenance", label: "Maintenance" },
                { value: "tidy", label: "One-off tidy" },
              ] as { value: SimpleJobType; label: string }[]
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={jobType === value}
                onClick={() => setJobType(value)}
                className={cn(
                  "rounded-xl py-2.5 text-sm font-semibold transition-colors",
                  jobType === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={
              jobType === "maintenance"
                ? "e.g. Dan 54 Marua Road. Monthly maintenance. Trim hedges, weed beds… $300 per visit with greenwaste"
                : "e.g. Dan 54 Marua Road. Tidy up: trim Tecoma 1.5 hours, weed spray rock wall 0.5. Total 3.5 hours, maybe $300 with greenwaste"
            }
            rows={8}
            className="w-full rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          <div className="flex items-center gap-2">
            {recordingState === "idle" && (
              <button
                type="button"
                onClick={() => void startRecording()}
                className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground active:scale-[0.99]"
              >
                <Mic className="h-4 w-4 text-primary" /> Record
              </button>
            )}
            {(recordingState === "recording" || recordingState === "paused") && (
              <>
                <button
                  type="button"
                  onClick={togglePause}
                  className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold"
                >
                  {recordingState === "recording" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {recordingState === "recording" ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
                >
                  <Square className="h-4 w-4" /> Stop
                </button>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                </span>
              </>
            )}
            {recordingState === "transcribing" && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Transcribing…
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!notes.trim() || extracting || recordingState !== "idle"}
            onClick={() => void extract()}
            className="w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 active:scale-[0.99]"
          >
            {extracting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Extracting…
              </span>
            ) : (
              "Extract quote details"
            )}
          </button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {step === "confirm" && quote && pricing && (
        <ConfirmForm
          quote={quote}
          pricing={pricing}
          onChange={updateQuote}
          onBack={() => setStep("input")}
          onNext={() => setStep("preview")}
        />
      )}

      {step === "preview" && quote && pricing && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-base font-semibold text-foreground">{simpleQuoteTitle(quote)}</h2>
            {quote.clientName && <p className="mt-1 text-sm text-muted-foreground">{quote.clientName}</p>}
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {/* The header above already shows the title; copy-text and Xero keep the full body. */}
              {renderCustomerBody(quote).replace(`${simpleQuoteTitle(quote)}\n\n`, "")}
            </pre>
            <div className="mt-4 border-t border-border pt-3">
              <pre className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-foreground">
                {renderPriceLines(quote, pricing)}
              </pre>
            </div>
          </div>

          {pricing.rateWasDefaulted && (
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Priced at the default ${DEFAULT_LABOUR_RATE}/hr — no price or rate was spoken. Check before sending.
              </span>
            </div>
          )}

          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal — not sent to the customer</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
              {renderInternalNotes(quote, pricing)}
            </pre>
          </div>

          {exportResult && (
            <div
              className={cn(
                "rounded-2xl border p-3 text-sm",
                exportResult.ok
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {exportResult.message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copyQuoteText()}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-semibold"
            >
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy text"}
            </button>
            <button
              type="button"
              disabled={exporting || pricing.total == null}
              onClick={() => void exportToXero()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Export to Xero
            </button>
          </div>
          {pricing.total == null && (
            <p className="text-center text-sm text-destructive">Unpriced — go back and add a price or hours before exporting.</p>
          )}

          <div className="flex justify-between text-sm">
            <button type="button" onClick={() => setStep("confirm")} className="font-semibold text-primary">
              ← Edit details
            </button>
            <button type="button" onClick={startOver} className="text-muted-foreground">
              Start a new quote
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"

function ConfirmForm({
  quote,
  pricing,
  onChange,
  onBack,
  onNext,
}: {
  quote: SimpleQuote
  pricing: ReturnType<typeof resolveSimplePricing>
  onChange: (update: Partial<SimpleQuote>) => void
  onBack: () => void
  onNext: () => void
}) {
  const priceValue =
    quote.manualTotal ?? quote.spokenTotal ?? (pricing.labourAmount != null ? pricing.labourAmount : null)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Check every field — nothing is trusted until you confirm it here.
      </p>

      <div className="grid grid-cols-1 gap-3">
        <Field label="Client name">
          <input
            value={quote.clientName}
            onChange={(event) => onChange({ clientName: event.target.value })}
            placeholder="Client name"
            className={cn(inputClass, !quote.clientName.trim() && "border-destructive/60")}
          />
        </Field>
        <Field label="Site address">
          <input
            value={quote.siteAddress}
            onChange={(event) => onChange({ siteAddress: event.target.value })}
            placeholder="Site address"
            className={cn(inputClass, !quote.siteAddress.trim() && "border-destructive/60")}
          />
        </Field>
      </div>

      {quote.jobType === "maintenance" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequency">
            <select
              value={quote.frequency}
              onChange={(event) => onChange({ frequency: event.target.value as SimpleFrequency })}
              className={inputClass}
            >
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {quote.frequency === "other" ? (
            <Field label="Custom frequency">
              <input
                value={quote.frequencyOther}
                onChange={(event) => onChange({ frequencyOther: event.target.value })}
                placeholder="e.g. 6-monthly"
                className={inputClass}
              />
            </Field>
          ) : (
            <Field label="Frequency note">
              <input
                value={quote.frequencyNote}
                onChange={(event) => onChange({ frequencyNote: event.target.value })}
                placeholder="e.g. lawns mowed between visits"
                className={inputClass}
              />
            </Field>
          )}
        </div>
      )}

      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {quote.jobType === "maintenance" ? "Main focus tasks (customer-visible)" : "Scope of work (customer-visible)"}
        </span>
        <div className="space-y-2">
          {quote.tasks.map((task, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={task.description}
                onChange={(event) => {
                  const tasks = quote.tasks.slice()
                  tasks[index] = { ...tasks[index], description: event.target.value }
                  onChange({ tasks })
                }}
                className={cn(inputClass, "flex-1")}
              />
              <input
                value={task.hours ?? ""}
                onChange={(event) => {
                  const tasks = quote.tasks.slice()
                  tasks[index] = { ...tasks[index], hours: parseNumberInput(event.target.value) }
                  onChange({ tasks })
                }}
                placeholder="hrs"
                inputMode="decimal"
                className={cn(inputClass, "w-16 text-center")}
              />
              <button
                type="button"
                aria-label="Remove task"
                onClick={() => onChange({ tasks: quote.tasks.filter((_, i) => i !== index) })}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ tasks: [...quote.tasks, { description: "", hours: null }] })}
            className="flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <Plus className="h-4 w-4" /> Add task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Total hours">
          <input
            value={quote.statedTotalHours ?? ""}
            onChange={(event) => onChange({ statedTotalHours: parseNumberInput(event.target.value) })}
            placeholder="e.g. 3.5"
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Rate $/hr">
          <input
            value={quote.spokenRate ?? ""}
            onChange={(event) => onChange({ spokenRate: parseNumberInput(event.target.value) })}
            placeholder={String(DEFAULT_LABOUR_RATE)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label={quote.jobType === "maintenance" ? "Price / visit $" : "Total price $"}>
          <input
            value={priceValue ?? ""}
            onChange={(event) => onChange({ manualTotal: parseNumberInput(event.target.value) })}
            placeholder="e.g. 300"
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
      </div>

      <div
        className={cn(
          "rounded-xl border p-3 text-sm",
          pricing.rateWasDefaulted
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : pricing.pricingSource === "unpriced"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        Price source: {pricingSourceLabel(pricing)}
        {pricing.labourAmount != null && (
          <span className="font-semibold text-foreground"> — {formatNzd(pricing.labourAmount)}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Greenwaste">
          <select
            value={quote.greenwaste.treatment}
            onChange={(event) =>
              onChange({ greenwaste: { ...quote.greenwaste, treatment: event.target.value as GreenwasteTreatment } })
            }
            className={inputClass}
          >
            {GREENWASTE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        {quote.greenwaste.treatment === "separate_line" && (
          <Field label="Greenwaste $">
            <input
              value={quote.greenwaste.amount ?? ""}
              onChange={(event) =>
                onChange({ greenwaste: { ...quote.greenwaste, amount: parseNumberInput(event.target.value) } })
              }
              placeholder="e.g. 40"
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
        )}
      </div>

      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Extras (own line each)
        </span>
        <div className="space-y-2">
          {quote.extras.map((extra, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={extra.name}
                onChange={(event) => {
                  const extras = quote.extras.slice()
                  extras[index] = { ...extras[index], name: event.target.value }
                  onChange({ extras })
                }}
                placeholder="e.g. Petrol for mower"
                className={cn(inputClass, "flex-1")}
              />
              <input
                value={extra.amount ?? ""}
                onChange={(event) => {
                  const extras = quote.extras.slice()
                  extras[index] = { ...extras[index], amount: parseNumberInput(event.target.value) }
                  onChange({ extras })
                }}
                placeholder="$"
                inputMode="decimal"
                className={cn(inputClass, "w-20 text-center")}
              />
              <button
                type="button"
                aria-label="Remove extra"
                onClick={() => onChange({ extras: quote.extras.filter((_, i) => i !== index) })}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ extras: [...quote.extras, { name: "", amount: null }] })}
            className="flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <Plus className="h-4 w-4" /> Add extra
          </button>
        </div>
      </div>

      {quote.internalNotes.length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Internal notes (never shown to the customer)
          </p>
          <ul className="mt-1 list-disc pl-4 text-sm text-muted-foreground">
            {quote.internalNotes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {pricing.total != null && pricing.gst != null && (
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Includes GST (15%)</span>
            <span>{formatNzd2(pricing.gst)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold text-foreground">
            <span>Total (NZD){quote.jobType === "maintenance" ? " per visit" : ""}</span>
            <span>{formatNzd2(pricing.total)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded-2xl border border-border bg-card py-3 text-sm font-semibold"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
        >
          Preview quote
        </button>
      </div>
    </div>
  )
}
