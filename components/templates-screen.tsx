"use client"

import { useState } from "react"
import { ChevronDown, Plus, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { serviceTemplates } from "@/lib/quote-data"

export function TemplatesScreen() {
  const [open, setOpen] = useState<string | null>("decking")

  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Templates</h1>
          <p className="text-sm text-muted-foreground">Baseline rates, inclusions &amp; exclusions</p>
        </div>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm active:scale-95"
          aria-label="Add template"
        >
          <Plus className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-col gap-3 pb-4">
        {serviceTemplates.map((tpl) => {
          const isOpen = open === tpl.id
          return (
            <div key={tpl.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : tpl.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors",
                  isOpen && "bg-accent",
                )}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{tpl.name}</p>
                  <p className="text-sm font-medium text-primary">{tpl.rate}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{tpl.baseline}</p>
                </div>
                <ChevronDown
                  className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                />
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 py-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Included by default
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {tpl.inclusions.map((inc) => (
                          <li key={inc} className="flex items-start gap-2 text-sm text-foreground">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            {inc}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Default exclusions
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {tpl.exclusions.map((exc) => (
                          <li key={exc} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                            {exc}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-4 w-full rounded-xl border border-border bg-background py-2.5 text-sm font-semibold text-foreground active:scale-[0.99]"
                  >
                    Edit template
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
