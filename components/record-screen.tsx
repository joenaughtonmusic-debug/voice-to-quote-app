"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Pause, Square, Trash2, Play, Sparkles, Radio, Waypoints, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProcessedQuote } from "@/lib/processed-quote"
import { supabase } from "@/lib/supabase"

type RecState = "idle" | "recording" | "paused" | "stopped" | "processing"

export const EMPTY_TRANSCRIPT = ""
const AUDIO_CAPTURED_MESSAGE = "Audio captured. Press Process Quote to transcribe."

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

const aiStages = [
  "Transcribing...",
  "Correcting trade terms",
  "Loading quote templates",
  "Extracting client & site",
  "Identifying job scope",
  "Pricing line items",
  "Flagging low-confidence values",
]

function getSupportedMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
  return types.find((type) => MediaRecorder.isTypeSupported(type))
}

function getRecordingErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Microphone permission was blocked. Allow microphone access in your browser and try again."
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect a microphone and try again."
    }
  }

  return "Could not start microphone recording. Check your browser permissions and try again."
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getAudioFileName(blob: Blob) {
  if (blob.type.includes("mp4")) return "recording.mp4"
  if (blob.type.includes("ogg")) return "recording.ogg"
  return "recording.webm"
}

type QuoteTemplateContext = {
  id: string
  template_name: string
  category: string
  default_scope: string[]
  default_exclusions: string[]
  default_pricing_structure: string[]
  reusable_wording: string[]
  ai_prompt_rules: string[]
}

type KnowledgeItemContext = {
  item_code: string
  item_name: string
  item_type: string
  aliases: string[]
  unit: string
  sell_price: number | null
}

function toStringArray(value: unknown, limit = 8) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, limit)
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit)
  }

  return []
}

function getTemplateContentArray(templateContent: unknown, key: string) {
  if (!templateContent || typeof templateContent !== "object") return []
  return toStringArray((templateContent as Record<string, unknown>)[key])
}

async function loadQuoteTemplateContext() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error(userError?.message ?? "Sign in before processing quote templates.")
  }

  const { data, error } = await supabase
    .from("quote_templates")
    .select("id, template_name, category, default_scope, default_exclusions, default_pricing_structure, template_content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12)

  if (error) {
    throw new Error(`Could not load quote templates: ${error.message}`)
  }

  return (data ?? []).map((template): QuoteTemplateContext => ({
    id: String(template.id ?? ""),
    template_name: String(template.template_name ?? "Untitled template"),
    category: String(template.category ?? "custom"),
    default_scope: toStringArray(template.default_scope),
    default_exclusions: toStringArray(template.default_exclusions),
    default_pricing_structure: toStringArray(template.default_pricing_structure),
    reusable_wording: getTemplateContentArray(template.template_content, "reusable_customer_wording"),
    ai_prompt_rules: getTemplateContentArray(template.template_content, "ai_prompt_rules"),
  }))
}

async function loadKnowledgeItemContext(transcript: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error(userError?.message ?? "Sign in before matching Knowledge Base items.")
  }

  const { data, error } = await supabase
    .from("knowledge_items")
    .select("item_code, item_name, item_type, aliases, unit, sell_price")
    .eq("user_id", user.id)
    .limit(300)

  if (error) {
    throw new Error(`Could not load Knowledge Base items: ${error.message}`)
  }

  const transcriptText = transcript.toLowerCase()
  return (data ?? [])
    .map((item): KnowledgeItemContext => {
      const sellPrice = item.sell_price === null || item.sell_price === undefined ? null : Number(item.sell_price)

      return {
        item_code: String(item.item_code ?? ""),
        item_name: String(item.item_name ?? ""),
        item_type: String(item.item_type ?? "other"),
        aliases: toStringArray(item.aliases, 12),
        unit: String(item.unit ?? ""),
        sell_price: sellPrice !== null && Number.isFinite(sellPrice) ? sellPrice : null,
      }
    })
    .map((item) => {
      const terms = [item.item_code, item.item_name, ...item.aliases].map((term) => term.toLowerCase()).filter(Boolean)
      const matchScore = terms.reduce((score, term) => score + (transcriptText.includes(term) ? Math.max(2, term.split(/\s+/).length) : 0), 0)
      const commonTypeScore = ["labour", "waste", "equipment", "vehicle", "chemical"].includes(item.item_type) ? 1 : 0
      return { item, score: matchScore + commonTypeScore }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 80)
    .map(({ item }) => item)
}

export function RecordScreen({
  onProcess,
}: {
  onProcess: (rawTranscript: string, correctedTranscript: string, processedQuote: ProcessedQuote) => void
}) {
  const [state, setState] = useState<RecState>("idle")
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState("")
  const [stage, setStage] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [addedNotes, setAddedNotes] = useState("")
  const [visibilityWarning, setVisibilityWarning] = useState("")
  const transcriptRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const discardRef = useRef(false)
  const leftAppWhileRecordingRef = useRef(false)

  useEffect(() => {
    if (state !== "recording") return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [state])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  useEffect(() => {
    return () => {
      stopStream()
    }
  }, [])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && (state === "recording" || state === "paused")) {
        leftAppWhileRecordingRef.current = true
        return
      }

      if (document.visibilityState === "visible" && leftAppWhileRecordingRef.current) {
        leftAppWhileRecordingRef.current = false
        setVisibilityWarning("Recording may pause when leaving the app. Add any missing details in Notes.")
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [state])

  const isLive = state === "recording" || state === "paused"
  const canProcess = state === "stopped" && Boolean(audioBlob)

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function reset() {
    mediaRecorderRef.current = null
    chunksRef.current = []
    discardRef.current = false
    stopStream()
    setState("idle")
    setSeconds(0)
    setTranscript("")
    setStage(0)
    setAudioBlob(null)
    setErrorMessage("")
    setAddedNotes("")
    setVisibilityWarning("")
    leftAppWhileRecordingRef.current = false
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorMessage("Audio recording is not supported in this browser.")
      return
    }

    if (state === "stopped") {
      reset()
    }

    try {
      setErrorMessage("")
      setAudioBlob(null)
      setTranscript("")
      setStage(0)
      setSeconds(0)
      setVisibilityWarning("")
      chunksRef.current = []
      discardRef.current = false

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setErrorMessage("Recording failed. Please discard and try again.")
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        chunksRef.current = []
        stopStream()

        if (discardRef.current) {
          discardRef.current = false
          mediaRecorderRef.current = null
          setState("idle")
          setSeconds(0)
          setTranscript("")
          setStage(0)
          setAudioBlob(null)
          setErrorMessage("")
          return
        }

        mediaRecorderRef.current = null
        setAudioBlob(blob)
        setTranscript(AUDIO_CAPTURED_MESSAGE)
        setState("stopped")
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setState("recording")
    } catch (error) {
      stopStream()
      setState("idle")
      setErrorMessage(getRecordingErrorMessage(error))
    }
  }

  function pauseRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== "recording") return
    recorder.pause()
    setState("paused")
  }

  function resumeRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== "paused") return
    recorder.resume()
    setState("recording")
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === "inactive") return
    recorder.stop()
  }

  function discardRecording() {
    const recorder = mediaRecorderRef.current

    if (recorder && recorder.state !== "inactive") {
      discardRef.current = true
      recorder.stop()
      return
    }

    reset()
  }

  function toggleMainRecordingControl() {
    if (state === "idle" || state === "stopped") {
      void startRecording()
    } else if (state === "recording") {
      pauseRecording()
    } else if (state === "paused") {
      resumeRecording()
    }
  }

  function processRecording() {
    if (!audioBlob) {
      setErrorMessage("Record audio before processing a quote draft.")
      return
    }

    void transcribeAndProcess(audioBlob)
  }

  async function transcribeAndProcess(blob: Blob) {
    setErrorMessage("")
    setStage(0)
    setState("processing")

    try {
      const formData = new FormData()
      formData.append("audio", blob, getAudioFileName(blob))

      console.log("Calling /api/transcribe", {
        audioSize: blob.size,
        audioType: blob.type,
        formDataKey: "audio",
      })

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      })

      const result = await response.json().catch(() => null)

      console.log("Received /api/transcribe response", {
        ok: response.ok,
        status: response.status,
        result,
      })

      if (!response.ok) {
        const message =
          typeof result?.error === "string"
            ? result.error
            : "Transcription failed. Please try recording again."
        console.log("/api/transcribe returned an error", {
          status: response.status,
          error: message,
        })
        throw new Error(message)
      }

      if (typeof result?.transcript !== "string" || !result.transcript.trim()) {
        throw new Error("Transcription completed but no text was returned.")
      }

      const rawTranscript = result.transcript.trim()
      setTranscript(rawTranscript)
      setStage(1)

      const correctionResponse = await fetch("/api/correct-transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transcript: rawTranscript }),
      })

      const correctionResult = await correctionResponse.json().catch(() => null)

      if (!correctionResponse.ok) {
        const message =
          typeof correctionResult?.error === "string"
            ? correctionResult.error
            : "Transcript correction failed. Please try again."
        throw new Error(message)
      }

      const correctedTranscript =
        typeof correctionResult?.corrected_transcript === "string" && correctionResult.corrected_transcript.trim()
          ? correctionResult.corrected_transcript.trim()
          : rawTranscript

      setTranscript(correctedTranscript)
      setStage(2)

      const [templateContext, knowledgeItemContext] = await Promise.all([
        loadQuoteTemplateContext(),
        loadKnowledgeItemContext(correctedTranscript),
      ])
      setStage(3)
      const notes = addedNotes.trim()
      const combinedInput = `Voice transcript:\n${correctedTranscript}\n\nAdded notes:\n${notes || "None provided."}`

      const quoteResponse = await fetch("/api/process-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: combinedInput,
          template_context: templateContext,
          knowledge_item_context: knowledgeItemContext,
        }),
      })

      const processedQuote = await quoteResponse.json().catch(() => null)

      if (!quoteResponse.ok) {
        const message =
          typeof processedQuote?.error === "string"
            ? processedQuote.error
            : "Quote extraction failed. Please try again."
        throw new Error(message)
      }

      if (notes && Array.isArray(processedQuote?.internal_notes)) {
        processedQuote.internal_notes = [...processedQuote.internal_notes, `Added notes:\n${notes}`]
      }

      for (let nextStage = 4; nextStage < aiStages.length; nextStage += 1) {
        setStage(nextStage)
        await sleep(500)
      }

      onProcess(rawTranscript, correctedTranscript, processedQuote as ProcessedQuote)
    } catch (error) {
      setState("stopped")
      setStage(0)
      setErrorMessage(error instanceof Error ? error.message : "Transcription failed. Please try again.")
    }
  }

  const statusLabel =
    state === "recording"
      ? "Listening"
      : state === "paused"
        ? "Paused"
        : state === "stopped"
          ? "Captured"
          : state === "processing"
            ? "Processing"
            : "Ready"

  return (
    <div className="relative flex min-h-full flex-col px-5 pb-4 pt-5">
      {/* Top bar */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Waypoints className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <span className="font-mono text-sm font-medium tracking-tight text-foreground">voicequote</span>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium",
            state === "recording"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : state === "stopped" || state === "processing"
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              state === "recording"
                ? "bg-destructive animate-pulse"
                : state === "idle" || state === "paused"
                  ? "bg-muted-foreground"
                  : "bg-primary animate-pulse-soft",
            )}
          />
          {statusLabel}
        </span>
      </header>

      {isLive && (
        <div className="sticky top-2 z-30 mt-3 flex items-center gap-3 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              state === "recording" ? "animate-pulse bg-destructive" : "bg-muted-foreground",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {state === "recording" ? "Recording" : "Recording paused"}
            </p>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">{formatTime(seconds)}</p>
          </div>
          <button
            type="button"
            onClick={state === "recording" ? pauseRecording : resumeRecording}
            aria-label={state === "recording" ? "Pause recording" : "Resume recording"}
            title={state === "recording" ? "Pause recording" : "Resume recording"}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground active:scale-95"
          >
            {state === "recording" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Stop recording"
            title="Stop recording"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-95"
          >
            <Square className="h-4 w-4" fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={discardRecording}
            aria-label="Discard recording"
            title="Discard recording"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-destructive active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hero copy */}
      <div className="mt-7 text-center">
        <h1 className="text-balance text-[2rem] font-semibold leading-[1.1] tracking-tight text-foreground">
          {state === "processing"
            ? "Building your quote"
            : state === "stopped"
              ? "Recording captured"
              : "Speak the job.\nGet the quote."}
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
          {state === "processing"
            ? "Our estimator is structuring everything you said into a priced draft."
            : "Walk the site, talk it through, and let the AI estimator handle the paperwork."}
        </p>
      </div>

      {/* Record control */}
      <div className="relative mt-8 flex flex-col items-center">
        <div className="bg-grid absolute inset-x-0 top-0 h-60 opacity-40 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />
        <div className="relative flex h-60 w-60 items-center justify-center">
          {(state === "recording" || state === "processing") && (
            <div className="record-glow absolute inset-0 rounded-full blur-xl animate-pulse-soft" />
          )}
          {state === "recording" && (
            <>
              <span className="absolute inline-flex h-48 w-48 rounded-full border border-primary/30 animate-ping-ring" />
              <span className="absolute inline-flex h-48 w-48 rounded-full border border-primary/20 animate-ping-ring [animation-delay:.7s]" />
            </>
          )}

          {state === "processing" ? (
            <div className="relative flex h-48 w-48 flex-col items-center justify-center rounded-full border border-primary/40 bg-card">
              <Loader2 className="h-14 w-14 animate-spin text-primary" strokeWidth={1.6} />
              <span className="mt-2 font-mono text-xs text-muted-foreground">
                {stage === 0 ? "transcribing..." : "analysing..."}
              </span>
            </div>
          ) : (
            <button
              type="button"
              aria-label={
                state === "recording" ? "Pause recording" : state === "idle" ? "Start recording" : "Resume recording"
              }
              onClick={toggleMainRecordingControl}
              className={cn(
                "group relative flex h-48 w-48 items-center justify-center rounded-full transition-all active:scale-95",
                state === "recording"
                  ? "bg-primary text-primary-foreground shadow-[0_0_60px_-12px] shadow-primary/60"
                  : "border border-border bg-card text-primary shadow-2xl shadow-black/40",
              )}
            >
              {state === "idle" && (
                <span className="absolute inset-2 rounded-full border border-primary/30 transition-colors group-hover:border-primary/60" />
              )}
              {state === "recording" ? (
                <Pause className="h-16 w-16" strokeWidth={2} />
              ) : state === "paused" ? (
                <Play className="h-16 w-16" strokeWidth={2} />
              ) : (
                <Mic className="h-16 w-16" strokeWidth={1.6} />
              )}
            </button>
          )}
        </div>

        {/* Idle hint / captured summary */}
        {state === "idle" && (
          <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">tap mic to record</p>
        )}
        {state === "stopped" && (
          <p className="mt-6 font-mono text-sm text-muted-foreground">
            <span className="text-foreground">{formatTime(seconds)}</span> captured · ready to process
          </p>
        )}
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {visibilityWarning && (
        <p className="mt-4 rounded-xl border border-warning/50 bg-warning/20 p-3 text-sm text-warning-foreground">
          {visibilityWarning}
        </p>
      )}

      {state !== "processing" && (
        <section className="mt-6">
          <label htmlFor="recording-notes" className="text-sm font-semibold text-foreground">
            Notes
          </label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Need to check measurements? Keep recording and add notes below without leaving the app.
          </p>
          <textarea
            id="recording-notes"
            value={addedNotes}
            onChange={(event) => setAddedNotes(event.target.value)}
            placeholder="Type or paste measurements, materials, access notes, or anything the recording may miss."
            rows={7}
            className="mt-3 max-h-64 min-h-40 w-full resize-y overflow-y-auto rounded-xl border border-border bg-card px-3 py-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-accent"
          />
        </section>
      )}

      {/* AI processing stages */}
      {state === "processing" && (
        <div className="mt-7 rounded-2xl border border-border bg-card p-4">
          <ul className="flex flex-col gap-2.5">
            {aiStages.map((label, i) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    i < stage
                      ? "border-primary bg-primary text-primary-foreground"
                      : i === stage
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {i < stage ? (
                    <Sparkles className="h-3 w-3" />
                  ) : i === stage ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                  )}
                </span>
                <span className={cn(i <= stage ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live transcript preview */}
      {state !== "processing" && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              recording note
            </label>
            {transcript && (
              <span className="font-mono text-[11px] text-muted-foreground">{transcript.length} chars</span>
            )}
          </div>
          <div
            ref={transcriptRef}
            className="h-36 overflow-y-auto rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground"
          >
            {transcript ? (
              <p className="text-pretty">
                {transcript}
              </p>
            ) : isLive ? (
              <p className="text-muted-foreground">
                Recording audio in this browser. Live transcription is not connected yet.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Record the client, the site, and the scope of work. The transcript will appear after processing.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Secondary: record actual site visit */}
      {state === "idle" && (
        <button
          type="button"
          onClick={() => void startRecording()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.99]"
        >
          <Radio className="h-4 w-4" />
          Record actual site visit instead
        </button>
      )}

      {/* Process button */}
      {state !== "processing" && (
        <button
          type="button"
          disabled={!canProcess}
          onClick={processRecording}
          className={cn(
            "relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-base font-semibold transition-all active:scale-[0.99]",
            canProcess
              ? "animate-shimmer bg-primary text-primary-foreground shadow-[0_0_40px_-10px] shadow-primary/50"
              : "cursor-not-allowed border border-border bg-card text-muted-foreground",
          )}
        >
          <Sparkles className="h-5 w-5" />
          Process Quote into Draft
        </button>
      )}

      <p className="mx-auto mt-4 max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
        Speak naturally. Mention the client name, location, job scope, dimensions, and any specific materials used.
      </p>
    </div>
  )
}
