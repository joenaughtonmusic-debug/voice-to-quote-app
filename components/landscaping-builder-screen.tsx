"use client"

import { useState } from "react"
import { Plus, Trash2, GripVertical, Hammer, Mic, ListPlus } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Landscaping Quote Builder — L1 shell.
//
// The "build it fast, my judgement stays in" mode. This is the empty builder:
// a single manual chunk you can rename, with editable lines you add by hand.
// It deliberately does NOT auto-quote. Later steps wire in:
//   L2 — talk -> split into confirmable chunks
//   L3 — suggest lines + prices from uploaded lists (list price / suggest+flag)
//   L4 — spacing/counts (suggest -> approve)
//   L5 — assemble to internal/team/customer + GST + Xero parity
// Nothing here touches the gardening auto-quoter.
// ---------------------------------------------------------------------------

type BuilderLine = {
  id: string
  description: string
}

type BuilderChunk = {
  id: string
  title: string
  lines: BuilderLine[]
}

let idCounter = 0
function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function makeEmptyChunk(title: string): BuilderChunk {
  return { id: nextId("chunk"), title, lines: [] }
}

export function LandscapingBuilderScreen() {
  // Start with one manual chunk, per the L1 spec.
  const [chunks, setChunks] = useState<BuilderChunk[]>([makeEmptyChunk("Area 1")])

  function addChunk() {
    setChunks((prev) => [...prev, makeEmptyChunk(`Area ${prev.length + 1}`)])
  }

  function removeChunk(chunkId: string) {
    setChunks((prev) => prev.filter((chunk) => chunk.id !== chunkId))
  }

  function renameChunk(chunkId: string, title: string) {
    setChunks((prev) => prev.map((chunk) => (chunk.id === chunkId ? { ...chunk, title } : chunk)))
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

  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      {/* Intro / what this mode is */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary">
          <Hammer className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Landscaping builder</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Build the quote fast — your judgement stays in. Split the job into chunks, add lines, and approve every price.
          Nothing is auto-finalised.
        </p>

        {/* Talk-to-split lands in L2; shown disabled so the frame is visible. */}
        <button
          type="button"
          disabled
          title="Coming next: talk → split into chunks"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 py-3 text-sm font-medium text-muted-foreground"
        >
          <Mic className="h-4 w-4" />
          Talk to split into chunks
          <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">Next</span>
        </button>
      </div>

      {/* Chunks */}
      <div className="mt-5 space-y-4">
        {chunks.map((chunk) => (
          <ChunkCard
            key={chunk.id}
            chunk={chunk}
            canDelete={chunks.length > 1}
            onRename={(title) => renameChunk(chunk.id, title)}
            onDelete={() => removeChunk(chunk.id)}
            onAddLine={() => addLine(chunk.id)}
            onEditLine={(lineId, description) => editLine(chunk.id, lineId, description)}
            onRemoveLine={(lineId) => removeLine(chunk.id, lineId)}
          />
        ))}
      </div>

      {/* Add chunk */}
      <button
        type="button"
        onClick={addChunk}
        className="mt-4 mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground shadow-sm active:scale-[0.99]"
      >
        <Plus className="h-4 w-4" />
        Add chunk
      </button>

      {/* Honest note about what is not wired yet */}
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
  onRename,
  onDelete,
  onAddLine,
  onEditLine,
  onRemoveLine,
}: {
  chunk: BuilderChunk
  canDelete: boolean
  onRename: (title: string) => void
  onDelete: () => void
  onAddLine: () => void
  onEditLine: (lineId: string, description: string) => void
  onRemoveLine: (lineId: string) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={chunk.title}
          onChange={(event) => onRename(event.target.value)}
          placeholder="Name this area / job type"
          className="min-w-0 flex-1 bg-transparent text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? "Delete chunk" : "Keep at least one chunk"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground",
            canDelete ? "hover:bg-muted hover:text-destructive" : "opacity-40",
          )}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

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
