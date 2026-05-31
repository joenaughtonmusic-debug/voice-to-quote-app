"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Pause, Square, Trash2, Play, Sparkles, Radio, Waypoints, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { transcriptDemo } from "@/lib/quote-data"

type RecState = "idle" | "recording" | "paused" | "stopped" | "processing"

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

const waveBars = Array.from({ length: 32 })

const aiStages = [
  "Transcribing audio",
  "Extracting client & site",
  "Identifying job scope",
  "Pricing line items",
  "Flagging low-confidence values",
]

export function RecordScreen({ onProcess }: { onProcess: () => void }) {
  const [state, setState] = useState<RecState>("idle")
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState("")
  const [stage, setStage] = useState(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (state !== "recording") return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [state])

  useEffect(() => {
    if (state !== "recording") return
    const id = setInterval(() => {
      setTranscript((t) => {
        if (t.length >= transcriptDemo.length) return t
        return transcriptDemo.slice(0, t.length + 3)
      })
    }, 55)
    return () => clearInterval(id)
  }, [state])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  // AI processing sequence
  useEffect(() => {
    if (state !== "processing") return
    if (stage >= aiStages.length) {
      const done = setTimeout(onProcess, 450)
      return () => clearTimeout(done)
    }
    const id = setTimeout(() => setStage((s) => s + 1), 600)
    return () => clearTimeout(id)
  }, [state, stage, onProcess])

  const isLive = state === "recording" || state === "paused"

  function reset() {
    setState("idle")
    setSeconds(0)
    setTranscript("")
    setStage(0)
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
              <span className="mt-2 font-mono text-xs text-muted-foreground">analysing…</span>
            </div>
          ) : (
            <button
              type="button"
              aria-label={
                state === "recording" ? "Pause recording" : state === "idle" ? "Start recording" : "Resume recording"
              }
              onClick={() => {
                if (state === "idle" || state === "stopped") {
                  if (state === "stopped") reset()
                  setState("recording")
                } else if (state === "recording") {
                  setState("paused")
                } else if (state === "paused") {
                  setState("recording")
                }
              }}
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

        {/* Live waveform + timer + controls */}
        {isLive && (
          <div className="mt-7 w-full rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-sm">
            <div className="flex h-16 items-center justify-center gap-1">
              {waveBars.map((_, i) => (
                <span
                  key={i}
                  className={cn("w-1 rounded-full", state === "recording" ? "bg-primary animate-wave" : "bg-primary/25")}
                  style={{ height: `${16 + ((i * 11) % 44)}px`, animationDelay: `${(i % 12) * 0.07}s` }}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {formatTime(seconds)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setState(state === "recording" ? "paused" : "recording")}
                  aria-label={state === "recording" ? "Pause" : "Resume"}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground active:scale-95"
                >
                  {state === "recording" ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setState("stopped")}
                  aria-label="Stop recording"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-95"
                >
                  <Square className="h-5 w-5" fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Discard recording"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-destructive active:scale-95"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}

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
              live transcript
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
                {state === "recording" && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
                )}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Your words appear here in real time. Mention the client, the site, and the scope of work.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Secondary: record actual site visit */}
      {state === "idle" && (
        <button
          type="button"
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
          disabled={state !== "stopped"}
          onClick={() => {
            setStage(0)
            setState("processing")
          }}
          className={cn(
            "relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-base font-semibold transition-all active:scale-[0.99]",
            state === "stopped"
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
