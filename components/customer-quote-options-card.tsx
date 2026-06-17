"use client"

import type { CustomerQuoteOptionGroup } from "@/lib/customer-quote-options"

export function CustomerQuoteOptionsCard({ groups }: { groups: CustomerQuoteOptionGroup[] }) {
  if (groups.length === 0) return null

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Quote Options</h3>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.areaLabel} className="flex flex-col gap-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.areaLabel}</h4>
            <div className="flex flex-col gap-2">
              {group.options.map((option) => (
                <div key={option.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {option.label} — {option.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{option.quantityText}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">{option.subtotalText}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
