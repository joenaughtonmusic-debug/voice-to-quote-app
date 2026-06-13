import type {
  DeckingAreaRequest,
  DeckingAreaResult,
  DeckingCalculatorRequest,
  DeckingCalculatorResult,
  DeckingExistingStructureStatus,
  DeckingWarning,
} from "./types"

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function positiveNumberOrNull(value: number | null | undefined): number | null {
  return isPositiveNumber(value) ? value : null
}

function roundedSquareMetres(value: number) {
  return Number(value.toFixed(2))
}

function normaliseStatus(value: DeckingExistingStructureStatus | undefined): DeckingExistingStructureStatus {
  return value ?? "unknown"
}

function labelForArea(area: DeckingAreaRequest, index: number) {
  return area.label?.trim() || `Deck area ${index + 1}`
}

function warningsForArea(area: DeckingAreaRequest, result: Pick<DeckingAreaResult, "build_scope" | "subframe_needed">) {
  const warnings: DeckingWarning[] = []

  if (area.length_m == null) {
    warnings.push({
      code: "missing_length",
      message: "Deck length is missing.",
      field: "length_m",
      severity: "warning",
    })
  } else if (!isPositiveNumber(area.length_m)) {
    warnings.push({
      code: "invalid_length",
      message: "Deck length must be greater than zero.",
      field: "length_m",
      severity: "warning",
    })
  }

  if (area.width_m == null) {
    warnings.push({
      code: "missing_width",
      message: "Deck width is missing.",
      field: "width_m",
      severity: "warning",
    })
  } else if (!isPositiveNumber(area.width_m)) {
    warnings.push({
      code: "invalid_width",
      message: "Deck width must be greater than zero.",
      field: "width_m",
      severity: "warning",
    })
  }

  if (result.build_scope === "unknown") {
    warnings.push({
      code: "scope_unclear",
      message: "Decking scope is unclear. Confirm whether this is a full build or decking boards only.",
      field: "build_scope",
      severity: "info",
    })
  }

  if (result.subframe_needed === "unknown") {
    warnings.push({
      code: "subframe_status_unclear",
      message: "Subframe status is unclear. Confirm whether a new subframe is required.",
      field: "subframe_needed",
      severity: "info",
    })
  }

  return warnings
}

function calculateArea(area: DeckingAreaRequest, index: number): DeckingAreaResult {
  const length = positiveNumberOrNull(area.length_m)
  const width = positiveNumberOrNull(area.width_m)
  const providedSquareMetres = positiveNumberOrNull(area.square_metres)
  const calculatedSquareMetres = length !== null && width !== null ? roundedSquareMetres(length * width) : null
  const squareMetres = calculatedSquareMetres ?? (providedSquareMetres !== null ? roundedSquareMetres(providedSquareMetres) : null)
  const squareMetresSource = calculatedSquareMetres !== null ? "calculated" : providedSquareMetres !== null ? "provided" : "missing"
  const existingPosts = normaliseStatus(area.existing_posts)
  const existingSubframe = normaliseStatus(area.existing_subframe)
  const buildScope =
    area.build_scope ??
    (existingPosts === "yes" || existingSubframe === "yes" ? "decking_boards_only" : "unknown")
  const subframeNeeded =
    area.subframe_needed ??
    (buildScope === "full_build" ? "yes" : buildScope === "decking_boards_only" || existingSubframe === "yes" ? "no" : "unknown")

  const result: DeckingAreaResult = {
    id: area.id ?? `deck-area-${index + 1}`,
    label: labelForArea(area, index),
    length_m: length,
    width_m: width,
    square_metres: squareMetres,
    square_metres_source: squareMetresSource,
    board_type: area.board_type?.trim() || null,
    build_scope: buildScope,
    subframe_needed: subframeNeeded,
    existing_posts: existingPosts,
    existing_subframe: existingSubframe,
    existing_framing_notes: area.existing_framing_notes ?? [],
    source_text: area.source_text,
    formula: calculatedSquareMetres !== null ? `${length}m x ${width}m = ${calculatedSquareMetres}m2` : null,
    warnings: [],
  }

  return {
    ...result,
    warnings: warningsForArea(area, result),
  }
}

export function calculateDecking(request: DeckingCalculatorRequest): DeckingCalculatorResult {
  const areas = request.areas.map(calculateArea)
  const validAreas = areas
    .map((area) => area.square_metres)
    .filter((area): area is number => typeof area === "number" && Number.isFinite(area))
  const totalSquareMetres = validAreas.length > 0 ? roundedSquareMetres(validAreas.reduce((sum, area) => sum + area, 0)) : null

  return {
    areas,
    total_square_metres: totalSquareMetres,
    waste_removal_notes: request.waste_removal_notes ?? [],
    warnings: areas.flatMap((area) => area.warnings),
  }
}
