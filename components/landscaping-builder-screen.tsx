"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, GripVertical, Hammer, Scissors, ListPlus, Check, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { supabase } from "@/lib/supabase"
import {
  chunkLandscapingTranscript,
  WORK_TYPE_OPTIONS,
  type ChunkConfidence,
  type WorkType,
} from "@/lib/landscaping/chunker"
import { matchLineToPriceList, type PriceListRow, type PriceSource } from "@/lib/landscaping/list-matcher"
import { resolvePlantingLineFromText, type CountSource } from "@/lib/landscaping/planting-spacing"
import { assembleLandscapingQuote, type AssembledQuote, type LandscapingQuoteInput } from "@/lib/landscaping/assemble-quote"
import { FileText } from "lucide-react"

// ---------------------------------------------------------------------------
// Landscaping Quote Builder — L1 shell + L2 chunker + L3 price matching.
//
// Talk/paste -> split into confirmable work-area sections -> for each line,
// match against the user's imported price lists (Botanic / Bunnings / Landscape
// Supplies). Use the list price where it matches; suggest + flag "confirm" where
// it doesn't; never silently invent a price. Everything stays editable.
// Gardening auto-quoter is untouched.
// ---------------------------------------------------------------------------

type BuilderLine = {
  id: string
  description: string
  price: number | null
  price_source: PriceSource | null
  matched_name: string | null
  matched_cost: number | null
  needs_confirm: boolean
  note: string | null
  confirmed: boolean
  // Planting spacing/count (only shown for planting chunks).
  spacing_mm: number | null
  spacing_rule: string | null
  spacing_applied: boolean
  spacing_overridden: boolean
  count: number | null
  count_source: CountSource | null
  count_formula: string | null
  count_overridden: boolean
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

function makeLine(): BuilderLine {
  return {
    id: nextId("line"),
    description: "",
    price: null,
    price_source: null,
    matched_name: null,
    matched_cost: null,
    needs_confirm: false,
    note: null,
    confirmed: false,
    spacing_mm: null,
    spacing_rule: null,
    spacing_applied: false,
    spacing_overridden: false,
    count: null,
    count_source: null,
    count_formula: null,
    count_overridden: false,
  }
}

function makeManualChunk(title: string): BuilderChunk {
  return { id: nextId("chunk"), title, work_type: "other", source_text: "", confidence: "low", approved: false, lines: [] }
}

// Recompute spacing + count for a planting line from its text + any user overrides.
function withPlanting(line: BuilderLine): BuilderLine {
  const res = resolvePlantingLineFromText(line.description, {
    spacing_mm_override: line.spacing_overridden ? line.spacing_mm : null,
    count_override: line.count_overridden ? line.count : null,
  })
  return {
    ...line,
    spacing_mm: res.spacing_mm,
    spacing_rule: res.spacing_rule,
    spacing_applied: res.spacing_applied,
    count: res.count,
    count_source: res.count_source,
    count_formula: res.count_formula,
  }
}

// Clear planting fields when a chunk is not planting.
function clearPlanting(line: BuilderLine): BuilderLine {
  return { ...line, spacing_mm: null, spacing_rule: null, spacing_applied: false, count: null, count_source: null, count_formula: null }
}

const CONFIDENCE_STYLES: Record<ChunkConfidence, string> = {
  high: "bg-accent text-primary",
  medium: "bg-muted text-foreground",
  low: "bg-muted text-muted-foreground",
}

// Map an imported knowledge_items row into a matcher candidate.
function toPriceRow(item: Record<string, any>): PriceListRow {
  const raw = (item.raw_import ?? {}) as Record<string, any>
  return {
    id: String(item.id),
    name: String(item.item_name ?? raw.plant_name ?? "").trim(),
    aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
    unit: item.unit ?? null,
    sell_price: typeof item.sell_price === "number" ? item.sell_price : null,
    cost_price: typeof item.cost_price === "number" ? item.cost_price : null,
    source: item.source_category ?? item.source_system ?? null,
    stock_status: raw.stock_status ?? null,
  }
}

export function LandscapingBuilderScreen() {
  const { user } = useAuth()
  const [transcript, setTranscript] = useState("")
  const [chunks, setChunks] = useState<BuilderChunk[]>([makeManualChunk("Area 1")])
  const [priceRows, setPriceRows] = useState<PriceListRow[]>([])
  const [listsLoaded, setListsLoaded] = useState(false)
  const [clientName, setClientName] = useState("")
  const [siteAddress, setSiteAddress] = useState("")
  const [quoteTitle, setQuoteTitle] = useState("")
  const [assembled, setAssembled] = useState<AssembledQuote | null>(null)
  const [quoteView, setQuoteView] = useState<"customer" | "team" | "internal">("customer")

  // Load the user's imported price-list rows (plants + materials) once.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from("knowledge_items")
        .select("id, item_name, aliases, unit, sell_price, cost_price, source_category, source_system, raw_import")
        .eq("user_id", user.id)
      if (cancelled) return
      setPriceRows((data ?? []).map(toPriceRow).filter((row) => row.name))
      setListsLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

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
    setChunks((prev) =>
      prev.map((chunk) => {
        if (chunk.id !== chunkId) return chunk
        const next = { ...chunk, ...patch }
        // Switching a chunk's work type refreshes its planting fields.
        if (patch.work_type && patch.work_type !== chunk.work_type) {
          next.lines = chunk.lines.map((line) => (patch.work_type === "planting" ? withPlanting(line) : clearPlanting(line)))
        }
        return next
      }),
    )
  }

  function removeChunk(chunkId: string) {
    setChunks((prev) => prev.filter((chunk) => chunk.id !== chunkId))
  }

  function mutateLines(chunkId: string, fn: (lines: BuilderLine[]) => BuilderLine[]) {
    setChunks((prev) => prev.map((chunk) => (chunk.id === chunkId ? { ...chunk, lines: fn(chunk.lines) } : chunk)))
  }

  function addLine(chunkId: string) {
    mutateLines(chunkId, (lines) => [...lines, makeLine()])
  }

  // Re-match against the price lists as the description changes — unless the user
  // has already confirmed/edited the price for this line. For planting chunks,
  // also refresh the spacing + count.
  function editLineDescription(chunkId: string, lineId: string, description: string) {
    setChunks((prev) =>
      prev.map((chunk) => {
        if (chunk.id !== chunkId) return chunk
        const isPlanting = chunk.work_type === "planting"
        return {
          ...chunk,
          lines: chunk.lines.map((line) => {
            if (line.id !== lineId) return line
            let next: BuilderLine = line.confirmed
              ? { ...line, description }
              : {
                  ...line,
                  description,
                  ...(() => {
                    const match = matchLineToPriceList(description, priceRows)
                    return {
                      price: match.price,
                      price_source: description.trim() ? match.price_source : null,
                      matched_name: match.row?.name ?? null,
                      matched_cost: match.row?.cost_price ?? null,
                      needs_confirm: description.trim() ? match.needs_confirm : false,
                      note: description.trim() ? match.note ?? null : null,
                    }
                  })(),
                }
            if (isPlanting) next = withPlanting(next)
            return next
          }),
        }
      }),
    )
  }

  function editLineSpacingCm(chunkId: string, lineId: string, value: string) {
    const cm = value.trim() === "" ? null : Number(value.replace(/[^0-9.]/g, ""))
    mutateLines(chunkId, (lines) =>
      lines.map((line) => {
        if (line.id !== lineId) return line
        const overridden = cm != null && Number.isFinite(cm) && cm > 0
        return withPlanting({ ...line, spacing_mm: overridden ? Math.round((cm as number) * 10) : line.spacing_mm, spacing_overridden: overridden })
      }),
    )
  }

  function editLineCount(chunkId: string, lineId: string, value: string) {
    // Non-integer allowed for material qty (e.g. 4.5 m³); planting counts are whole.
    const parsed = value.trim() === "" ? null : Number(value.replace(/[^0-9.]/g, ""))
    setChunks((prev) =>
      prev.map((chunk) => {
        if (chunk.id !== chunkId) return chunk
        const isPlanting = chunk.work_type === "planting"
        return {
          ...chunk,
          lines: chunk.lines.map((line) => {
            if (line.id !== lineId) return line
            const overridden = parsed != null && Number.isFinite(parsed) && parsed > 0
            const nextCount = overridden ? (isPlanting ? Math.round(parsed as number) : (parsed as number)) : line.count
            const next = { ...line, count: nextCount, count_overridden: overridden }
            return isPlanting ? withPlanting(next) : next
          }),
        }
      }),
    )
  }

  function editLinePrice(chunkId: string, lineId: string, value: string) {
    const parsed = value.trim() === "" ? null : Number(value.replace(/[^0-9.]/g, ""))
    mutateLines(chunkId, (lines) =>
      lines.map((line) =>
        line.id === lineId
          ? { ...line, price: parsed != null && Number.isFinite(parsed) ? parsed : null, confirmed: true, needs_confirm: false }
          : line,
      ),
    )
  }

  function confirmLine(chunkId: string, lineId: string) {
    mutateLines(chunkId, (lines) =>
      lines.map((line) => (line.id === lineId ? { ...line, confirmed: true, needs_confirm: false } : line)),
    )
  }

  function removeLine(chunkId: string, lineId: string) {
    mutateLines(chunkId, (lines) => lines.filter((line) => line.id !== lineId))
  }

  function buildQuote() {
    const input: LandscapingQuoteInput = {
      customer_name: clientName,
      site_address: siteAddress,
      quote_title: quoteTitle,
      chunks: chunks.map((chunk) => ({
        title: chunk.title,
        work_type: chunk.work_type,
        source_text: chunk.source_text,
        approved: chunk.approved,
        lines: chunk.lines.map((line) => ({
          description: line.description,
          qty: line.count,
          unit_price: line.price,
          price_source: line.price_source,
          matched_name: line.matched_name,
          cost_price: line.matched_cost,
          confirmed: line.confirmed,
          needs_confirm: line.needs_confirm,
          spacing_rule: line.spacing_applied ? line.spacing_rule : null,
          count_formula: line.spacing_applied ? line.count_formula : null,
        })),
      })),
    }
    setAssembled(assembleLandscapingQuote(input))
    setQuoteView("customer")
  }

  const approvedCount = chunks.filter((chunk) => chunk.approved).length
  const needsConfirmCount = chunks.reduce(
    (total, chunk) => total + chunk.lines.filter((line) => line.needs_confirm && !line.confirmed).length,
    0,
  )

  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary">
          <Hammer className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Landscaping builder</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Paste or dictate the whole job. It splits into work-area sections you review and approve. Add lines and it
          matches your imported price lists — using the list price where it can, flagging what it can&apos;t. Nothing is
          invented.
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

        <p className="mt-3 text-xs text-muted-foreground">
          {listsLoaded
            ? priceRows.length > 0
              ? `Matching against ${priceRows.length} imported price-list items.`
              : "No price lists imported yet — lines will import unpriced and flagged. Import in Knowledge base."
            : "Loading your price lists…"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <input
          value={clientName}
          onChange={(event) => setClientName(event.target.value)}
          placeholder="Client name"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <input
          value={siteAddress}
          onChange={(event) => setSiteAddress(event.target.value)}
          placeholder="Site address"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <input
          value={quoteTitle}
          onChange={(event) => setQuoteTitle(event.target.value)}
          placeholder="Quote title (e.g. Driveway landscaping)"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      <div className="mt-5 flex items-center justify-between px-1">
        <p className="text-sm font-medium text-foreground">
          {chunks.length} section{chunks.length === 1 ? "" : "s"}
          <span className="text-muted-foreground"> · {approvedCount} approved</span>
        </p>
        {needsConfirmCount > 0 ? (
          <p className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {needsConfirmCount} price{needsConfirmCount === 1 ? "" : "s"} to confirm
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Review &amp; approve — nothing is merged for you</p>
        )}
      </div>

      <div className="mt-3 space-y-4">
        {chunks.map((chunk) => (
          <ChunkCard
            key={chunk.id}
            chunk={chunk}
            canDelete={chunks.length > 1}
            onChange={(patch) => updateChunk(chunk.id, patch)}
            onDelete={() => removeChunk(chunk.id)}
            onAddLine={() => addLine(chunk.id)}
            onEditLineDescription={(lineId, description) => editLineDescription(chunk.id, lineId, description)}
            onEditLinePrice={(lineId, value) => editLinePrice(chunk.id, lineId, value)}
            onEditLineSpacing={(lineId, value) => editLineSpacingCm(chunk.id, lineId, value)}
            onEditLineCount={(lineId, value) => editLineCount(chunk.id, lineId, value)}
            onConfirmLine={(lineId) => confirmLine(chunk.id, lineId)}
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

      <button
        type="button"
        onClick={buildQuote}
        disabled={!chunks.some((c) => c.approved)}
        className={cn(
          "mt-2 mb-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold active:scale-[0.99]",
          chunks.some((c) => c.approved) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <FileText className="h-4 w-4" />
        Build quote
      </button>

      {assembled && <AssembledQuoteView quote={assembled} view={quoteView} onView={setQuoteView} />}
    </div>
  )
}

function AssembledQuoteView({
  quote,
  view,
  onView,
}: {
  quote: AssembledQuote
  view: "customer" | "team" | "internal"
  onView: (view: "customer" | "team" | "internal") => void
}) {
  const parityOk = quote.xero.total === quote.totals.total
  return (
    <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{quote.title}</h2>
      {(quote.customer_name || quote.site_address) && (
        <p className="mt-0.5 text-sm text-muted-foreground">
          {[quote.customer_name, quote.site_address].filter(Boolean).join(" · ")}
        </p>
      )}

      <div role="tablist" className="mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-muted/50 p-1">
        {(["customer", "team", "internal"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => onView(key)}
            className={cn(
              "rounded-xl py-2 text-sm font-semibold capitalize transition-colors",
              view === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {key}
          </button>
        ))}
      </div>

      {view === "customer" && (
        <div className="mt-4 space-y-4">
          {quote.customer.sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <ul className="mt-1 space-y-1">
                {section.lines.map((line, i) => (
                  <li key={i} className="text-sm text-muted-foreground">{line}</li>
                ))}
              </ul>
            </div>
          ))}
          <div className="border-t border-border pt-3">
            {quote.customer.totals_lines.map((line, i) => (
              <p key={i} className={cn("text-sm", i === quote.customer.totals_lines.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {view === "team" && (
        <div className="mt-4 space-y-4">
          {quote.team.sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {section.items.map((item, i) => (
                  <li key={i} className="text-sm text-muted-foreground">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {view === "internal" && (
        <div className="mt-4 space-y-4">
          {quote.internal.sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <ul className="mt-1 space-y-1">
                {section.lines.map((line, i) => (
                  <li key={i} className="text-sm text-muted-foreground">{line}</li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-semibold text-foreground">
              Xero parity: {parityOk ? "✓ matches customer total" : "✗ mismatch"} ({quote.xero.lines.length} lines, total ${quote.xero.total.toFixed(2)})
            </p>
            {quote.internal.flags.length > 0 && (
              <ul className="mt-2 space-y-1">
                {quote.internal.flags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-1 text-xs text-amber-600 dark:text-amber-500">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {flag}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChunkCard({
  chunk,
  canDelete,
  onChange,
  onDelete,
  onAddLine,
  onEditLineDescription,
  onEditLinePrice,
  onEditLineSpacing,
  onEditLineCount,
  onConfirmLine,
  onRemoveLine,
}: {
  chunk: BuilderChunk
  canDelete: boolean
  onChange: (patch: Partial<BuilderChunk>) => void
  onDelete: () => void
  onAddLine: () => void
  onEditLineDescription: (lineId: string, description: string) => void
  onEditLinePrice: (lineId: string, value: string) => void
  onEditLineSpacing: (lineId: string, value: string) => void
  onEditLineCount: (lineId: string, value: string) => void
  onConfirmLine: (lineId: string) => void
  onRemoveLine: (lineId: string) => void
}) {
  const isPlanting = chunk.work_type === "planting"
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-sm", chunk.approved ? "border-primary/50" : "border-border")}>
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
        <ul className="mt-3 space-y-3">
          {chunk.lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              isPlanting={isPlanting}
              onEditDescription={(description) => onEditLineDescription(line.id, description)}
              onEditPrice={(value) => onEditLinePrice(line.id, value)}
              onEditSpacing={(value) => onEditLineSpacing(line.id, value)}
              onEditCount={(value) => onEditLineCount(line.id, value)}
              onConfirm={() => onConfirmLine(line.id)}
              onRemove={() => onRemoveLine(line.id)}
            />
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

const SOURCE_BADGE: Record<PriceSource, { label: string; className: string }> = {
  list: { label: "list price", className: "bg-accent text-primary" },
  suggested: { label: "suggested", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  unpriced: { label: "no match", className: "bg-muted text-muted-foreground" },
}

function LineRow({
  line,
  isPlanting,
  onEditDescription,
  onEditPrice,
  onEditSpacing,
  onEditCount,
  onConfirm,
  onRemove,
}: {
  line: BuilderLine
  isPlanting: boolean
  onEditDescription: (description: string) => void
  onEditPrice: (value: string) => void
  onEditSpacing: (value: string) => void
  onEditCount: (value: string) => void
  onConfirm: () => void
  onRemove: () => void
}) {
  const showFlag = line.needs_confirm && !line.confirmed
  const badge = line.price_source ? SOURCE_BADGE[line.price_source] : null
  const spacingCm = line.spacing_mm != null ? Math.round(line.spacing_mm / 10) : null

  return (
    <li className="rounded-xl border border-border bg-background p-2.5">
      <div className="flex items-center gap-2">
        <input
          value={line.description}
          onChange={(event) => onEditDescription(event.target.value)}
          placeholder="Describe a line (e.g. bark mulch, Ficus tuffi)"
          className="min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {!isPlanting && (
          <label className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground">
            <span>Qty</span>
            <input
              value={line.count ?? ""}
              onChange={(event) => onEditCount(event.target.value)}
              inputMode="decimal"
              placeholder="1"
              className="w-10 bg-transparent py-1 text-right text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
        <div className="flex items-center rounded-lg border border-border bg-card px-2">
          <span className="text-sm text-muted-foreground">$</span>
          <input
            value={line.price ?? ""}
            onChange={(event) => onEditPrice(event.target.value)}
            inputMode="decimal"
            placeholder="—"
            className="w-16 bg-transparent py-1 text-right text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          title="Remove line"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isPlanting && (
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          <label className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground">
            <span className="text-muted-foreground">Spacing</span>
            <input
              value={spacingCm ?? ""}
              onChange={(event) => onEditSpacing(event.target.value)}
              inputMode="decimal"
              placeholder="50"
              className="w-10 bg-transparent text-right outline-none"
            />
            <span className="text-muted-foreground">cm</span>
          </label>
          <label className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground">
            <span className="text-muted-foreground">Count</span>
            <input
              value={line.count ?? ""}
              onChange={(event) => onEditCount(event.target.value)}
              inputMode="numeric"
              placeholder="—"
              className="w-12 bg-transparent text-right outline-none"
            />
          </label>
          {line.spacing_rule && <span className="text-[11px] text-muted-foreground">{line.spacing_rule}</span>}
          {line.count_formula && line.spacing_applied && (
            <span className="text-[11px] text-muted-foreground">{line.count_formula}</span>
          )}
          {!line.spacing_applied && line.count_source && line.count_source !== "missing" && (
            <span className="text-[11px] text-muted-foreground">count set manually — spacing not applied</span>
          )}
        </div>
      )}

      {(badge || line.note || showFlag) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
          {badge && (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", badge.className)}>{badge.label}</span>
          )}
          {line.confirmed && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">confirmed</span>
          )}
          {line.note && <span className="text-[11px] text-muted-foreground">{line.note}</span>}
          {showFlag && (
            <button
              type="button"
              onClick={onConfirm}
              className="ml-auto flex items-center gap-1 rounded-full border border-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
            >
              <Check className="h-3 w-3" />
              Confirm
            </button>
          )}
        </div>
      )}
    </li>
  )
}
