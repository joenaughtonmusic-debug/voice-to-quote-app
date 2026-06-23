export function hasExplicitPlantingIntent(transcript: string) {
  return /\b(?:supply\s*(?:&|and)?\s*install|supply\s+plants?|install\s+plants?|plant\s+\d+|planting\s+area|hedge\s+planting|plant\s+options?|new\s+hedge)\b/i.test(
    transcript,
  )
}

export function hasPlantingCalculatorIntent(transcript: string) {
  const text = transcript.toLowerCase()
  const explicitPlantingIntent = hasExplicitPlantingIntent(transcript)

  if (/\bno\s+planting\s+included\b|\bplanting\s+not\s+included\b|\bno\s+plants?\b|\bplants?\s+not\s+included\b/i.test(transcript) && !explicitPlantingIntent) {
    return false
  }

  if (/\b(?:one[_\s-]?off\s+)?garden\s+tidy|one[_\s-]?off[_\s-]?tidy|property\s+tidy\b/i.test(transcript) && !explicitPlantingIntent) {
    return false
  }

  if (
    /\b(?:one[-\s]?off|one\s+off)\s+(?:job|tidy|garden\s+tidy|hedge\s+work)\b|\bhedge\s+trimming\b|\bhedge[_\s-]?reduction\b|\btree[_\s-]?pruning\b/i.test(
      transcript,
    ) &&
    !explicitPlantingIntent
  ) {
    return false
  }

  if (
    /\b(?:remove|removal|cut\s+back|trim|trimming|prune|pruning|reduce|reduction|weed|weeding)\b/.test(text) &&
    /\b(?:self[-\s]?seeded\s+plants?|shrubs?|hedge|hedges?|pittosporum|griselinia)\b/.test(text) &&
    !explicitPlantingIntent
  ) {
    return false
  }

  return (
    /\b(?:plant|install|supply\s*(?:&|and)?\s*plant|supply\s*(?:&|and)?\s*install|supply\s*\/\s*install)\s+\d+\s+[A-Za-z]/i.test(
      transcript,
    ) ||
    /\b\d+(?:\.\d+)?\s*(?:m|metres?|meters?)\s+(?:of|for|row\s+of|length\s+of)?\s*[A-Za-z][A-Za-z\s.'-]{2,60}?\s+(?:hedge|row|plants?)\b/i.test(
      transcript,
    ) ||
    /\b(planting|hedge\s+planting|hedge\s+row|hedge\s+plants|shrubs?|groundcovers?|griselinia|ficus\s+tuffi|lomandra|buxus|pittosporum|flax)\b/i.test(
      transcript,
    )
  )
}
