export type PlantCalculatorWarningCode =
  | "missing_quantity"
  | "missing_length"
  | "missing_spacing"
  | "invalid_quantity"
  | "invalid_length"
  | "invalid_spacing"
  | "missing_price"
  | "unresolved_plant"
  | "out_of_stock"

export type PlantCalculatorWarning = {
  code: PlantCalculatorWarningCode
  message: string
  field?: string
  severity: "info" | "warning"
}

export type PlantLibraryOption = {
  id?: string
  source_system?: string
  item_code?: string
  item_name?: string
  plant_name: string
  botanical_name?: string
  common_name?: string
  plant_size?: string
  pot_size?: string
  aliases?: string[]
  spacing_mm?: number | null
  sell_price?: number | null
  account_code?: string
  sales_account_code?: string
  tax_code?: string
  tax_type?: string
  gst_rate?: number | null
  supplier?: string
  stock_status?: string
  raw_import?: unknown
}

export type PlantLibraryMatch = {
  plant_name: string
  match_confidence: "high" | "medium" | "low" | "none"
  confidence_score?: number
  match_reason?: string
  default_spacing_mm?: number | null
  options?: PlantLibraryOption[]
  warnings?: PlantCalculatorWarning[]
}

export type PlantCalculatorRequest = {
  plant_name?: string
  spoken_quantity?: number | null
  length_m?: number | null
  spoken_spacing_mm?: number | null
  spoken_unit_sell_price?: number | null
  library_spacing_mm?: number | null
  requested_option_sizes?: string[]
  plant_library_match?: PlantLibraryMatch | null
  source_text?: string
  area_label?: string
  row_label?: string
}

export type PlantingOptionGroup = {
  option_label: string
  area_label?: string
  plant_name: string
  option_name: string
  plant_size?: string
  pot_size?: string
  plant_count: number | null
  unit_sell_price: number | null
  unit_price_source: "spoken_override" | "plant_library" | "missing"
  plant_total: number | null
  item_code?: string
  source_system?: string
  account_code?: string
  sales_account_code?: string
  tax_code?: string
  tax_type?: string
  gst_rate?: number | null
  supplier?: string
  stock_status?: string
  warnings: PlantCalculatorWarning[]
}

export type PlantCalculatorResult = {
  area_label?: string
  plant_name?: string
  plant_count: number | null
  quantity_source: "spoken_quantity" | "calculated_from_spacing" | "missing"
  length_m: number | null
  spacing_mm: number | null
  spacing_source: "spoken" | "plant_library" | "missing" | "not_required"
  formula: string | null
  library_match: PlantLibraryMatch | null
  options: Array<
    PlantLibraryOption & {
      plant_count: number | null
      unit_price: number | null
      unit_price_source: "spoken_override" | "plant_library" | "missing"
      total_price: number | null
      warnings: PlantCalculatorWarning[]
    }
  >
  option_groups: PlantingOptionGroup[]
  warnings: PlantCalculatorWarning[]
}

function cleanPlantName(value: string) {
  return value
    .replace(/^\s*(?:approximately|approx\.?|about|around)\s+/i, "")
    .replace(/^\s*(?:size|grade|pot|plant\s+size)\s+/i, "")
    .replace(/\b(?:along|by|beside|next\s+to|near|against|around|outside|inside|at|on)\s+(?:the\s+)?(?:driveway|front\s+boundary|boundary|fence|house|garage|path|pathway|wall|deck|patio|lawn|garden|section|pool|road|street|entrance|gate)\b.*$/i, "")
    .replace(/\b(hedge|row|plants?|shrubs?|trees?|at|centres?|centers?)\b.*$/i, "")
    .replace(/[.,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeRequestedSize(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(metres?|meters?)\b/g, "m")
    .replace(/\b(litres?|liters?)\b/g, "l")
    .replace(/\s+/g, "")
    .trim()
}

function isLikelyPlantName(value: string) {
  const text = cleanPlantName(value).toLowerCase()
  if (text.length < 3) return false
  if (
    /\b(lower|upper|front|side|rear|back|driveway|paver|paving|planting|area|hedge\s+row|garden\s+mix|mulch|hardfill|soil|labou?r|access|pricing|options?)\b/.test(
      text,
    )
  ) {
    return false
  }
  return /[a-z]/i.test(text)
}

function normalisePlantNameKey(value: string | undefined) {
  return cleanPlantName(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9āēīōū]/gi, "")
}

function isAreaOrDimensionContext(text: string, matchIndex: number, matchText: string) {
  const before = text.slice(Math.max(0, matchIndex - 50), matchIndex)
  const after = text.slice(matchIndex + matchText.length, matchIndex + matchText.length + 30)

  return (
    /\b(paver|paving|patio|path|pathway|deck|lawn|dimension|measure(?:ment)?|garden\s+bed)\s*[:,-]?\s*$/i.test(before) ||
    /^\s*(?:x|×|by)\s*\d+(?:\.\d+)?\s*(?:m|metres?|meters?)\b/i.test(after)
  )
}

function isPlantSizeContext(text: string, matchIndex: number, matchText: string) {
  const before = text.slice(Math.max(0, matchIndex - 45), matchIndex)
  const after = text.slice(matchIndex + matchText.length, matchIndex + matchText.length + 45)

  return (
    /\b(?:options?|sizes?|grades?|pricing|price|available|approximately|approx\.?|about|around|need\s+pricing)\s*(?:for)?\s*$/i.test(
      before,
    ) ||
    /^\s*(?:size|grade|pot|plant\s+size|litre|liter|l\b)/i.test(after)
  )
}

function optionScopeFrom(text: string, startIndex: number) {
  const after = text.slice(startIndex)
  const stopMatch = after.match(
    /\n\s*\n|\n\s*(?:labou?r|lower\s+paver|upper\s+paver|include|internal\s+note)\b|(?:^|\n)\s*(?:lower|upper|front|side|rear|back|driveway|pool|courtyard)\s+(?:planting\s+)?(?:area|hedge|boundary|planting)\s*:/i,
  )
  return stopMatch?.index === undefined ? after : after.slice(0, stopMatch.index)
}

function cleanAreaLabel(value: string) {
  const label = value
    .replace(/^\s*(?:also\s+)?(?:area|zone)\s+/i, "Area ")
    .replace(/[.:;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()

  return label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : label
}

function isAreaLabel(value: string) {
  return /\b(lower|upper|front|side|rear|back|driveway|pool|courtyard|boundary|planting|hedge|area\s*\d+|zone\s*\d+)\b/i.test(
    value,
  )
}

function formatSizeNumber(value: number) {
  return Number(value.toFixed(3)).toString()
}

function rawImportSizeValues(rawImport: unknown) {
  if (!rawImport || typeof rawImport !== "object") return []
  const record = rawImport as Record<string, unknown>
  const sizeKeyPattern = /\b(size|grade|pot|litre|liter|height|plant\s*type|container)\b/i

  return Object.entries(record)
    .filter(([key]) => sizeKeyPattern.test(key))
    .map(([, value]) => (typeof value === "string" ? value : value == null ? "" : String(value)))
    .filter(Boolean)
}

function extractRequestedOptionSizes(text: string) {
  const optionIntentMatch = text.match(
    /\b(?:provide\s+)?(?:price\s+options?|available\s+sizes?|options?|sizes?|need\s+pricing)\b\s*(?::|\bfor\b)?/i,
  )
  if (!optionIntentMatch || optionIntentMatch.index === undefined) return []
  const optionText = optionScopeFrom(text, optionIntentMatch.index + optionIntentMatch[0].length)

  const sizes = Array.from(
    optionText.matchAll(/\b(\d+(?:\.\d+)?)\s*(m|metres?|meters?|l|litres?|liters?|pb\s*\d+)\b/gi),
  )
    .filter((match) => {
      const index = match.index ?? 0
      const matchText = match[0]
      if (/^\d+(?:\.\d+)?\s*(?:m|metres?|meters?)$/i.test(matchText)) {
        return !isAreaOrDimensionContext(optionText, index, matchText)
      }
      return !isAreaOrDimensionContext(optionText, index, matchText)
    })
    .map((match) => normalizeRequestedSize(`${match[1]} ${match[2]}`))

  const sizePhraseSizes = Array.from(
    text.matchAll(/\b(?:approximately|approx\.?|about|around)?\s*(\d+(?:\.\d+)?)\s*(m|metres?|meters?|l|litres?|liters?)\s+(?:size|grade|pot|plant\s+size)\b/gi),
  ).map((match) => normalizeRequestedSize(`${match[1]} ${match[2]}`))

  return Array.from(new Set([...sizes, ...sizePhraseSizes]))
}

type AreaSegment = {
  label: string
  start: number
  end: number
}

function areaSegments(text: string): AreaSegment[] {
  const headings: Array<{ label: string; start: number }> = []
  const headingPattern =
    /(?:^|\n)\s*((?:lower|upper|front|side|rear|back|driveway|pool|courtyard)\s+(?:planting\s+)?(?:area|hedge|boundary|planting)|(?:area|zone)\s*\d+)\s*:/gi

  for (const match of text.matchAll(headingPattern)) {
    const label = cleanAreaLabel(match[1] ?? "")
    if (!label) continue
    headings.push({
      label,
      start: (match.index ?? 0) + match[0].length,
    })
  }

  return headings.map((heading, index) => ({
    ...heading,
    end: headings[index + 1]?.start ?? text.length,
  }))
}

function areaSegmentForIndex(segments: AreaSegment[], index: number) {
  return segments.find((segment) => index >= segment.start && index < segment.end) ?? null
}

function nearbyInlineAreaLabel(text: string, index: number) {
  const lineStart = text.lastIndexOf("\n", index)
  const line = text.slice(lineStart + 1, index)
  const match = line.match(/\b(lower|upper|front|side|rear|back|driveway|pool|courtyard)\s+(?:planting\s+)?(?:area|hedge|boundary|planting)\b/i)
  return match ? cleanAreaLabel(match[0]) : ""
}

function requestAreaLabel(text: string, segments: AreaSegment[], index: number, inlineLabel?: string) {
  const inline = inlineLabel ? cleanAreaLabel(`${inlineLabel} hedge`) : nearbyInlineAreaLabel(text, index)
  if (inline && isAreaLabel(inline)) return inline

  const segment = areaSegmentForIndex(segments, index)
  return segment?.label ?? ""
}

function requestedSizesForRequest(text: string, segments: AreaSegment[], index: number, fallback: string[]) {
  const segment = areaSegmentForIndex(segments, index)
  if (!segment) return fallback

  const segmentSizes = extractRequestedOptionSizes(text.slice(segment.start, segment.end))
  return segmentSizes.length > 0 ? segmentSizes : fallback
}

function plantNameFromContext(text: string, index: number, fallbackPlantName?: string) {
  const scope = optionScopeFrom(text, index).slice(0, 220)
  const optionPlantMatch = scope.match(
    /\b(?:\d+(?:\.\d+)?\s*(?:m|metres?|meters?|l|litres?|liters?|pb\s*\d+)\s*(?:,|\band\b)?\s*){1,4}([A-Za-z][A-Za-z\s.'-]{2,60}?)(?:\s*,|\s+\d|[.\n]|$)/i,
  )
  const optionPlantName = cleanPlantName(optionPlantMatch?.[1] ?? "")
  if (isLikelyPlantName(optionPlantName)) return optionPlantName

  const sizeNameMatch = scope.match(
    /\b(?:approximately|approx\.?|about|around)?\s*\d+(?:\.\d+)?\s*(?:m|metres?|meters?|l|litres?|liters?)\s+(?:size|grade|pot|plant\s+size)\s+([A-Za-z][A-Za-z\s.'-]{2,60}?)(?:\s*,|\s+\d|\s+and\b|[.\n]|$)/i,
  )
  const sizedPlantName = cleanPlantName(sizeNameMatch?.[1] ?? "")
  if (isLikelyPlantName(sizedPlantName)) return sizedPlantName

  const namedPlantMatch = scope.match(/\b(Ficus\s+Tuffi|Ficus\s+Tuffy|Griselinia|Lomandra\s+Lime\s+Tuff|Lomandra|Buxus|Pittosporum|Flax)\b/i)
  const namedPlant = cleanPlantName(namedPlantMatch?.[1] ?? "")
  if (isLikelyPlantName(namedPlant)) return namedPlant

  return isLikelyPlantName(fallbackPlantName ?? "") ? cleanPlantName(fallbackPlantName ?? "") : ""
}

function plantNameFromOptionRequest(text: string) {
  const optionIntentMatch = text.match(
    /\b(?:provide\s+)?(?:price\s+options?|available\s+sizes?|options?|sizes?|need\s+pricing)\b\s*(?::|\bfor\b)?/i,
  )
  if (!optionIntentMatch || optionIntentMatch.index === undefined) return ""

  return plantNameFromContext(text, optionIntentMatch.index + optionIntentMatch[0].length)
}

export function extractPlantCalculatorRequestsFromText(text: string): PlantCalculatorRequest[] {
  const requests: PlantCalculatorRequest[] = []
  const seen = new Set<string>()
  const requestedOptionSizes = extractRequestedOptionSizes(text)
  const segments = areaSegments(text)
  const optionRequestPlantName = plantNameFromOptionRequest(text)
  const spacingMatch = text.match(/\bat\s+(\d+(?:\.\d+)?)\s*(mm|m|metres?|meters?)\b/i)
  const spokenSpacingMm = spacingMatch
    ? spacingMatch[2].toLowerCase() === "mm"
      ? Math.round(Number(spacingMatch[1]))
      : Math.round(Number(spacingMatch[1]) * 1000)
    : null

  function addRequest(request: PlantCalculatorRequest) {
    if (!isLikelyPlantName(request.plant_name ?? "")) return
    const key = [request.area_label, normalisePlantNameKey(request.plant_name), request.spoken_quantity, request.length_m, request.spoken_spacing_mm].join(":")
    if (seen.has(key)) return
    seen.add(key)
    requests.push({
      ...request,
      requested_option_sizes: request.requested_option_sizes ?? requestedOptionSizes,
    })
  }

  const quantityPattern =
    /\b(?:plant|install|supply\s*(?:&|and)?\s*plant|supply\s*(?:&|and)?\s*install|supply\s*\/\s*install)\s+(\d+)\s+([A-Za-z][A-Za-z\s.'-]{2,60}?)(?:\s+plants?\b|\s+at\b|[.,\n]|$)/gi
  for (const match of text.matchAll(quantityPattern)) {
    const quantity = Number(match[1])
    if (!Number.isFinite(quantity)) continue
    addRequest({
      plant_name: cleanPlantName(match[2]),
      spoken_quantity: quantity,
      spoken_spacing_mm: spokenSpacingMm,
      area_label: requestAreaLabel(text, segments, match.index ?? 0),
      requested_option_sizes: requestedSizesForRequest(text, segments, match.index ?? 0, requestedOptionSizes),
      source_text: match[0].trim(),
    })
  }

  const bareQuantityPattern = /\b(\d+)\s+([A-Za-z][A-Za-z\s.'-]{2,60}?)\s+plants?\b/gi
  for (const match of text.matchAll(bareQuantityPattern)) {
    const quantity = Number(match[1])
    if (!Number.isFinite(quantity)) continue
    addRequest({
      plant_name: cleanPlantName(match[2]),
      spoken_quantity: quantity,
      spoken_spacing_mm: spokenSpacingMm,
      area_label: requestAreaLabel(text, segments, match.index ?? 0),
      requested_option_sizes: requestedSizesForRequest(text, segments, match.index ?? 0, requestedOptionSizes),
      source_text: match[0].trim(),
    })
  }

  const lengthPattern =
    /\b(?:approximately|approx\.?|about|around)?\s*(?:(lower|upper|front|back|side|left|right)\s+(?:row|hedge|area)\s*)?(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+(?:of|for|row\s+of|length\s+of)?\s*([A-Za-z][A-Za-z\s.'-]{2,60}?)(?:[.,]|\s+at\s+|\s+hedge\b|$)/gi
  for (const match of text.matchAll(lengthPattern)) {
    const lengthM = Number(match[2])
    if (!Number.isFinite(lengthM)) continue
    if (isAreaOrDimensionContext(text, match.index ?? 0, match[0])) continue
    if (isPlantSizeContext(text, match.index ?? 0, `${match[2]}m`)) continue
    addRequest({
      plant_name: cleanPlantName(match[3]),
      length_m: lengthM,
      spoken_spacing_mm: spokenSpacingMm,
      area_label: requestAreaLabel(text, segments, match.index ?? 0, match[1]),
      requested_option_sizes: requestedSizesForRequest(text, segments, match.index ?? 0, requestedOptionSizes),
      row_label: match[1] ? `${match[1]} hedge` : "Planting row",
      source_text: match[0].trim(),
    })
  }

  const inlineAreaLengthPattern =
    /\b(?:approximately|approx\.?|about|around)?\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+((?:lower|upper|front|side|rear|back|driveway|pool|courtyard)\s+(?:planting\s+)?area)\b/gi
  for (const match of text.matchAll(inlineAreaLengthPattern)) {
    const lengthM = Number(match[1])
    if (!Number.isFinite(lengthM)) continue
    if (isAreaOrDimensionContext(text, match.index ?? 0, match[0])) continue
    const existingPlantName = requests.map((request) => request.plant_name).find((name) => isLikelyPlantName(name ?? ""))
    const plantName = plantNameFromContext(text, match.index ?? 0, existingPlantName ?? optionRequestPlantName)
    addRequest({
      plant_name: plantName,
      length_m: lengthM,
      spoken_spacing_mm: spokenSpacingMm,
      area_label: cleanAreaLabel(match[2] ?? ""),
      requested_option_sizes: requestedSizesForRequest(text, segments, match.index ?? 0, requestedOptionSizes),
      row_label: cleanAreaLabel(match[2] ?? ""),
      source_text: match[0].trim(),
    })
  }

  const areaHedgeLengthPattern =
    /\b((?:lower|upper|front|side|rear|back|driveway|pool|courtyard)\s+(?:planting\s+)?area)\s*:\s*(?:approximately|approx\.?|about|around)?\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+hedge\s+row\b/gi
  for (const match of text.matchAll(areaHedgeLengthPattern)) {
    const lengthM = Number(match[2])
    if (!Number.isFinite(lengthM)) continue
    const existingPlantName = requests.map((request) => request.plant_name).find((name) => isLikelyPlantName(name ?? ""))
    const plantName = plantNameFromContext(text, match.index ?? 0, existingPlantName ?? optionRequestPlantName)
    addRequest({
      plant_name: plantName,
      length_m: lengthM,
      spoken_spacing_mm: spokenSpacingMm,
      area_label: cleanAreaLabel(match[1] ?? ""),
      requested_option_sizes: requestedSizesForRequest(text, segments, match.index ?? 0, requestedOptionSizes),
      row_label: cleanAreaLabel(match[1] ?? ""),
      source_text: match[0].trim(),
    })
  }

  const validRequests = requests
    .filter((request) => request.plant_name)
    .sort((a, b) => text.indexOf(a.source_text ?? "") - text.indexOf(b.source_text ?? ""))
  if (validRequests.length > 1) {
    return validRequests.map((request, index) => ({
      ...request,
      area_label: request.area_label || `Planting area ${index + 1}`,
    }))
  }

  return validRequests
}

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function warning(code: PlantCalculatorWarningCode, message: string, field?: string): PlantCalculatorWarning {
  return { code, message, field, severity: "warning" }
}

function optionLabel(index: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  return `Option ${alphabet[index] ?? index + 1}`
}

function optionSizeTerms(option: PlantLibraryOption) {
  return [
    option.plant_size,
    option.pot_size,
    option.plant_name,
    option.item_name,
    ...(option.aliases ?? []),
    ...rawImportSizeValues(option.raw_import),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeRequestedSize)
}

function extractSizeTokens(value: string) {
  const text = value.toLowerCase()
  const tokens = Array.from(
    text.matchAll(/\b(\d+(?:\.\d+)?)\s*(m|metres?|meters?|l|litres?|liters?)\b/gi),
  ).map((match) => normalizeRequestedSize(`${match[1]} ${match[2]}`))

  const mmTokens = Array.from(text.matchAll(/\b(\d+(?:\.\d+)?)\s*mm\b/gi)).map((match) => {
    const millimetres = Number(match[1])
    return Number.isFinite(millimetres) ? normalizeRequestedSize(`${formatSizeNumber(millimetres / 1000)} m`) : ""
  })

  const pbTokens = Array.from(text.matchAll(/\bpb\s*(\d+)\b/gi)).map((match) => normalizeRequestedSize(`${match[1]} l`))

  return Array.from(new Set([...tokens, ...mmTokens, ...pbTokens].filter(Boolean)))
}

function optionMatchesRequestedSize(option: PlantLibraryOption, size: string) {
  const normalizedSize = normalizeRequestedSize(size)
  const searchableValues = [
    option.plant_size,
    option.pot_size,
    option.plant_name,
    option.item_name,
    ...(option.aliases ?? []),
    ...rawImportSizeValues(option.raw_import),
  ].filter((value): value is string => Boolean(value))
  const sizeTokens = searchableValues.flatMap(extractSizeTokens)

  return (
    optionSizeTerms(option).some((term) => term === normalizedSize || term.includes(normalizedSize)) ||
    sizeTokens.some((term) => term === normalizedSize)
  )
}

function plantOptionKey(option: PlantLibraryOption) {
  return [
    option.id,
    option.item_code,
    option.plant_name,
    option.plant_size,
    option.pot_size,
    option.supplier,
  ]
    .filter(Boolean)
    .join(":")
    .toLowerCase()
}

function filterOptionsByRequestedSizes(options: PlantLibraryOption[], requestedSizes: string[] | undefined) {
  const normalizedRequestedSizes = Array.from(new Set((requestedSizes ?? []).map(normalizeRequestedSize).filter(Boolean)))
  if (normalizedRequestedSizes.length === 0) {
    return { options, missingSizes: [] as string[] }
  }

  const matchedOptions: PlantLibraryOption[] = []
  const missingSizes: string[] = []

  for (const size of normalizedRequestedSizes) {
    const match = options.find((option) => optionMatchesRequestedSize(option, size))
    if (match) {
      const key = plantOptionKey(match)
      if (!matchedOptions.some((option) => plantOptionKey(option) === key)) {
        matchedOptions.push(match)
      }
    } else {
      missingSizes.push(size)
    }
  }

  return { options: matchedOptions, missingSizes }
}

function getLibrarySpacing(request: PlantCalculatorRequest) {
  return request.library_spacing_mm ?? request.plant_library_match?.default_spacing_mm ?? null
}

function getSpacing(request: PlantCalculatorRequest) {
  const spokenSpacing = request.spoken_spacing_mm ?? null
  if (isPositiveNumber(spokenSpacing)) {
    return { spacing_mm: spokenSpacing, spacing_source: "spoken" as const }
  }

  const librarySpacing = getLibrarySpacing(request)
  if (isPositiveNumber(librarySpacing)) {
    return { spacing_mm: librarySpacing, spacing_source: "plant_library" as const }
  }

  return { spacing_mm: null, spacing_source: "missing" as const }
}

export function calculatePlantCount(request: PlantCalculatorRequest) {
  const warnings: PlantCalculatorWarning[] = []
  const spokenQuantity = request.spoken_quantity ?? null

  if (spokenQuantity !== null && !isPositiveNumber(spokenQuantity)) {
    warnings.push(warning("invalid_quantity", "Spoken plant quantity must be greater than zero.", "spoken_quantity"))
  }

  if (isPositiveNumber(spokenQuantity)) {
    const spacing = getSpacing(request)
    return {
      plant_count: Math.ceil(spokenQuantity),
      quantity_source: "spoken_quantity" as const,
      length_m: request.length_m ?? null,
      spacing_mm: spacing.spacing_mm,
      spacing_source: spacing.spacing_mm ? spacing.spacing_source : ("not_required" as const),
      formula: null,
      warnings,
    }
  }

  const lengthM = request.length_m ?? null
  const { spacing_mm: spacingMm, spacing_source: spacingSource } = getSpacing(request)

  if (lengthM !== null && !isPositiveNumber(lengthM)) {
    warnings.push(warning("invalid_length", "Planting length must be greater than zero.", "length_m"))
  }

  if (spacingMm !== null && !isPositiveNumber(spacingMm)) {
    warnings.push(warning("invalid_spacing", "Plant spacing must be greater than zero.", "spacing_mm"))
  }

  if (isPositiveNumber(lengthM) && isPositiveNumber(spacingMm)) {
    const validLengthM = lengthM
    const validSpacingMm = spacingMm
    const spacingM = validSpacingMm / 1000
    const plantCount = Math.ceil(validLengthM / spacingM) + 1

    return {
      plant_count: plantCount,
      quantity_source: "calculated_from_spacing" as const,
      length_m: validLengthM,
      spacing_mm: validSpacingMm,
      spacing_source: spacingSource,
      formula: `ceil(${validLengthM} / ${spacingM}) + 1`,
      warnings,
    }
  }

  if (!isPositiveNumber(lengthM)) {
    warnings.push(warning("missing_quantity", "Plant quantity or planting length is required.", "spoken_quantity"))
    warnings.push(warning("missing_length", "Planting length is required when plant quantity is not supplied.", "length_m"))
  }

  if (isPositiveNumber(lengthM) && !isPositiveNumber(spacingMm)) {
    warnings.push(warning("missing_spacing", "Spacing required to calculate plant quantity.", "spacing_mm"))
  }

  return {
    plant_count: null,
    quantity_source: "missing" as const,
    length_m: lengthM,
    spacing_mm: spacingMm,
    spacing_source: spacingSource,
    formula: null,
    warnings,
  }
}

export function calculatePlantingQuote(request: PlantCalculatorRequest): PlantCalculatorResult {
  const countResult = calculatePlantCount(request)
  const allOptions = request.plant_library_match?.options ?? []
  const { options, missingSizes } = filterOptionsByRequestedSizes(allOptions, request.requested_option_sizes)
  const resultWarnings = [...countResult.warnings]

  if (request.plant_library_match?.match_confidence === "none") {
    resultWarnings.push(
      warning("unresolved_plant", request.plant_library_match.match_reason ?? "Plant was not found in the Plant Library.", "plant_name"),
    )
  }

  if (request.plant_library_match?.warnings?.length) {
    resultWarnings.push(...request.plant_library_match.warnings)
  }

  for (const size of missingSizes) {
    resultWarnings.push(warning("unresolved_plant", `Requested plant size option "${size}" was not found in the Plant Library.`, "plant_size"))
  }

  const calculatedOptions = options.map((option) => {
    const spokenOverride = request.spoken_unit_sell_price ?? null
    const libraryPrice = option.sell_price ?? null
    const hasSpokenOverride = isPositiveNumber(spokenOverride)
    const unitPrice: number | null = hasSpokenOverride ? spokenOverride : isPositiveNumber(libraryPrice) ? libraryPrice : null
    const unitPriceSource: "spoken_override" | "plant_library" | "missing" = hasSpokenOverride
      ? "spoken_override"
      : isPositiveNumber(libraryPrice)
        ? "plant_library"
        : "missing"
    const totalPrice =
      countResult.plant_count !== null && isPositiveNumber(unitPrice)
        ? countResult.plant_count * unitPrice
        : null
    const optionWarnings: PlantCalculatorWarning[] = []

    if (countResult.plant_count === null) {
      optionWarnings.push(warning("missing_quantity", "Plant count is required before option total can be calculated."))
    }

    if (!isPositiveNumber(unitPrice)) {
      optionWarnings.push(warning("missing_price", "Plant option sell price is required before option total can be calculated."))
    }

    if (/\bout\s+of\s+stock|unavailable|sold\s+out\b/i.test(option.stock_status ?? "")) {
      optionWarnings.push(warning("out_of_stock", "Plant option is marked as out of stock.", "stock_status"))
    }

    return {
      ...option,
      plant_count: countResult.plant_count,
      unit_price: unitPrice,
      unit_price_source: unitPriceSource,
      total_price: totalPrice,
      warnings: optionWarnings,
    }
  })
  const optionGroups = calculatedOptions.map((option, index): PlantingOptionGroup => {
    const optionName = option.plant_size || option.pot_size
      ? [option.plant_name, option.plant_size || option.pot_size].filter(Boolean).join(" ")
      : option.item_name || option.plant_name

    return {
      option_label: optionLabel(index),
      area_label: request.area_label,
      plant_name: option.plant_name,
      option_name: optionName,
      plant_size: option.plant_size,
      pot_size: option.pot_size,
      plant_count: option.plant_count,
      unit_sell_price: option.unit_price,
      unit_price_source: option.unit_price_source,
      plant_total: option.total_price,
      item_code: option.item_code,
      source_system: option.source_system,
      account_code: option.account_code,
      sales_account_code: option.sales_account_code,
      tax_code: option.tax_code,
      tax_type: option.tax_type,
      gst_rate: option.gst_rate,
      supplier: option.supplier,
      stock_status: option.stock_status,
      warnings: option.warnings,
    }
  })

  return {
    area_label: request.area_label ?? request.row_label,
    plant_name: request.plant_name ?? request.plant_library_match?.plant_name,
    plant_count: countResult.plant_count,
    quantity_source: countResult.quantity_source,
    length_m: countResult.length_m,
    spacing_mm: countResult.spacing_mm,
    spacing_source: countResult.spacing_source,
    formula: countResult.formula,
    library_match: request.plant_library_match ?? null,
    options: calculatedOptions,
    option_groups: optionGroups,
    warnings: resultWarnings,
  }
}
