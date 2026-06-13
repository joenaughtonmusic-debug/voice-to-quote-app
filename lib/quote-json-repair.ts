export type JsonRepairResult = {
  parsed: unknown | null
  repaired: boolean
  repairedText: string
  errorMessage: string
}

export function stripMarkdownJsonWrappers(value: string) {
  return value
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

export function removeTrailingJsonCommas(value: string) {
  return value.replace(/,\s*([}\]])/g, "$1")
}

function removeUnsafeControlCharacters(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
}

function extractBalancedJsonBlocks(value: string) {
  const blocks: string[] = []
  const stack: string[] = []
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
      continue
    }

    if (char === "{" || char === "[") {
      if (stack.length === 0) start = index
      stack.push(char)
      continue
    }

    if (char !== "}" && char !== "]") continue

    const opener = stack[stack.length - 1]
    const isMatchingClose = (opener === "{" && char === "}") || (opener === "[" && char === "]")
    if (!isMatchingClose) {
      stack.length = 0
      start = -1
      continue
    }

    stack.pop()
    if (stack.length === 0 && start >= 0) {
      blocks.push(value.slice(start, index + 1))
      start = -1
    }
  }

  return blocks
}

export function extractJsonCandidates(value: string) {
  const candidates = new Set<string>()
  const stripped = removeUnsafeControlCharacters(stripMarkdownJsonWrappers(value))
  candidates.add(stripped)
  candidates.add(removeTrailingJsonCommas(stripped))

  for (const block of extractBalancedJsonBlocks(stripped)) {
    candidates.add(block)
    candidates.add(removeTrailingJsonCommas(block))
    candidates.add(stripMarkdownJsonWrappers(block))
    candidates.add(removeTrailingJsonCommas(stripMarkdownJsonWrappers(block)))
  }

  return Array.from(candidates)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
}

export function parseJsonWithRepair(value: string): JsonRepairResult {
  try {
    return {
      parsed: JSON.parse(value) as unknown,
      repaired: false,
      repairedText: value,
      errorMessage: "",
    }
  } catch (initialError) {
    let lastError = initialError instanceof Error ? initialError.message : String(initialError)

    for (const candidate of extractJsonCandidates(value)) {
      try {
        return {
          parsed: JSON.parse(candidate) as unknown,
          repaired: candidate !== value,
          repairedText: candidate,
          errorMessage: lastError,
        }
      } catch (candidateError) {
        lastError = candidateError instanceof Error ? candidateError.message : String(candidateError)
      }
    }

    return {
      parsed: null,
      repaired: false,
      repairedText: "",
      errorMessage: lastError,
    }
  }
}
