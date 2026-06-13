import type { ProcessedQuote } from "@/lib/processed-quote"
import type { QuoteFact } from "@/lib/core/quote-facts"
import { calculateDecking } from "./calculator"
import { detectDeckingFromText } from "./detector"

function quoteTextForDeckingDetection(quote: ProcessedQuote) {
  return [
    quote.quote_title,
    quote.job_type,
    quote.primary_quote?.quote_title,
    quote.primary_quote?.job_type,
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.customer_scope ?? []),
    ...(quote.materials ?? []),
    quote.greenwaste,
    ...(quote.internal_notes ?? []),
    ...(quote.line_items ?? []).map((item) =>
      [item.item_name, item.description, item.item_type, item.match_reason].filter(Boolean).join(" "),
    ),
  ]
    .filter(Boolean)
    .join(". ")
}

function deckingFactId(index: number, description: string) {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)

  return `decking.${index}.${slug || "fact"}`
}

export function deckingQuoteFactsFromProcessedQuote(quote: ProcessedQuote): QuoteFact[] {
  const sourceText = quoteTextForDeckingDetection(quote)
  const detection = detectDeckingFromText(sourceText)
  if (!detection.is_decking || detection.request.areas.length === 0) return []

  const result = calculateDecking(detection.request)
  const facts: QuoteFact[] = []

  result.areas.forEach((area, index) => {
    if (area.square_metres === null) return

    const dimensions =
      area.length_m !== null && area.width_m !== null ? `${area.length_m}m x ${area.width_m}m` : `${area.square_metres}m2`
    const scopeText =
      area.build_scope === "full_build"
        ? `Decking area ${index + 1}: ${dimensions}, ${area.square_metres}m2, full build.`
        : area.build_scope === "decking_boards_only"
          ? `Decking area ${index + 1}: ${dimensions}, ${area.square_metres}m2, decking boards only.`
          : `Decking area ${index + 1}: ${dimensions}, ${area.square_metres}m2.`

    facts.push({
      id: deckingFactId(index, scopeText),
      category: "job_scope",
      description: scopeText,
      label: area.label,
      sourceField: "decking.calculator.areas",
      sourceIndex: index,
      sourceText: area.source_text ?? sourceText,
      confidence: detection.confidence === "high" ? "high" : "medium",
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      quantity: area.square_metres,
      unit: "m2",
      metadata: {
        trade: "decking",
        fact_type: "deck_area",
        length_m: area.length_m,
        width_m: area.width_m,
        square_metres: area.square_metres,
        square_metres_source: area.square_metres_source,
        build_scope: area.build_scope,
        subframe_needed: area.subframe_needed,
        existing_posts: area.existing_posts,
        existing_subframe: area.existing_subframe,
        board_type: area.board_type,
      },
    })
  })

  if (result.total_square_metres !== null && result.areas.length > 1) {
    const description = `Total decking area: ${result.total_square_metres}m2.`
    facts.push({
      id: deckingFactId(result.areas.length, description),
      category: "job_scope",
      description,
      label: "Total decking area",
      sourceField: "decking.calculator.total_square_metres",
      sourceText,
      confidence: detection.confidence === "high" ? "high" : "medium",
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      quantity: result.total_square_metres,
      unit: "m2",
      metadata: {
        trade: "decking",
        fact_type: "total_deck_area",
        square_metres: result.total_square_metres,
      },
    })
  }

  result.waste_removal_notes.forEach((note, index) => {
    facts.push({
      id: deckingFactId(result.areas.length + index + 1, note),
      category: "waste",
      description: note,
      label: "Decking waste/removal",
      sourceField: "decking.detector.waste_removal_notes",
      sourceIndex: index,
      sourceText: note,
      confidence: "high",
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      metadata: {
        trade: "decking",
        fact_type: "waste_removal",
      },
    })
  })

  return facts
}
