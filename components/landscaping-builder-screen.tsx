"use client"

import { useState } from "react"
import { Plus, Trash2, GripVertical, Hammer, Scissors, ListPlus, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  chunkLandscapingTranscript,
  WORK_TYPE_OPTIONS,
  type ChunkConfidence,
  type WorkType,
} from "@/lib/landscaping/chunker"

// ---------------------------------------------------------------------------
// Landscaping Quote Builder — L1 shell + L2 chunker.
//
// Talk/paste one recording -> the chunker splits it into distinct, confirmable
// work-area sections (weed mat / bark / planting / edging ...) that stay
// EDITABLE and must be APPROVED. Different work types are never merged for you.
// Later: L3 price matching, L4 spacing/counts, L5 assemble + Xero parity.
// Gardening auto-quoter is untouched.
// ---------------------------------------------------------------------------

type BuilderLine = {
  id: string
  description: string
}

type BuilderChunk = {
  id: string
  title: string
  work_type: WorkType
  source_text: string
  confidence: ChunkConfidence
  approved: boolean
  lines: BuilderLine[]
}

let idCounter = 0
function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function makeManualChunk(title: string): BuilderChunk {
  return { id: nextId("chunk"), title, work_type: "other", source_text: "", confidence: "low", approved: false, lines: [] }
}

const CONFIDENCE_STYLES: Record<ChunkConfidence, string> = {
  high: "bg-accent text-primary",
  medium: "bg-muted text-foreground",
  low: "bg-muted text-muted-foreground",
}

export function LandscapingBuilderScreen() {
  const [transcript, setTranscript] = useState("")
  // Start with one manual chunk, per the L1 shell.
  const [chunks, setChunks] = useState<BuilderChunk[]>([makeManualChunk("Area 1")])

  const hasWork = chunks.some((chunk) => chunk.approved || chunk.lines.length > 0 || chunk.source_text.trim())

  function splitFromTranscript() {
    const text = transcript.trim()
    if (!text) return
    if (hasWork && !window.confirm("Replace the current sections with a fresh split of the text above?")) return

    const detected = chunkLandscapingTranscript(text)
    setChunks(
      detected.map((chunk) => ({
        id: chunk.id,
        title: chunk.label,
        work_type: chunk.work_type,
        source_text: chunk.source_text,
        confidence: chunk.confidence,
        approved: false,
        lines: [],
      })),
    )
  }

  function addChunk() {
    setChunks((prev) => [...prev, makeManualChunk(`Area ${prev.length + 1}`)])
  }

  function updateChunk(chunkId: string, patch: Partial<BuilderChunk>) {
    setChunks((prev) => prev.map((chunk) => (chunk.id === chunkId ? { ...chunk, ...patch } : chunk)))
  }

  function removeChunk(chunkId: string) {
    setChunks((prev) => prev.filter((chunk) => chunk.id !== chunkId))
  }

  function addLine(chunkId: string) {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.id === chunkId ? { ...chunk, lines: [...chunk.lines, { id: nextId("line"), description: "" }] } : chunk,
      ),
    )
  }

  function editLine(chunkId: string, lineId: string, description: string) {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.id === chunkId
          ? { ...chunk, lines: chunk.lines.map((line) => (line.id === lineId ? { ...line, description } : line)) }
          : chunk,
      ),
    )
  }

  function removeLine(chunkId: string, lineId: string) {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.id === chunkId ? { ...chunk, lines: chunk.lines.filter((line) => line.id !== lineId) } : chunk,
      ),
    )
  }

  const approvedCount = chunks.filter((chunk) => chunk.approved).length

  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      {/* Intro + talk/paste to split */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary">
          <Hammer className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Landscaping builder</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Paste or dictate the whole job. It splits into work-area sections you review and approve — weed mat, bark,
          planting, edging, and so on. Different work is never merged for you.
        </p>

        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={4}
          placeholder="e.g. Along the driveway we'll lay weed mat then bark mulch, then timber edging down both sides. Plant 18m of carex along the driveway edge."
          className="mt-4 w-full resize-y rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="button"
          onClick={splitFromTranscript}
          disabled={!transcript.trim()}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold active:scale-[0.99]",
            transcript.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Scissors className="h-4 w-4" />
          Split into chunks
        </button>
      </div>

      {/* Review banner */}
      <div className="mt-5 flex items-center justify-between px-1">
        <p className="text-sm font-medium text-foreground">
          {chunks.length} section{chunks.length === 1 ? "" : "s"}
          <span className="text-muted-foreground"> · {approvedCount} approved</span>
        </p>
        <p className="text-xs text-muted-foreground">Review &amp; approve — nothing is merged for you</p>
      </div>

      {/* Chunks */}
      <div className="mt-3 space-y-4">
        {chunks.map((chunk) => (
          <ChunkCard
            key={chunk.id}
            chunk={chunk}
            canDelete={chunks.length > 1}
            onChange={(patch) => updateChunk(chunk.id, patch)}
            onDelete={() => removeChunk(chunk.id)}
            onAddLine={() => addLine(chunk.id)}
            onEditLine={(lineId, description) => editLine(chunk.id, lineId, description)}
            onRemoveLine={(lineId) => removeLine(chunk.id, lineId)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addChunk}
        className="mt-4 mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground shadow-sm active:scale-[0.99]"
      >
        <Plus className="h-4 w-4" />
        Add chunk
      </button>

      <p className="mb-6 mt-2 px-1 text-xs leading-relaxed text-muted-foreground">
        Price matching from your uploaded lists and suggested spacing/counts arrive in the next steps. For now every line
        is a manual note you control.
      </p>
    </div>
  )
}

function ChunkCard({
  chunk,
  canDelete,
  onChange,
  onDelete,
  onAddLine,
  onEditLine,
  onRemoveLine,
}: {
  chunk: BuilderChunk
  canDelete: boolean
  onChange: (patch: Partial<BuilderChunk>) => void
  onDelete: () => void
  onAddLine: () => void
  onEditLine: (lineId: string, description: string) => void
  onRemoveLine: (lineId: string) => void
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-sm",
        chunk.approved ? "border-primary/50" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={chunk.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Name this area / job type"
          className="min-w-0 flex-1 bg-transparent text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        />
        {chunk.confidence !== "low" && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", CONFIDENCE_STYLES[chunk.confidence])}>
            {chunk.confidence}
          </span>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? "Delete section" : "Keep at least one section"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground",
            canDelete ? "hover:bg-muted hover:text-destructive" : "opacity-40",
          )}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Work type + approve */}
      <div className="mt-3 flex items-center gap-2">
        <select
          value={chunk.work_type}
          onChange={(event) => onChange({ work_type: event.target.value as WorkType })}
          className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        >
          {WORK_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange({ approved: !chunk.approved })}
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold active:scale-[0.99]",
            chunk.approved ? "bg-primary text-primary-foreground" : "border border-border text-foreground",
          )}
        >
          <Check className="h-4 w-4" />
          {chunk.approved ? "Approved" : "Approve"}
        </button>
      </div>

      {/* What you said (editable, so the user can trim the split) */}
      {(chunk.source_text || chunk.confidence !== "low") && (
        <textarea
          value={chunk.source_text}
          onChange={(event) => onChange({ source_text: event.target.value })}
          rows={2}
          placeholder="What you said for this section"
          className="mt-3 w-full resize-y rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm italic text-muted-foreground outline-none focus:border-primary focus:not-italic focus:text-foreground"
        />
      )}

      {chunk.lines.length > 0 && (
        <ul className="mt-3 space-y-2">
          {chunk.lines.map((line) => (
            <li key={line.id} className="flex items-center gap-2">
              <input
                value={line.description}
                onChange={(event) => onEditLine(line.id, event.target.value)}
                placeholder="Describe a line (e.g. weed mat along driveway)"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <button
                type="button"
                onClick={() => onRemoveLine(line.id)}
                title="Remove line"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onAddLine}
        className="mt-3 flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
      >
        <ListPlus className="h-4 w-4" />
        Add line
      </button>
    </div>
  )
}
