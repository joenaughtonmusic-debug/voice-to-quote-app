"use client"

import { useState } from "react"
import { Check, ChevronDown, Plug, Bell, FileSignature, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { jmsOptions } from "@/lib/quote-data"

export function SettingsScreen() {
  const [jms, setJms] = useState(jmsOptions[0])
  const [jmsOpen, setJmsOpen] = useState(false)
  const [autoPush, setAutoPush] = useState(true)
  const [gstIncl, setGstIncl] = useState(true)

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
      </div>
    </div>
  )
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
