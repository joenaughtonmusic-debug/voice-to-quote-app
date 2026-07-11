import type { AuditContext, AuditIssue } from "../types"

// Decking artefacts that must never appear in customer-facing scope.
const DECKING_SCOPE_LEAK_PATTERN = /plant\s+multiple\s+deck\s+area\s+\d+[^\n]*|deck\s+area\s+\d+|decking\s+boards?/i

function firstSentence(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern)
  return match?.[0]?.replace(/\s+/g, " ").trim()
}

/**
 * V06 — Customer preview safety / missing major scope (detection only).
 *
 * Reads the customer-facing scope fields on the ProcessedQuote (customer_scope,
 * primary/optional scope, materials) — the same data that feeds the preview — so
 * detection is identical whether run in the route or the golden runner. Does NOT
 * attempt to regenerate a correct preview.
 */
export function v06CustomerPreviewSafety(ctx: AuditContext): AuditIssue[] {
  const issues: AuditIssue[] = []
  const { processedQuote: quote } = ctx
  const transcript = ctx.rawTranscript ?? ""

  const customerFacing = [
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.optional_quotes ?? []).flatMap((option) => option.scope ?? []),
    ...(quote.materials ?? []),
  ]
  const customerText = [ctx.customerPreviewText ?? "", ...customerFacing].join("\n")

  // ── 1. Decking artefacts leaked into customer-facing scope ────────────────
  const deckLeak = firstSentence(customerText, DECKING_SCOPE_LEAK_PATTERN)
  if (deckLeak) {
    issues.push({
      id: "V06-decking-scope-leak",
      severity: "error",
      category: "customer_preview",
      message: "Customer preview scope contains decking calculator artefacts ('Deck area' / 'Decking boards') on a non-decking quote.",
      evidence: deckLeak,
      expected: "Real job scope with no 'Deck area' / 'Decking boards' text.",
      actual: deckLeak,
      suggested_fix: "Remove decking calculator output (see V04) before assembling the customer preview.",
      can_auto_correct: false,
    })
  }

  // ── 2. Topsoil / lawn establishment described but omitted from the preview ─
  const transcriptMentionsTopsoil =
    /\btopsoil\b/i.test(transcript) ||
    /\blawn\s+(?:seed|mix|establishment|levelling|leveling)\b/i.test(transcript) ||
    /levelling\s+the\s+[^.]*\blawn\b/i.test(transcript)
  const previewMentionsTopsoil =
    /\btopsoil\b/i.test(customerText) ||
    /\blawn\s+(?:seed|mix|establishment|levelling|leveling|area)\b/i.test(customerText)
  if (transcriptMentionsTopsoil && !previewMentionsTopsoil) {
    issues.push({
      id: "V06-missing-topsoil-lawn-scope",
      severity: "error",
      category: "customer_preview",
      message: "Transcript describes topsoil / lawn establishment but the customer preview omits it entirely.",
      evidence: firstSentence(transcript, /[^.]*\b(?:topsoil|levelling the back lawn|lawn)\b[^.]*\./i) ?? "topsoil / lawn establishment in transcript",
      expected: "Customer scope should include importing/spreading topsoil and lawn establishment.",
      actual: "No topsoil / lawn establishment in customer scope.",
      suggested_fix: "Add topsoil/lawn establishment to scope; compute the soil volume from the stated area and depth.",
      can_auto_correct: false,
    })
  }

  // ── 3. Lawn seed spoken but omitted ───────────────────────────────────────
  const transcriptMentionsLawnSeed = /\blawn\s+seed\b/i.test(transcript)
  const previewMentionsLawnSeed = /\blawn\s+seed\b/i.test(customerText)
  if (transcriptMentionsLawnSeed && !previewMentionsLawnSeed) {
    issues.push({
      id: "V06-missing-lawn-seed",
      severity: "warning",
      category: "customer_preview",
      message: "Transcript mentions lawn seed but it is absent from the customer preview / materials.",
      evidence: firstSentence(transcript, /[^.]*lawn\s+seed[^.]*\./i) ?? "lawn seed in transcript",
      expected: "Lawn seed represented in materials/scope (with its spoken price where given).",
      actual: "Lawn seed missing from customer-facing output.",
      suggested_fix: "Map the spoken lawn seed (and any spoken price) to a material line item.",
      can_auto_correct: false,
    })
  }

  // ── 4. An optional work the customer asked to be quoted must be represented ──
  // GENERAL property (names no specific plant, price or trade): if the transcript
  // requests an optional/additional work, the quote must represent it in optional
  // works (or a follow-up task) or raise a warning that it was not captured.
  // Fixture-specific expectations (e.g. that a particular optional work is a specific
  // plant that still needs a count/spacing) belong in the golden fixture's contract,
  // not in a general validator.
  const transcriptRequestsOptionalWork =
    /\boptional\s+(?:price|quote|works?|extra|add-?on|item)\b/i.test(transcript) ||
    /\bas\s+an?\s+option\b/i.test(transcript) ||
    /\boption\s+(?:for|to)\s+(?:also\s+)?(?:add|include|do|plant|install|build|price|quote|supply)\b/i.test(transcript)
  if (transcriptRequestsOptionalWork) {
    const hasOptionalRepresentation =
      (quote.optional_quotes ?? []).length > 0 || (quote.follow_up_tasks ?? []).length > 0
    const hasOptionalWarning = [
      ...(quote.confidence_warnings ?? []),
      ...(quote.missing_information ?? []),
    ].some((entry) => /\boption(?:al)?\b/i.test(entry))

    if (!hasOptionalRepresentation && !hasOptionalWarning) {
      issues.push({
        id: "V06-optional-work-missing",
        severity: "warning",
        category: "customer_preview",
        message: "Transcript requests an optional/additional work but the quote neither represents it in optional works nor raises a warning about it.",
        evidence: firstSentence(transcript, /[^.]*\boption(?:al)?\b[^.]*\./i) ?? "optional work in transcript",
        expected: "The requested optional work represented in optional works (or a follow-up task), or an explicit warning that it was not captured.",
        actual: "No optional works, follow-up tasks, or optional-related warning present.",
        suggested_fix: "Capture the requested optional work as an optional works item, or warn that it was not captured.",
        can_auto_correct: false,
      })
    }
  }

  return issues
}
