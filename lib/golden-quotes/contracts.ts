import type { EditableQuoteSection, ProcessedQuote, QuoteLineItem } from "../processed-quote"
import type { AuditResult, AuditStatus } from "../quote-auditor/types"

/**
 * A GoldenProjection is the set of REAL output-layer views derived from a
 * built ProcessedQuote, produced by the runner using the app's own functions
 * (customer preview render, auditor, JMS formatter, internal sections). Fixture
 * expectations are asserted against this — never against reimplemented logic.
 */
export type GoldenProjection = {
  quote: ProcessedQuote
  /** Full customer-facing preview text (renderCustomerDraftPreviewText). */
  customerText: string
  /** Which customer renderer path fired: planting-presentation | assembly | legacy. */
  rendererPath: string
  /** Real Quote Auditor result attached to the quote. */
  audit: AuditResult
  /** Matched JMS Line Items panel lines (formatMatchedJmsLineItems). */
  jmsLines: string[]
  /** Internal review editable sections (processedQuoteToEditableSections). */
  internalSections: EditableQuoteSection[]
  /** Convenience: the first labour line item, if any. */
  labourLine: QuoteLineItem | undefined
}

/** A single declarative internal-fact expectation, checked against real derived data. */
export type InternalFactExpectation = {
  label: string
  assert: (p: GoldenProjection) => boolean
  /** Human-readable actual value for reporting. */
  actual: (p: GoldenProjection) => string
}

/** A declarative matched-line-item expectation (substring match against jmsLines joined). */
export type MatchedLineExpectation = {
  label: string
  mustContain?: string[]
  mustNotContain?: string[]
}

export type AuditExpectation =
  | { kind: "pass" }
  | {
      kind: "issues"
      /** Audit issue ids that must be present. */
      mustInclude?: string[]
      /** Audit issue ids that must NOT be present. */
      mustNotInclude?: string[]
      /** Assert the final status is not this value (e.g. not "pass"). */
      statusIsNot?: AuditStatus
    }

export type GoldenQuoteFixture = {
  name: string
  transcript: string
  /**
   * Explicitly documents what is real vs mocked/stubbed in buildProcessedQuote,
   * so the harness never overstates coverage. See README in index.test.ts.
   */
  mockingNotes: string
  /** RegExp asserted against quote.job_type. */
  expectedClassification: RegExp
  customerPreviewContains: string[]
  customerPreviewMustNotContain: string[]
  internalFacts: InternalFactExpectation[]
  expectedMatchedLineItems: MatchedLineExpectation[]
  expectedAudit: AuditExpectation
  /**
   * Documented current-state failures this fixture deliberately captures rather
   * than fixes. These are asserted as "still broken" so a future fix flips the
   * test and forces the fixture to be updated.
   */
  knownFailures: string[]
  /** Builds the post-extraction ProcessedQuote (see mockingNotes). */
  buildProcessedQuote: () => ProcessedQuote
  /**
   * Optional inputs for running this quote through the REAL extracted pipeline
   * (lib/pipeline/process-transcript.ts) with mocked OpenAI deps, instead of the
   * hand-authored buildProcessedQuote(). When present, the golden runner can
   * drive the transcript through processTranscriptToQuote and assert the same
   * contract against the real deterministic processing. See runGoldenQuoteThroughPipeline.
   */
  pipeline?: {
    /** Raw AI-extraction result (before deterministic post-processing). */
    extractedQuote: unknown
    /** Raw knowledge-item context (plant library rows + labour item, top-level fields). */
    knowledgeItems: unknown[]
    /** Mocked classification result. */
    classification: { specialist: string; reason: string }
  }
}

export type ContractCheck = {
  layer: string
  name: string
  passed: boolean
  detail: string
}

export type ContractReport = {
  name: string
  rendererPath: string
  auditStatus: AuditStatus
  checks: ContractCheck[]
  passed: boolean
  knownFailures: string[]
}

function auditIssueIds(audit: AuditResult): string[] {
  return audit.issues.map((issue) => issue.id)
}

/**
 * Evaluates a fixture's declarative expectations against a real GoldenProjection.
 * Pure — performs no I/O and reimplements no domain logic; it only compares.
 */
export function evaluateContract(fixture: GoldenQuoteFixture, p: GoldenProjection): ContractReport {
  const checks: ContractCheck[] = []

  checks.push({
    layer: "classification",
    name: `job_type matches ${fixture.expectedClassification}`,
    passed: fixture.expectedClassification.test(p.quote.job_type),
    detail: `job_type="${p.quote.job_type}"`,
  })

  for (const needle of fixture.customerPreviewContains) {
    checks.push({
      layer: "customer_preview",
      name: `contains "${needle}"`,
      passed: p.customerText.includes(needle),
      detail: p.customerText.includes(needle) ? "found" : "MISSING",
    })
  }

  for (const needle of fixture.customerPreviewMustNotContain) {
    checks.push({
      layer: "customer_preview",
      name: `must not contain "${needle}"`,
      passed: !p.customerText.includes(needle),
      detail: p.customerText.includes(needle) ? "LEAKED" : "absent",
    })
  }

  for (const fact of fixture.internalFacts) {
    const passed = fact.assert(p)
    checks.push({
      layer: "internal",
      name: fact.label,
      passed,
      detail: fact.actual(p),
    })
  }

  const jmsJoined = p.jmsLines.join("\n")
  for (const expectation of fixture.expectedMatchedLineItems) {
    for (const needle of expectation.mustContain ?? []) {
      checks.push({
        layer: "matched_jms",
        name: `${expectation.label}: contains "${needle}"`,
        passed: jmsJoined.includes(needle),
        detail: jmsJoined.includes(needle) ? "found" : "MISSING",
      })
    }
    for (const needle of expectation.mustNotContain ?? []) {
      checks.push({
        layer: "matched_jms",
        name: `${expectation.label}: must not contain "${needle}"`,
        passed: !jmsJoined.includes(needle),
        detail: jmsJoined.includes(needle) ? "LEAKED" : "absent",
      })
    }
  }

  const ids = auditIssueIds(p.audit)
  if (fixture.expectedAudit.kind === "pass") {
    checks.push({
      layer: "audit",
      name: "audit status is pass",
      passed: p.audit.audit_status === "pass",
      detail: `status=${p.audit.audit_status}; issues=[${ids.join(", ")}]`,
    })
  } else {
    const exp = fixture.expectedAudit
    for (const id of exp.mustInclude ?? []) {
      checks.push({
        layer: "audit",
        name: `audit includes "${id}"`,
        passed: ids.includes(id),
        detail: ids.includes(id) ? "detected" : `NOT detected; issues=[${ids.join(", ")}]`,
      })
    }
    for (const id of exp.mustNotInclude ?? []) {
      checks.push({
        layer: "audit",
        name: `audit excludes "${id}"`,
        passed: !ids.includes(id),
        detail: ids.includes(id) ? "unexpectedly present" : "absent",
      })
    }
    if (exp.statusIsNot) {
      checks.push({
        layer: "audit",
        name: `audit status is not ${exp.statusIsNot}`,
        passed: p.audit.audit_status !== exp.statusIsNot,
        detail: `status=${p.audit.audit_status}`,
      })
    }
  }

  return {
    name: fixture.name,
    rendererPath: p.rendererPath,
    auditStatus: p.audit.audit_status,
    checks,
    passed: checks.every((c) => c.passed),
    knownFailures: fixture.knownFailures,
  }
}
