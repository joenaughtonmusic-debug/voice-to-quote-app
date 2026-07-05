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
      suggested_fix: "Add topsoil/lawn establishment to scope; add a soil-volume calculator (6 × 16.8 × 0.05 = 5.04m³).",
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
      suggested_fix: "Map the spoken lawn seed (and its $129 price) to a material line item.",
      can_auto_correct: false,
    })
  }

  // ── 4. Optional Ficus hedge missing, or present but never calculated/warned ─
  const transcriptMentionsFicusHedge =
    /\bficus\b/i.test(transcript) || /\bhedge\b[^.]*\bfence\b|\bfence\b[^.]*\bhedge\b/i.test(transcript)
  if (transcriptMentionsFicusHedge) {
    const optionalText = (quote.optional_quotes ?? [])
      .flatMap((option) => [option.quote_title, ...(option.scope ?? [])])
      .join("\n")
    const hedgeInOptional = /\bficus\b/i.test(optionalText) || /\bhedge\b/i.test(optionalText)
    const hasPlantCalc = (quote.plant_calculator_results ?? []).length > 0
    const hasHedgeWarning = [...(quote.confidence_warnings ?? []), ...(quote.missing_information ?? [])].some((entry) =>
      /ficus|hedge|plant\s+count|spacing/i.test(entry),
    )

    if (!hedgeInOptional) {
      issues.push({
        id: "V06-optional-hedge-missing",
        severity: "warning",
        category: "customer_preview",
        message: "Transcript requests an optional Ficus hedge but it is not represented in optional works.",
        evidence: firstSentence(transcript, /[^.]*ficus[^.]*\./i) ?? "Ficus hedge in transcript",
        expected: "An optional works entry for the Ficus hedge.",
        actual: "No hedge in optional works.",
        suggested_fix: "Capture the optional hedge as an optional works item.",
        can_auto_correct: false,
      })
    } else if (!hasPlantCalc && !hasHedgeWarning) {
      issues.push({
        id: "V06-optional-hedge-unwarned",
        severity: "warning",
        category: "customer_preview",
        message: "Optional Ficus hedge is present but has no plant-count/spacing calculation and no warning that they are missing.",
        evidence: firstSentence(optionalText, /[^\n]*(?:ficus|hedge)[^\n]*/i) ?? "hedge in optional works",
        expected: "Plant count/spacing calculated, or an explicit warning that they are missing.",
        actual: "Hedge present with no calculation and no warning.",
        suggested_fix: "Run the planting calculator on the optional hedge, or emit a missing plant-count/spacing warning.",
        can_auto_correct: false,
      })
    }
  }

  return issues
}
