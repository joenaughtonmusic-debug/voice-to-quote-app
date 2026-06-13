"use client"

import { type ReactNode, useMemo, useState } from "react"
import { CheckCircle2, Clipboard, FileText, FlaskConical, XCircle } from "lucide-react"
import { analyseSiteVisitTranscriptFixture, siteVisitTranscriptFixtures } from "@/lib/test-fixtures/site-visit-transcripts"
import type {
  ExpectedMeasurement,
  ExpectedNonEvent,
  ExpectedReviewNotice,
  SiteVisitTranscriptFixture,
} from "@/lib/test-fixtures/site-visit-transcripts"
import { cn } from "@/lib/utils"

type FixtureResult = ReturnType<typeof analyseSiteVisitTranscriptFixture>

export function SiteVisitFixtureRunner({
  onUseTranscript,
}: {
  onUseTranscript?: (transcript: string) => void
}) {
  const [selectedFixtureId, setSelectedFixtureId] = useState(siteVisitTranscriptFixtures[0]?.id ?? "")
  const [copyMessage, setCopyMessage] = useState("")

  const selectedFixture = useMemo(
    () => siteVisitTranscriptFixtures.find((fixture) => fixture.id === selectedFixtureId) ?? siteVisitTranscriptFixtures[0],
    [selectedFixtureId],
  )
  const result = useMemo(
    () => (selectedFixture ? analyseSiteVisitTranscriptFixture(selectedFixture.transcript) : null),
    [selectedFixture],
  )
  const comparison = useMemo(
    () => (selectedFixture && result ? compareFixture(selectedFixture, result) : []),
    [selectedFixture, result],
  )
  const passed = comparison.every((item) => item.passed)

  async function copyTranscript() {
    if (!selectedFixture) return

    try {
      await navigator.clipboard.writeText(selectedFixture.transcript)
      setCopyMessage("Transcript copied.")
    } catch {
      setCopyMessage("Copy failed. Select the transcript text manually.")
    }
  }

  if (!selectedFixture || !result) {
    return null
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FlaskConical className="h-4 w-4 text-primary" />
            Site Visit Fixture Runner
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Internal deterministic runner for realistic transcript fixtures. Selection does not call AI services.
          </p>
        </div>
        <StatusPill passed={passed} />
      </div>

      <div className="space-y-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="site-fixture">
          Fixture
        </label>
        <select
          id="site-fixture"
          value={selectedFixture.id}
          onChange={(event) => {
            setSelectedFixtureId(event.target.value)
            setCopyMessage("")
          }}
          className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm text-foreground outline-none focus:border-primary"
        >
          {siteVisitTranscriptFixtures.map((fixture) => (
            <option key={fixture.id} value={fixture.id}>
              {fixture.expected.tradeCategory} - {fixture.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          {siteVisitTranscriptFixtures.map((fixture) => {
            const active = fixture.id === selectedFixture.id
            return (
              <button
                key={fixture.id}
                type="button"
                onClick={() => {
                  setSelectedFixtureId(fixture.id)
                  setCopyMessage("")
                }}
                className={cn(
                  "min-h-16 rounded-xl border px-3 py-2 text-left transition-colors",
                  active ? "border-primary/50 bg-accent text-primary" : "border-border bg-background text-foreground hover:bg-secondary",
                )}
              >
                <span className="block text-xs font-semibold">{fixture.expected.tradeCategory}</span>
                <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{fixture.name}</span>
              </button>
            )
          })}
        </div>

        <div className="grid gap-3">
          <SummaryRow label="Expected category" value={selectedFixture.expected.tradeCategory} />
          <SummaryRow label="Detected category" value={result.tradeCategory} />
          <SummaryRow label="Client" value={result.clientName ?? "Not detected"} />
          <SummaryRow label="Address" value={result.address.cleaned_address ?? "Not detected"} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copyTranscript}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-semibold text-foreground"
          >
            <Clipboard className="h-4 w-4" />
            Copy transcript
          </button>
          <button
            type="button"
            onClick={() => onUseTranscript?.(selectedFixture.transcript)}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground"
          >
            <FileText className="h-4 w-4" />
            Use in quote flow
          </button>
        </div>
        {copyMessage && <p className="text-xs text-muted-foreground">{copyMessage}</p>}

        <FixturePanel title="Transcript">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {selectedFixture.transcript}
          </pre>
        </FixturePanel>

        <FixturePanel title="Comparison">
          <div className="space-y-1">
            {comparison.map((item) => (
              <p key={item.label} className={cn("flex items-start gap-2 text-xs", item.passed ? "text-success" : "text-destructive")}>
                {item.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>{item.label}</span>
              </p>
            ))}
          </div>
        </FixturePanel>

        <FixturePanel title="Detected measurements">
          {result.measurements.length > 0 ? (
            <div className="space-y-1">
              {result.measurements.map((measurement) => (
                <p key={measurement.id} className="text-xs text-muted-foreground">
                  {measurement.source_text}: {measurement.value}
                  {measurement.unit !== "unknown" ? measurement.unit : ""} · {measurement.dimension}
                  {measurement.approximate ? " · approximate" : ""}
                  {measurement.uncertain ? " · uncertain" : ""}
                  {measurement.unit_inferred ? " · inferred unit" : ""}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No deterministic measurements detected.</p>
          )}
        </FixturePanel>

        <FixturePanel title="Detected facts">
          {result.facts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {result.facts.map((fact) => (
                <span key={fact} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {fact}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No facts detected.</p>
          )}
        </FixturePanel>

        <FixturePanel title="Review notices">
          {result.reviewNotices.length > 0 ? (
            <div className="space-y-2">
              {result.reviewNotices.map((notice) => (
                <div key={notice.id} className="rounded-lg border border-border bg-background p-2">
                  <p className="text-xs font-semibold text-foreground">{notice.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{notice.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No review notices.</p>
          )}
        </FixturePanel>
      </div>
    </section>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-semibold text-foreground">{value}</span>
    </div>
  )
}

function FixturePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  )
}

function StatusPill({ passed }: { passed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold",
        passed ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {passed ? "Pass" : "Review"}
    </span>
  )
}

function compareFixture(fixture: SiteVisitTranscriptFixture, result: FixtureResult) {
  const comparisons: Array<{ label: string; passed: boolean }> = [
    {
      label: `Category is ${fixture.expected.tradeCategory}`,
      passed: result.tradeCategory === fixture.expected.tradeCategory,
    },
  ]

  for (const expectedMeasurement of fixture.expected.measurements ?? []) {
    comparisons.push({
      label: `Measurement ${measurementLabel(expectedMeasurement)} detected`,
      passed: result.measurements.some((measurement) => measurementMatches(measurement, expectedMeasurement)),
    })
  }

  for (const expectedNotice of fixture.expected.reviewNotices ?? []) {
    comparisons.push({
      label: `Review notice ${noticeLabel(expectedNotice)} detected`,
      passed: result.reviewNotices.some((notice) => noticeMatches(notice, expectedNotice)),
    })
  }

  for (const expectedNote of fixture.expected.exclusionsOrNotes ?? []) {
    comparisons.push({
      label: `Exclusion/note "${expectedNote}" detected`,
      passed: result.exclusionsOrNotes.some((note) => includesText(note, expectedNote)),
    })
  }

  for (const expectedFact of fixture.expected.facts ?? []) {
    comparisons.push({
      label: `Fact "${expectedFact}" detected`,
      passed: result.facts.includes(expectedFact),
    })
  }

  for (const nonEvent of fixture.expected.nonEvents ?? []) {
    comparisons.push({
      label: `Non-event "${nonEventLabel(nonEvent)}" did not happen`,
      passed: !nonEventHappened(result, nonEvent),
    })
  }

  return comparisons
}

function measurementMatches(actual: FixtureResult["measurements"][number], expected: ExpectedMeasurement) {
  return (
    actual.value === expected.value &&
    (expected.unit === undefined || actual.unit === expected.unit) &&
    (expected.dimension === undefined || actual.dimension === expected.dimension) &&
    (expected.approximate === undefined || actual.approximate === expected.approximate) &&
    (expected.uncertain === undefined || actual.uncertain === expected.uncertain) &&
    (expected.unit_inferred === undefined || actual.unit_inferred === expected.unit_inferred)
  )
}

function noticeMatches(actual: FixtureResult["reviewNotices"][number], expected: ExpectedReviewNotice) {
  return (
    (expected.id === undefined || actual.id === expected.id) &&
    (expected.messageIncludes === undefined || includesText(actual.message, expected.messageIncludes)) &&
    (expected.trade === undefined || actual.metadata?.trade === expected.trade) &&
    (expected.category === undefined || actual.category === expected.category) &&
    (expected.severity === undefined || actual.severity === expected.severity)
  )
}

function nonEventHappened(result: FixtureResult, nonEvent: ExpectedNonEvent) {
  if (nonEvent.fact && result.facts.includes(nonEvent.fact)) return true
  if (
    typeof nonEvent.measurementValue === "number" &&
    result.measurements.some((measurement) => measurement.value === nonEvent.measurementValue)
  ) {
    return true
  }

  return result.reviewNotices.some((notice) => {
    if (nonEvent.id && notice.id !== nonEvent.id) return false
    if (nonEvent.messageIncludes && !includesText(notice.message, nonEvent.messageIncludes)) return false
    if (nonEvent.trade && notice.metadata?.trade !== nonEvent.trade) return false
    if (nonEvent.category && notice.category !== nonEvent.category) return false
    return Boolean(nonEvent.id || nonEvent.messageIncludes || nonEvent.trade || nonEvent.category)
  })
}

function includesText(actual: string, expected: string) {
  return actual.toLowerCase().includes(expected.toLowerCase())
}

function measurementLabel(measurement: ExpectedMeasurement) {
  return `${measurement.value}${measurement.unit ?? ""}`
}

function noticeLabel(notice: ExpectedReviewNotice) {
  return notice.id ?? notice.messageIncludes ?? notice.trade ?? "expected notice"
}

function nonEventLabel(nonEvent: ExpectedNonEvent) {
  return nonEvent.id ?? nonEvent.fact ?? nonEvent.messageIncludes ?? String(nonEvent.measurementValue ?? "expected non-event")
}
