import type { QuoteFact } from "@/lib/core/quote-facts"
import type { ProcessedQuote } from "@/lib/processed-quote"
import { calculateRetaining } from "./calculator"
import { detectRetainingFromText } from "./detector"

function quoteTextForRetainingDetection(quote: ProcessedQuote) {
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

function retainingFactId(index: number, description: string) {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)

  return `retaining.${index}.${slug || "fact"}`
}

function confidenceForRetainingFact(confidence: string) {
  return confidence === "high" ? "high" : "medium"
}

export function retainingQuoteFactsFromProcessedQuote(quote: ProcessedQuote): QuoteFact[] {
  const sourceText = quoteTextForRetainingDetection(quote)
  const detection = detectRetainingFromText(sourceText)
  if (!detection.is_retaining || detection.request.sections.length === 0) return []

  const result = calculateRetaining(detection.request)
  const facts: QuoteFact[] = []
  const confidence = confidenceForRetainingFact(detection.confidence)

  result.sections.forEach((section, index) => {
    if (section.face_area_square_metres === null) return

    const dimensions =
      section.length_m !== null && section.height_m !== null
        ? `${section.length_m}m x ${section.height_m}m`
        : `${section.face_area_square_metres}m2`
    const description = `Retaining wall ${index + 1}: ${dimensions}, ${section.face_area_square_metres}m2 face area.`

    facts.push({
      id: retainingFactId(index, description),
      category: "job_scope",
      description,
      label: section.label,
      sourceField: "retaining.calculator.sections",
      sourceIndex: index,
      sourceText: section.source_text ?? sourceText,
      confidence,
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      quantity: section.face_area_square_metres,
      unit: "m2",
      metadata: {
        trade: "retaining",
        fact_type: "retaining_wall_section",
        length_m: section.length_m,
        height_m: section.height_m,
        square_metres: section.face_area_square_metres,
        square_metres_source: section.face_area_source,
        wall_type: result.timber_retaining ? "timber_retaining" : "retaining_wall",
        replacement: result.wall_kind === "replacement_wall",
        drainage: result.drainage_mentioned,
        posts: result.posts_mentioned,
        access_difficulty: result.access_difficulty,
        waste_removal: result.waste_removal_notes.length > 0,
      },
    })
  })

  if (result.total_face_area_square_metres !== null && result.sections.length > 1) {
    const description = `Total retaining wall face area: ${result.total_face_area_square_metres}m2.`
    facts.push({
      id: retainingFactId(result.sections.length, description),
      category: "job_scope",
      description,
      label: "Total retaining wall face area",
      sourceField: "retaining.calculator.total_face_area_square_metres",
      sourceText,
      confidence,
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      quantity: result.total_face_area_square_metres,
      unit: "m2",
      metadata: {
        trade: "retaining",
        fact_type: "total_retaining_face_area",
        square_metres: result.total_face_area_square_metres,
        wall_type: result.timber_retaining ? "timber_retaining" : "retaining_wall",
        replacement: result.wall_kind === "replacement_wall",
        drainage: result.drainage_mentioned,
        posts: result.posts_mentioned,
        access_difficulty: result.access_difficulty,
        waste_removal: result.waste_removal_notes.length > 0,
      },
    })
  }

  if (result.timber_retaining) {
    facts.push({
      id: retainingFactId(result.sections.length + facts.length, "Timber retaining noted."),
      category: "materials",
      description: "Timber retaining noted.",
      label: "Retaining material",
      sourceField: "retaining.detector.timber_retaining",
      sourceText,
      confidence,
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      metadata: {
        trade: "retaining",
        fact_type: "material_note",
        wall_type: "timber_retaining",
      },
    })
  }

  if (result.drainage_mentioned) {
    facts.push({
      id: retainingFactId(result.sections.length + facts.length, "Drainage mentioned for retaining wall."),
      category: "materials",
      description: "Drainage mentioned for retaining wall.",
      label: "Retaining drainage",
      sourceField: "retaining.detector.drainage",
      sourceText,
      confidence,
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      metadata: {
        trade: "retaining",
        fact_type: "drainage_note",
        drainage: true,
      },
    })
  }

  if (result.posts_mentioned) {
    facts.push({
      id: retainingFactId(result.sections.length + facts.length, "Posts or post holes mentioned for retaining wall."),
      category: "materials",
      description: "Posts or post holes mentioned for retaining wall.",
      label: "Retaining posts",
      sourceField: "retaining.detector.posts",
      sourceText,
      confidence,
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      metadata: {
        trade: "retaining",
        fact_type: "posts_note",
        posts: true,
      },
    })
  }

  if (result.access_difficulty) {
    facts.push({
      id: retainingFactId(result.sections.length + facts.length, "Access difficulty mentioned for retaining wall."),
      category: "site_conditions",
      description: "Access difficulty mentioned for retaining wall.",
      label: "Retaining access",
      sourceField: "retaining.detector.access_difficulty",
      sourceText,
      confidence,
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      metadata: {
        trade: "retaining",
        fact_type: "access_note",
        access_difficulty: true,
      },
    })
  }

  result.waste_removal_notes.forEach((note, index) => {
    facts.push({
      id: retainingFactId(result.sections.length + facts.length + index, note),
      category: "waste",
      description: note,
      label: "Retaining waste/removal",
      sourceField: "retaining.detector.waste_removal_notes",
      sourceIndex: index,
      sourceText: note,
      confidence: "high",
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      metadata: {
        trade: "retaining",
        fact_type: "waste_removal",
        waste_removal: true,
      },
    })
  })

  return facts
}
