// ---------------------------------------------------------------------------
// Quote build-confidence gate.
//
// The whole point: NEVER silently render a clean-looking customer quote that has
// no confident route or no price. If the job can't be confidently built, the UI
// must say so loudly ("Couldn't build this quote reliably") instead of showing a
// tidy-looking Scope/Excludes card with no price.
//
// Pure + deterministic so the decision is unit-tested; the component only binds
// the observable signals (did a trade route render? is there any price?) to it.
// ---------------------------------------------------------------------------

export type BuildConfidenceInput = {
  /** A trade assembler or the planting presentation produced a usable quote layout. */
  hasRoute: boolean
  /** At least one confident price surfaces (labour line, pricing fact, plant/material line). */
  hasPrice: boolean
  /** The job type was captured (not empty / "not captured" / "general"). */
  jobTypeRecognised: boolean
}

export type BuildConfidence = {
  canBuild: boolean
  headline: string
  reasons: string[]
}

export function assessBuildConfidence(input: BuildConfidenceInput): BuildConfidence {
  const reasons: string[] = []

  if (!input.hasRoute) {
    reasons.push("The job type wasn't confidently recognised, so no quote could be built for it.")
  }
  if (!input.hasPrice) {
    reasons.push("No price could be worked out from what was said — nothing to quote.")
  }
  // A route rendered but the job type is vague — surface it as a caution even when buildable.
  if (input.hasRoute && input.hasPrice && !input.jobTypeRecognised) {
    reasons.push("The job type is unclear — double-check it before sending.")
  }

  // Hard rule: a quote is only "built" with BOTH a confident route AND a price.
  const canBuild = input.hasRoute && input.hasPrice

  return {
    canBuild,
    headline: canBuild ? "Quote built" : "Couldn't build this quote reliably",
    reasons,
  }
}

/** Convenience for the common component inputs. */
export function jobTypeRecognised(jobType: string | null | undefined): boolean {
  const value = (jobType ?? "").trim().toLowerCase()
  return value.length > 0 && value !== "not captured" && value !== "general"
}
