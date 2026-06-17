import type { QuoteFact } from "@/lib/core/quote-facts"
import type { ProcessedQuote } from "@/lib/processed-quote"
import { calculatePaving } from "./calculator"
import { detectPavingFromText } from "./detector"

function quoteTextForPavingDetection(quote: ProcessedQuote) {
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

function pavingFactId(index: number, description: string) {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)

  return `paving.${index}.${slug || "fact"}`
}

export function pavingQuoteFactsFromProcessedQuote(quote: ProcessedQuote): QuoteFact[] {
  const sourceText = quoteTextForPavingDetection(quote)
  const detection = detectPavingFromText(sourceText)
  if (!detection.is_paving || detection.request.areas.length === 0) return []

  const result = calculatePaving(detection.request)
  const facts: QuoteFact[] = []

  result.areas.forEach((area, index) => {
    if (area.paved_area_m2 === null) return

    const dimensions =
      area.length_m !== null && area.width_m !== null
        ? `${area.length_m}m x ${area.width_m}m`
        : `${area.paved_area_m2}m2`

    const scopeText =
      area.install_scope === "replacement"
        ? `Paving area ${index + 1}: ${dimensions}, ${area.paved_area_m2}m2, replacement.`
        : `Paving area ${index + 1}: ${dimensions}, ${area.paved_area_m2}m2.`

    facts.push({
      id: pavingFactId(index, scopeText),
      category: "job_scope",
      description: scopeText,
      label: area.label,
      sourceField: "paving.calculator.areas",
      sourceIndex: index,
      sourceText: area.source_text ?? sourceText,
      confidence: detection.confidence === "high" ? "high" : "medium",
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      quantity: area.paved_area_m2,
      unit: "m2",
      metadata: {
        trade: "paving",
        fact_type: "paving_area",
        length_m: area.length_m,
        width_m: area.width_m,
        paved_area_m2: area.paved_area_m2,
        paved_area_source: area.paved_area_source,
        paver_length_mm: area.paver_length_mm,
        paver_width_mm: area.paver_width_mm,
        paver_type: area.paver_type,
        paver_count: area.paver_count,
        base_course_volume_m3: area.base_course_volume_m3,
        bedding_sand_volume_m3: area.bedding_sand_volume_m3,
        estimated_labour_hours: area.estimated_labour_hours,
        install_scope: area.install_scope,
        waste_factor_percent: area.waste_factor_percent,
      },
    })
  })

  if (result.total_paved_area_m2 !== null && result.areas.length > 1) {
    const description = `Total paving area: ${result.total_paved_area_m2}m2.`
    facts.push({
      id: pavingFactId(result.areas.length, description),
      category: "job_scope",
      description,
      label: "Total paving area",
      sourceField: "paving.calculator.total_paved_area_m2",
      sourceText,
      confidence: detection.confidence === "high" ? "high" : "medium",
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      quantity: result.total_paved_area_m2,
      unit: "m2",
      metadata: {
        trade: "paving",
        fact_type: "total_paving_area",
        paved_area_m2: result.total_paved_area_m2,
        total_paver_count: result.total_paver_count,
        total_base_course_volume_m3: result.total_base_course_volume_m3,
        total_bedding_sand_volume_m3: result.total_bedding_sand_volume_m3,
        total_estimated_labour_hours: result.total_estimated_labour_hours,
      },
    })
  }

  result.waste_removal_notes.forEach((note, index) => {
    facts.push({
      id: pavingFactId(result.areas.length + index + 1, note),
      category: "waste",
      description: note,
      label: "Paving waste/removal",
      sourceField: "paving.detector.waste_removal_notes",
      sourceIndex: index,
      sourceText: note,
      confidence: "high",
      customerFacing: false,
      internalVisible: true,
      exportable: false,
      metadata: {
        trade: "paving",
        fact_type: "waste_removal",
      },
    })
  })

  return facts
}
