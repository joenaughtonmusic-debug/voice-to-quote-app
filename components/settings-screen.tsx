"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Check, ChevronDown, Plug, Bell, FileSignature, Building2, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { jmsOptions } from "@/lib/quote-data"
import { QuoteTestRunner } from "@/components/quote-test-runner"
import { SiteVisitFixtureRunner } from "@/components/site-visit-fixture-runner"
import type { ProcessedQuote } from "@/lib/processed-quote"
import { primaryTradeOptions, isPrimaryTrade, type PrimaryTrade } from "@/lib/trade-profile"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/hooks/use-auth"
import {
  EXPORT_MAPPING_CATEGORIES,
  EXPORT_MAPPING_PROVIDERS,
  ITEM_CODE_POLICIES,
  compatibilityExportMapping,
  displayExportMappingCategory,
  normalizeItemCodePolicy,
  type ExportCategoryMapping,
  type ExportMappingCategory,
  type ExportMappingProvider,
  type ItemCodePolicy,
} from "@/lib/export-mappings"

export function SettingsScreen({
  onOpenQuoteReview,
  onUseFixtureTranscript,
}: {
  onOpenQuoteReview?: (raw: string, corrected: string, quote: ProcessedQuote) => void
  onUseFixtureTranscript?: (transcript: string) => void
}) {
  const { user } = useAuth()
  const [jms, setJms] = useState(jmsOptions[0])
  const [jmsOpen, setJmsOpen] = useState(false)
  const [autoPush, setAutoPush] = useState(true)
  const [gstIncl, setGstIncl] = useState(true)
  const [primaryTrade, setPrimaryTrade] = useState<PrimaryTrade>("multi_trade")
  const [tradeSaving, setTradeSaving] = useState(false)
  const [tradeMessage, setTradeMessage] = useState("")
  const [mappingProvider, setMappingProvider] = useState<ExportMappingProvider>("xero")
  const [exportMappings, setExportMappings] = useState<ExportCategoryMapping[]>(() => seededExportMappings("xero", []))
  const [mappingLoading, setMappingLoading] = useState(false)
  const [mappingSaving, setMappingSaving] = useState(false)
  const [mappingMessage, setMappingMessage] = useState("")

  useEffect(() => {
    let active = true

    async function loadPrimaryTrade() {
      if (!user) return

      const { data, error } = await supabase.from("profiles").select("primary_trade").eq("id", user.id).maybeSingle()
      if (!active) return

      if (error) {
        setTradeMessage("Add profiles.primary_trade to save this setting.")
        return
      }

      if (isPrimaryTrade(data?.primary_trade)) {
        setPrimaryTrade(data.primary_trade)
      }
    }

    void loadPrimaryTrade()

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    let active = true

    async function loadExportMappings() {
      setMappingMessage("")
      setExportMappings(seededExportMappings(mappingProvider, []))

      if (!user) {
        setMappingMessage("Sign in to save export mappings.")
        return
      }

      setMappingLoading(true)
      const { data, error } = await supabase
        .from("export_category_mappings")
        .select("id, user_id, provider, category, account_code, tax_type, export_enabled, item_code_policy, is_user_confirmed, source")
        .eq("user_id", user.id)
        .eq("provider", mappingProvider)
      if (!active) return
      setMappingLoading(false)

      if (error) {
        setMappingMessage("Add export_category_mappings schema to save these settings.")
        return
      }

      setExportMappings(seededExportMappings(mappingProvider, (data ?? []) as ExportCategoryMapping[]))
    }

    void loadExportMappings()

    return () => {
      active = false
    }
  }, [mappingProvider, user])

  async function handlePrimaryTradeChange(value: PrimaryTrade) {
    setPrimaryTrade(value)
    setTradeMessage("")

    if (!user) {
      setTradeMessage("Sign in to save your primary trade.")
      return
    }

    setTradeSaving(true)
    const { error } = await supabase.from("profiles").update({ primary_trade: value }).eq("id", user.id)
    setTradeSaving(false)

    if (error) {
      setTradeMessage("Could not save primary trade. Add profiles.primary_trade if it does not exist yet.")
      return
    }

    setTradeMessage("Primary trade saved.")
  }

  function updateExportMapping(category: ExportMappingCategory, patch: Partial<ExportCategoryMapping>) {
    setExportMappings((current) =>
      current.map((mapping) => (mapping.category === category ? { ...mapping, ...patch } : mapping)),
    )
  }

  async function handleSaveExportMappings() {
    setMappingMessage("")

    if (!user) {
      setMappingMessage("Sign in to save export mappings.")
      return
    }

    setMappingSaving(true)
    const rows = exportMappings.map((mapping) => ({
      user_id: user.id,
      provider: mappingProvider,
      category: mapping.category,
      account_code: mapping.account_code?.trim() || null,
      tax_type: mapping.tax_type?.trim() || null,
      export_enabled: mapping.export_enabled ?? true,
      item_code_policy: normalizeItemCodePolicy(mapping.item_code_policy),
      is_user_confirmed: true,
      source: "user",
    }))
    const { error } = await supabase
      .from("export_category_mappings")
      .upsert(rows, { onConflict: "user_id,provider,category" })
    setMappingSaving(false)

    if (error) {
      setMappingMessage("Could not save export mappings. Add export_category_mappings if it does not exist yet.")
      return
    }

    setExportMappings(seededExportMappings(mappingProvider, rows as ExportCategoryMapping[]))
    setMappingMessage("Export mappings saved.")
  }

  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Integration &amp; quote defaults</p>
      </header>

      <div className="flex flex-col gap-6 pb-4">
        {/* JMS Integration */}
        <Segment icon={<Plug className="h-4 w-4" />} title="Job Management System">
          <div className="relative">
            <button
              type="button"
              onClick={() => setJmsOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-xl border border-input bg-background px-4 py-3 text-sm font-medium text-foreground"
            >
              {jms}
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", jmsOpen && "rotate-180")} />
            </button>
            {jmsOpen && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                {jmsOptions.map((opt) => (
                  <li key={opt}>
                    <button
                      type="button"
                      onClick={() => {
                        setJms(opt)
                        setJmsOpen(false)
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm text-foreground hover:bg-secondary"
                    >
                      {opt}
                      {opt === jms && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span className="text-sm font-medium text-accent-foreground">Connected to {jms}</span>
            <span className="ml-auto text-xs text-muted-foreground">Synced 4m ago</span>
          </div>
        </Segment>

        {/* Business profile */}
        <Segment icon={<Building2 className="h-4 w-4" />} title="Business profile">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <Field label="Business name" value="Kauri & Co. Property Maintenance" />
            <Field label="GST number" value="122-445-908" />
            <Field label="Default hourly rate" value="$65.00 / hr" last />
          </div>
        </Segment>

        <Segment icon={<FileSignature className="h-4 w-4" />} title="Export mappings">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <label className="text-sm font-medium text-foreground" htmlFor="export-provider">
                  Export system
                </label>
                <select
                  id="export-provider"
                  value={mappingProvider}
                  onChange={(event) => setMappingProvider(event.target.value as ExportMappingProvider)}
                  className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm text-foreground outline-none focus:border-primary sm:w-48"
                >
                  {EXPORT_MAPPING_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleSaveExportMappings}
                disabled={mappingSaving || mappingLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {mappingSaving ? "Saving..." : "Save mappings"}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning-foreground">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Imported item metadata still wins. These rows are fallback mappings only; seeded values are compatibility defaults until you save and confirm them.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {exportMappings.map((mapping) => {
                const category = mapping.category as ExportMappingCategory
                return (
                  <div key={category} className="rounded-xl border border-border bg-background p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{displayExportMappingCategory(category)}</h3>
                        <p className="text-xs text-muted-foreground">
                          {mapping.is_user_confirmed ? "User-confirmed fallback" : "Compatibility seed, not yet confirmed"}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={mapping.export_enabled ?? true}
                          onChange={(event) => updateExportMapping(category, { export_enabled: event.target.checked })}
                          className="h-4 w-4 rounded border-input"
                        />
                        Export
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="text-xs font-medium text-muted-foreground">
                        Account code
                        <input
                          value={mapping.account_code ?? ""}
                          onChange={(event) => updateExportMapping(category, { account_code: event.target.value })}
                          placeholder="Choose account"
                          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                        />
                      </label>
                      <label className="text-xs font-medium text-muted-foreground">
                        Tax type
                        <input
                          value={mapping.tax_type ?? ""}
                          onChange={(event) => updateExportMapping(category, { tax_type: event.target.value })}
                          placeholder="OUTPUT2"
                          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                        />
                      </label>
                      <label className="text-xs font-medium text-muted-foreground">
                        Item code policy
                        <select
                          value={normalizeItemCodePolicy(mapping.item_code_policy)}
                          onChange={(event) => updateExportMapping(category, { item_code_policy: event.target.value as ItemCodePolicy })}
                          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                        >
                          {ITEM_CODE_POLICIES.map((policy) => (
                            <option key={policy} value={policy}>
                              {policy.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>

            {(mappingLoading || mappingMessage) && (
              <p className={cn("mt-3 text-xs", mappingMessage.includes("saved") ? "text-success" : "text-muted-foreground")}>
                {mappingLoading ? "Loading export mappings..." : mappingMessage}
              </p>
            )}
          </div>
        </Segment>

        <Segment icon={<Building2 className="h-4 w-4" />} title="Trade profile">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <label className="text-sm font-medium text-foreground" htmlFor="primary-trade">
              Primary trade
            </label>
            <select
              id="primary-trade"
              value={primaryTrade}
              onChange={(event) => {
                const value = event.target.value
                if (isPrimaryTrade(value)) void handlePrimaryTradeChange(value)
              }}
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm text-foreground outline-none focus:border-primary"
            >
              {primaryTradeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Used as a strong signal when quote transcripts are ambiguous. Clear transcript/template evidence can still override it.
            </p>
            {(tradeSaving || tradeMessage) && (
              <p className={cn("mt-2 text-xs", tradeMessage.includes("saved") ? "text-success" : "text-muted-foreground")}>
                {tradeSaving ? "Saving primary trade..." : tradeMessage}
              </p>
            )}
          </div>
        </Segment>

        {/* Toggles */}
        <Segment icon={<FileSignature className="h-4 w-4" />} title="Quote defaults">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <Toggle
              icon={<FileSignature className="h-4 w-4" />}
              label="Show prices GST-inclusive"
              desc="Display totals with 15% GST included"
              on={gstIncl}
              onClick={() => setGstIncl((v) => !v)}
            />
            <div className="border-t border-border" />
            <Toggle
              icon={<Bell className="h-4 w-4" />}
              label="Auto-push approved quotes"
              desc={`Send 'Ready' quotes straight to ${jms}`}
              on={autoPush}
              onClick={() => setAutoPush((v) => !v)}
            />
          </div>
        </Segment>

        <Segment icon={<AlertTriangle className="h-4 w-4" />} title="Internal test tools">
          <div className="space-y-4">
            <SiteVisitFixtureRunner onUseTranscript={onUseFixtureTranscript} />
            <QuoteTestRunner onOpenQuoteReview={onOpenQuoteReview} />
          </div>
        </Segment>
      </div>
    </div>
  )
}

function seededExportMappings(provider: ExportMappingProvider, savedRows: ExportCategoryMapping[]) {
  return EXPORT_MAPPING_CATEGORIES.map((category) => {
    const seed = { ...compatibilityExportMapping(category), provider }
    const saved = savedRows.find((row) => row.category === category)
    return {
      ...seed,
      ...saved,
      provider,
      category,
      export_enabled: saved?.export_enabled ?? seed.export_enabled,
      item_code_policy: normalizeItemCodePolicy(saved?.item_code_policy ?? seed.item_code_policy),
      is_user_confirmed: saved?.is_user_confirmed ?? false,
      source: saved?.source ?? seed.source,
    }
  })
}

function Segment({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-2.5", !last && "border-b border-border")}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function Toggle({
  icon,
  label,
  desc,
  on,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  desc: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  )
}
