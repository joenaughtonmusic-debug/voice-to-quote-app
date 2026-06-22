"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ChevronRight, ImageIcon, Loader2, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { loadDraftPhotoCountsForDrafts } from "@/lib/draft-photos"

const filters = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs Review" },
  { id: "ready", label: "Ready" },
] as const

type Filter = (typeof filters)[number]["id"]

type QuoteDraftRow = {
  id: string
  client_name: string | null
  site_address: string | null
  job_type: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

const statusStyles: Record<"ready" | "review", { label: string; className: string }> = {
  ready: { label: "Ready to Send", className: "bg-accent text-success" },
  review: { label: "Needs Review", className: "bg-warning/40 text-warning-foreground" },
}

function getStatusKey(status: string | null) {
  const normalized = status?.toLowerCase().replace(/[_-]/g, " ") ?? ""
  if (normalized.includes("ready")) return "ready"
  return "review"
}

function formatDate(value: string | null) {
  if (!value) return "Not set"

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function DraftsScreen({
  onOpen,
  refreshKey = 0,
}: {
  onOpen: (draftId: string) => void
  refreshKey?: number
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const [drafts, setDrafts] = useState<QuoteDraftRow[]>([])
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    let active = true

    async function fetchDrafts() {
      setLoading(true)
      setErrorMessage("")

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!active) return

      if (userError || !user) {
        setDrafts([])
        setLoading(false)
        setErrorMessage(userError?.message ?? "Sign in to view quote drafts.")
        return
      }

      const { data, error } = await supabase
        .from("quote_drafts")
        .select("id, client_name, site_address, job_type, status, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (!active) return

      if (error) {
        setDrafts([])
        setErrorMessage(error.message)
      } else {
        const rows = data ?? []
        setDrafts(rows)

        if (rows.length > 0) {
          const counts = await loadDraftPhotoCountsForDrafts(rows.map((r) => r.id))
          if (active) setPhotoCounts(counts)
        }
      }

      setLoading(false)
    }

    void fetchDrafts()

    return () => {
      active = false
    }
  }, [refreshKey])

  const rows = useMemo(
    () => drafts.filter((draft) => filter === "all" || getStatusKey(draft.status) === filter),
    [drafts, filter],
  )

  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Drafts</h1>
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading quote drafts..." : `${drafts.length} saved quote drafts`}
        </p>
      </header>

      {/* Filter bar */}
      <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 no-scrollbar">
        {filters.map((f) => {
          const count = f.id === "all" ? drafts.length : drafts.filter((r) => getStatusKey(r.status) === f.id).length
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
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading drafts
          </div>
        )}

        {!loading && errorMessage && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {rows.map((row) => {
          const status = statusStyles[getStatusKey(row.status)]
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpen(row.id)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-shadow active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-foreground">{row.client_name || "Untitled client"}</p>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>
                    {row.status || status.label}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {row.site_address || "No site address"}
                </p>
                <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                  <p className="truncate">{row.job_type || "No job type"}</p>
                  <p className="truncate">Created {formatDate(row.created_at)}</p>
                  <p className="truncate">Updated {formatDate(row.updated_at)}</p>
                  {(photoCounts[row.id] ?? 0) > 0 && (
                    <p className="flex items-center gap-1">
                      <ImageIcon className="h-3 w-3 shrink-0" />
                      {photoCounts[row.id]} photo{photoCounts[row.id] === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          )
        })}

        {!loading && !errorMessage && rows.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {drafts.length === 0 ? "No quote drafts saved yet." : "No quotes in this filter."}
          </p>
        )}
      </div>
    </div>
  )
}
