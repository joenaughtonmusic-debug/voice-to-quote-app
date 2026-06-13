import type { RetainingCalculatorResult, RetainingCustomerRenderResult } from "./types"
import type { QuoteFact } from "../../core/quote-facts"

export function renderRetainingCustomerScopeStub(result: RetainingCalculatorResult): RetainingCustomerRenderResult {
  return {
    scope: [],
    materials: [],
    waste: result.waste_removal_notes,
    warnings: result.warnings,
  }
}

function numberText(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)).toString() : null
}

function heightText(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < 1) return `${Number((value * 1000).toFixed(0))}mm`
  return `${Number(value.toFixed(2))}m`
}

function wallAction(fact: QuoteFact) {
  if (fact.metadata?.replacement === true) {
    if (fact.metadata?.wall_type === "timber_retaining") return "Replace existing timber retaining wall"
    return "Replace existing retaining wall"
  }

  if (fact.metadata?.wall_type === "timber_retaining") return "Build timber retaining wall"
  return "Build retaining wall"
}

function wallLine(fact: QuoteFact) {
  const length = numberText(fact.metadata?.length_m)
  const height = heightText(fact.metadata?.height_m)
  const squareMetres = numberText(fact.metadata?.square_metres)
  const details = [
    length && height ? `approximately ${length}m long x ${height} high` : "",
    squareMetres ? `total ${squareMetres}m²` : "",
  ].filter(Boolean)

  return `${wallAction(fact)}${details.length > 0 ? ` ${details.join(", ")}` : ""}.`
}

export function renderRetainingCustomerScopeFromQuoteFacts(facts: QuoteFact[]) {
  const retainingFacts = facts.filter((fact) => fact.metadata?.trade === "retaining")
  const wallFacts = retainingFacts.filter((fact) => fact.metadata?.fact_type === "retaining_wall_section")
  const totalFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "total_retaining_face_area")
  const drainageFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "drainage_note")
  const postsFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "posts_note")
  const accessFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "access_note")
  const wasteFacts = retainingFacts.filter((fact) => fact.metadata?.fact_type === "waste_removal")
  const lines = wallFacts.map(wallLine)

  if (wallFacts.length > 1 && typeof totalFact?.metadata?.square_metres === "number") {
    lines.push(`Total retaining wall face area approximately ${Number(totalFact.metadata.square_metres.toFixed(2))}m².`)
  }

  if (drainageFact) {
    lines.push("Include drainage behind retaining wall where specified.")
  }

  if (postsFact) {
    lines.push("Include retaining posts or post holes where specified.")
  }

  if (accessFact) {
    lines.push("Allow for noted access constraints.")
  }

  wasteFacts.forEach((fact) => {
    lines.push(`Remove ${fact.description.replace(/^remove\s+/i, "").replace(/\.$/, "")}.`)
  })

  return lines
}
