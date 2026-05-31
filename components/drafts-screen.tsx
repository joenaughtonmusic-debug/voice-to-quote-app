"use client"

import { useState } from "react"
import { ChevronRight, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { draftRows, type QuoteStatus } from "@/lib/quote-data"

const filters = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs Review" },
  { id: "ready", label: "Ready" },
] as const

type Filter = (typeof filters)[number]["id"]

const statusStyles: Record<QuoteStatus, { label: string; className: string }> = {
  ready: { label: "Ready to Send", className: "bg-accent text-success" },
  review: { label: "Needs Review", className: "bg-warning/40 text-warning-foreground" },
}

export function DraftsScreen({ onOpen }: { onOpen: () => void }) {
  const [filter, setFilter] = useState<Filter>("all")

  const rows = draftRows.filter((r) => filter === "all" || r.status === filter)

  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Drafts</h1>
        <p className="text-sm text-muted-foreground">{draftRows.length} quotes captured this week</p>
      </header>

      {/* Filter bar */}
      <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 no-scrollbar">
        {filters.map((f) => {
          const count = f.id === "all" ? draftRows.length : draftRows.filter((r) => r.status === f.id).length
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  filter === f.id ? "bg-primary-foreground/20" : "bg-background",
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="flex flex-col gap-3 pb-4">
        {rows.map((row) => {
          const status = statusStyles[row.status]
          return (
            <button
              key={row.id}
              type="button"
              onClick={onOpen}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-shadow active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-foreground">{row.customer}</p>
                  <span className="shrink-0 text-base font-semibold text-foreground">{row.estimate}</span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {row.suburb}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {row.service} · {row.date}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>
                    {status.label}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          )
        })}

        {rows.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No quotes in this filter.</p>
        )}
      </div>
    </div>
  )
}
