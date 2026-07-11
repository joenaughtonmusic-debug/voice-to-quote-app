"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Pause, Square, Trash2, Play, Sparkles, Radio, Waypoints, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProcessedQuote } from "@/lib/processed-quote"
import { supabase } from "@/lib/supabase"
import { isPrimaryTrade, type PrimaryTrade } from "@/lib/trade-profile"

type RecState = "idle" | "recording" | "paused" | "stopped" | "processing"
type InputMode = "record" | "paste"

export const EMPTY_TRANSCRIPT = ""
const AUDIO_CAPTURED_MESSAGE = "Audio captured. Press Process Quote to transcribe."

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

const aiStages = [
  "Transcribing...",
  "Correcting trade terms",
  "Loading quote templates",
  "Extracting client & site",
  "Identifying job scope",
  "Pricing line items",
  "Flagging low-confidence values",
]

function getSupportedMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
  return types.find((type) => MediaRecorder.isTypeSupported(type))
}

function getRecordingErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Microphone permission was blocked. Allow microphone access in your browser and try again."
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect a microphone and try again."
    }
  }

  return "Could not start microphone recording. Check your browser permissions and try again."
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getAudioFileName(blob: Blob) {
  if (blob.type.includes("mp4")) return "recording.mp4"
  if (blob.type.includes("ogg")) return "recording.ogg"
  return "recording.webm"
}

type QuoteTemplateContext = {
  id: string
  template_name: string
  category: string
  default_scope: string[]
  default_exclusions: string[]
  default_pricing_structure: string[]
  reusable_wording: string[]
  ai_prompt_rules: string[]
}

type KnowledgeItemContext = {
  source_item_id?: string
  source_system?: string
  item_code: string
  item_name: string
  item_type: string
  category: string
  description: string
  aliases: string[]
  unit: string
  sell_price: number | null
  cost_price: number | null
  account_code?: string
  sales_account_code?: string
  tax_code?: string
  tax_type?: string
  gst_rate?: number | null
  plant_name?: string
  plant_size?: string
  pot_size?: string
  spacing_mm?: number | null
  supplier?: string
  stock_status?: string
  notes?: string
  raw_import?: unknown
  pricing_role: "pricing_item" | "service_description_item" | "unknown"
  pricing_signals: string[]
}

async function loadPrimaryTradeContext(): Promise<PrimaryTrade> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return "multi_trade"

  const { data, error } = await supabase.from("profiles").select("primary_trade").eq("id", user.id).maybeSingle()
  if (error || !isPrimaryTrade(data?.primary_trade)) return "multi_trade"

  return data.primary_trade
}

type TranscriptCorrection = {
  original: string
  corrected: string
  reason: string
}

const nzPlaceNameCorrections: Array<{
  pattern: RegExp
  corrected: string
  reason: string
}> = [
  {
    pattern: /\b(tierra|tiara|terra|tear|tier)\s*(2|two|to|too)\s*peninsula\b/gi,
    corrected: "Te Atatū Peninsula",
    reason: "Likely Auckland suburb Te Atatū Peninsula.",
  },
  {
    pattern: /\bte\s+atatu\s+peninsula\b/gi,
    corrected: "Te Atatū Peninsula",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bte\s+atatu\s+south\b/gi,
    corrected: "Te Atatū South",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bmount\s+eden\b/gi,
    corrected: "Mount Eden",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bmount\s+albert\b/gi,
    corrected: "Mount Albert",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bmount\s+wellington\b/gi,
    corrected: "Mount Wellington",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bone\s+hunger\b/gi,
    corrected: "Onehunga",
    reason: "Likely Auckland suburb Onehunga.",
  },
  {
    pattern: /\bhowick\b/gi,
    corrected: "Howick",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bdevonport\b/gi,
    corrected: "Devonport",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\btitirangi\b/gi,
    corrected: "Titirangi",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bavondale\b/gi,
    corrected: "Avondale",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bnew\s+lynn\b/gi,
    corrected: "New Lynn",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bnewlin\b/gi,
    corrected: "New Lynn",
    reason: "Likely Auckland suburb New Lynn.",
  },
  {
    pattern: /\bwest\s+mere\b/gi,
    corrected: "Westmere",
    reason: "Likely Auckland suburb Westmere.",
  },
  {
    pattern: /\bgrey\s+lynn\b/gi,
    corrected: "Grey Lynn",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bponsonby\b/gi,
    corrected: "Ponsonby",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bparnell\b/gi,
    corrected: "Parnell",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bremuera\b/gi,
    corrected: "Remuera",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bkohimarama\b/gi,
    corrected: "Kohimarama",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bst\s+heliers\b/gi,
    corrected: "St Heliers",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\btakapuna\b/gi,
    corrected: "Takapuna",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bmilford\b/gi,
    corrected: "Milford",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bwhangaparaoa\b/gi,
    corrected: "Whangaparāoa",
    reason: "Normalised Auckland place-name spelling.",
  },
  {
    pattern: /\bmanurewa\b/gi,
    corrected: "Manurewa",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bpapakura\b/gi,
    corrected: "Papakura",
    reason: "Normalised Auckland suburb spelling.",
  },
  {
    pattern: /\bpukekohe\b/gi,
    corrected: "Pukekohe",
    reason: "Normalised Auckland suburb spelling.",
  },
]

function toStringArray(value: unknown, limit = 8) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, limit)
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit)
  }

  return []
}

function rawImportValue(rawImport: unknown, key: string) {
  if (!rawImport || typeof rawImport !== "object") return ""
  const value = (rawImport as Record<string, unknown>)[key]
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function rawImportFirstValue(rawImport: unknown, keys: string[]) {
  for (const key of keys) {
    const value = rawImportValue(rawImport, key)
    if (value.trim()) return value
  }

  return ""
}

function rawImportNumber(rawImport: unknown, key: string) {
  if (!rawImport || typeof rawImport !== "object") return null
  const value = (rawImport as Record<string, unknown>)[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  const cleaned = String(value ?? "").replace(/[^\d.]/g, "")
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function rawImportFirstNumber(rawImport: unknown, keys: string[]) {
  for (const key of keys) {
    const value = rawImportNumber(rawImport, key)
    if (value !== null) return value
  }

  return null
}

function applyNzPlaceNameCorrections(transcript: string) {
  let correctedTranscript = transcript
  const corrections: TranscriptCorrection[] = []

  for (const correction of nzPlaceNameCorrections) {
    correctedTranscript = correctedTranscript.replace(correction.pattern, (match) => {
      if (match === correction.corrected) return match
      corrections.push({
        original: match,
        corrected: correction.corrected,
        reason: correction.reason,
      })
      return correction.corrected
    })
  }

  return {
    correctedTranscript,
    corrections,
  }
}

function getCorrectionsApplied(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item): TranscriptCorrection | null => {
      const correction = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
      const original = typeof correction.original === "string" ? correction.original.trim() : ""
      const corrected = typeof correction.corrected === "string" ? correction.corrected.trim() : ""
      const reason = typeof correction.reason === "string" ? correction.reason.trim() : ""

      if (!original || !corrected) return null
      return { original, corrected, reason }
    })
    .filter((item): item is TranscriptCorrection => Boolean(item))
}

function correctionLines(corrections: TranscriptCorrection[]) {
  return corrections.map((correction) =>
    `${correction.original} -> ${correction.corrected}${correction.reason ? ` (${correction.reason})` : ""}`,
  )
}

function getTemplateContentArray(templateContent: unknown, key: string) {
  if (!templateContent || typeof templateContent !== "object") return []
  return toStringArray((templateContent as Record<string, unknown>)[key])
}

function inferKnowledgeItemPricingRole(item: Omit<KnowledgeItemContext, "pricing_role" | "pricing_signals">) {
  const itemType = item.item_type.toLowerCase()
  const unit = item.unit.toLowerCase()
  const name = item.item_name.toLowerCase()
  const aliases = item.aliases.join(" ").toLowerCase()
  const text = [item.item_code, item.item_name, item.item_type, item.unit, aliases].join(" ").toLowerCase()
  const pricingSignals: string[] = []
  const serviceSignals: string[] = []

  if (["labour", "material", "waste", "equipment", "plant", "chemical", "vehicle"].includes(itemType)) {
    pricingSignals.push(`item_type:${item.item_type}`)
  }

  if (/\b(hr|hrs|hour|hours|m|lm|m2|m²|sqm|m3|m³|bag|bags|each|ea|day|days|visit|visits|tonne|kg|litre|l|unit)\b/.test(unit)) {
    pricingSignals.push(`calculable_unit:${item.unit}`)
  }

  if (item.sell_price !== null) {
    pricingSignals.push("has_sell_price")
  }

  if (/\b(per|rate|hourly|charge|labour|labor|material|waste|greenwaste|hire|rental|bag|metre|meter|visit|day)\b/.test(text)) {
    pricingSignals.push("pricing_language")
  }

  if (name.length > 55 || name.split(/\s+/).length > 7) {
    serviceSignals.push("long_descriptive_name")
  }

  if (itemType === "service" || itemType === "other") {
    serviceSignals.push(`broad_item_type:${item.item_type || "other"}`)
  }

  if (!item.unit.trim()) {
    serviceSignals.push("no_unit")
  }

  if (item.sell_price === null) {
    serviceSignals.push("no_sell_price")
  }

  if (pricingSignals.length >= 2 || (pricingSignals.length >= 1 && serviceSignals.length === 0)) {
    return { pricing_role: "pricing_item" as const, pricing_signals: pricingSignals }
  }

  if (serviceSignals.length >= 2 && pricingSignals.length === 0) {
    return { pricing_role: "service_description_item" as const, pricing_signals: serviceSignals }
  }

  return {
    pricing_role: "unknown" as const,
    pricing_signals: [...pricingSignals, ...serviceSignals].slice(0, 5),
  }
}

function transcriptHasPricingLanguage(transcript: string) {
  return /\b(\d+(\.\d+)?\s*(hr|hrs|hour|hours|m|lm|m2|m²|sqm|m3|m³|bag|bags|each|ea|day|days|visit|visits)|per\s+(hour|hr|metre|meter|m|bag|each|day|visit)|charge\s*out\s*rate|use\s+\$?\d+|\$\d+(\.\d{1,2})?\s*(per|\/|an?\s+)?)/i.test(
    transcript,
  )
}

function transcriptMentionsHourlyLabour(transcript: string) {
  return /\b(hours?|hrs?|hourly|per\s+hour|full\s+day|half\s+day|people\s*(?:for|x|×)\s*\d+\s*days?|visit\s+duration|duration)\b/i.test(
    transcript,
  )
}

function hasHourlyLabourItemSignals(item: KnowledgeItemContext) {
  const text = [item.item_code, item.item_name, item.item_type, item.category, item.description, item.unit, ...item.aliases, ...item.pricing_signals]
    .join(" ")
    .toLowerCase()

  return (
    item.item_type.toLowerCase() === "labour" &&
    (/\b(labou?r\s*(hours?|hrs?)|hourly\s+labou?r|labou?r\s+amount|labou?rhrs?|hours?)\b/i.test(text) ||
      /\b(hr|hrs|hour|hours)\b/i.test(item.unit))
  )
}

type LabourTradeContext = "maintenance" | "landscaping" | "electrical" | "plumbing" | "building" | "generic"

function getLabourTradeContext(transcript: string): LabourTradeContext {
  if (/\b(landscap|retaining|paving|decking|planting|tree\s+removal|arborist|construction|excavat|basecourse|scoria|drainage\s+coil|timber|concrete)\b/i.test(transcript)) return "landscaping"
  if (/\b(maintenance|garden\s+maintenance|monthly|two-monthly|fortnightly|recurring|regular\s+service|visit\s+duration)\b/i.test(transcript)) return "maintenance"
  if (/\b(electrical|power\s*points?|downlights?|switchboard|tps|conduit|cable|rcd|lighting|led)\b/i.test(transcript)) return "electrical"
  if (/\b(plumbing|plumber|pipe|drain|tap|toilet|hot\s+water)\b/i.test(transcript)) return "plumbing"
  if (/\b(building|builder|framing|cladding|deck|joists?|bearers?)\b/i.test(transcript)) return "building"
  return "generic"
}

function labourTradePattern(trade: LabourTradeContext) {
  switch (trade) {
    case "landscaping":
      return /\b(landscap(?:e|ing)?|landscape\s*labou?r|landscaping\s*labou?r|construction\s*labou?r|retaining|paving|planting|decking|arborist|tree)\b/i
    case "maintenance":
      return /\b(garden\s+maintenance|maintenance\s*labou?r|garden\s*labou?r|gardening\s*labou?r|hourly\s*labou?r|labou?r\s*hours?|labou?rhrs?)\b/i
    case "electrical":
      return /\b(electrical\s*labou?r|electrician|sparky)\b/i
    case "plumbing":
      return /\b(plumbing\s*labou?r|plumber|drainlayer)\b/i
    case "building":
      return /\b(build(?:er|ing)?\s*labou?r|construction\s*labou?r|carpentry\s*labou?r|decking\s*labou?r)\b/i
    case "generic":
      return /\b(labou?r|hourly|hours?)\b/i
  }
}

function itemHasSpecificLabourType(item: KnowledgeItemContext, trade: LabourTradeContext) {
  if (item.item_type.toLowerCase() !== "labour" || trade === "generic") return false
  return labourTradePattern(trade).test(
    [item.item_code, item.item_name, item.category, item.description, item.unit, ...item.aliases, ...item.pricing_signals].join(" "),
  )
}

function transcriptHasPlantRequest(transcript: string) {
  return /\b(plant\s+\d+|planting|hedge\s+plant|hedge\s+plants|shrubs?|trees?|groundcovers?|metres?\s+of\s+[A-Z]?[A-Za-z]+|griselinia|ficus\s+tuffi|lomandra|buxus|pittosporum|flax)\b/i.test(
    transcript,
  )
}

function itemLooksLikeChemicalTreatment(item: KnowledgeItemContext) {
  return /\b(chemical|spray|sprays|fertili[sz]er|weedkiller|herbicide|pesticide|fungicide|soap|treatment|mavrik|copper)\b/i.test(
    [item.item_code, item.item_name, item.item_type, item.unit, ...item.aliases, ...item.pricing_signals].join(" "),
  )
}

// ---------------------------------------------------------------------------
// Word-level match scoring
//
// The full-term check (transcriptText.includes(fullItemName)) misses items
// whose name contains a specific word that appears in the transcript but not
// the full string — e.g. "90x19 Kwila Decking" when the transcript says
// "build a Kwila deck".
//
// This secondary scorer tokenises item_name and aliases into individual words
// and awards +1 for each unique meaningful word that appears (word-bounded)
// in the transcript. Noisy words (short words, address suffixes, common verbs,
// and dimension units) are excluded to avoid false positives such as "pine"
// scoring because the address is "Pine Street".
// ---------------------------------------------------------------------------

// NZ street address suffixes, common transcript verbs, and dimension units
// that would produce false positive word matches.
const WORD_MATCH_STOPWORDS = new Set([
  // Address suffix words common in NZ addresses
  "street", "avenue", "drive", "close", "place", "court", "grove",
  "terrace", "crescent", "highway", "parade", "esplanade",
  // Common verbs that appear in almost every transcript
  "build", "quote", "install", "supply", "remove", "replace", "construct",
  // Dimension unit words that appear in virtually every transcript
  "metre", "metres", "meter", "meters",
  // Overly generic nouns
  "material", "materials",
])

/**
 * Split a label into words that are meaningful enough to score:
 * length >= 5, not digits-only, and not in the stopword list.
 */
function meaningfulWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 5 && !/^\d+$/.test(w) && !WORD_MATCH_STOPWORDS.has(w))
}

/**
 * Score +1 for each unique meaningful word from item_name / aliases that
 * appears (word-bounded) in the transcript. This surfaces supplier/material
 * items whose full item name is never literally spoken.
 */
function itemWordMatchScore(item: KnowledgeItemContext, transcriptText: string): number {
  const seen = new Set<string>()
  let score = 0
  for (const source of [item.item_name, ...item.aliases]) {
    for (const word of meaningfulWords(source)) {
      if (seen.has(word)) continue
      seen.add(word)
      if (new RegExp(`\\b${word}\\b`).test(transcriptText)) {
        score += 1
      }
    }
  }
  return score
}

function normalizePlantContextText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9āēīōū.\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizePlantSizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(metres?|meters?)\b/g, "m")
    .replace(/\b(litres?|liters?)\b/g, "l")
    .replace(/\s+/g, "")
    .trim()
}

function extractRequestedPlantSizeTokens(transcript: string) {
  const tokens = Array.from(
    transcript.matchAll(/\b(\d+(?:\.\d+)?)\s*(m|metres?|meters?|l|litres?|liters?)\b/gi),
  ).map((match) => normalizePlantSizeToken(`${match[1]} ${match[2]}`))

  return Array.from(new Set(tokens))
}

function cleanPlantBaseName(value: string) {
  return normalizePlantContextText(value)
    .replace(/\b\d+(?:\.\d+)?\s*(?:l|litres?|liters?|m|metres?|meters?|mm|cm)\b/gi, " ")
    .replace(/\bpb\s*\d+\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\s*pb\b/gi, " ")
    .replace(/\bpb\b/gi, " ")
    .replace(/\b(hedge\s+plant|plant\s+grade|grade|pot|container|bag|plants?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function knowledgeItemRawText(item: KnowledgeItemContext) {
  const rawImportText =
    item.raw_import && typeof item.raw_import === "object"
      ? JSON.stringify(item.raw_import)
      : ""

  return [
    item.item_code,
    item.item_name,
    item.category,
    item.description,
    item.plant_name,
    item.plant_size,
    item.pot_size,
    item.supplier,
    item.stock_status,
    item.notes,
    ...item.aliases,
    rawImportText,
  ].join(" ")
}

function itemMatchesRequestedPlantSize(item: KnowledgeItemContext, requestedSizes: string[]) {
  if (requestedSizes.length === 0) return false

  const compactText = normalizePlantSizeToken(knowledgeItemRawText(item))
  const expandedText = knowledgeItemRawText(item).toLowerCase()

  return requestedSizes.some((size) => {
    const normalizedSize = normalizePlantSizeToken(size)
    if (compactText.includes(normalizedSize)) return true

    const metreMatch = normalizedSize.match(/^(\d+(?:\.\d+)?)m$/)
    if (metreMatch) {
      const millimetres = Math.round(Number(metreMatch[1]) * 1000)
      return Number.isFinite(millimetres) && expandedText.includes(`${millimetres}mm`)
    }

    return false
  })
}

function plantContextScore(item: KnowledgeItemContext, transcriptText: string, requestedSizes: string[]) {
  if (item.item_type.toLowerCase() !== "plant") return 0
  if (itemLooksLikeChemicalTreatment(item)) return -30

  const candidateBaseTerms = [
    item.plant_name,
    cleanPlantBaseName(item.item_name),
    ...item.aliases.map(cleanPlantBaseName),
  ]
    .filter((term): term is string => Boolean(term))
    .map(normalizePlantContextText)
    .filter((term) => term.length >= 4)

  const baseMatchScore = candidateBaseTerms.some((term) => transcriptText.includes(term)) ? 40 : 0
  const requestedSizeScore = itemMatchesRequestedPlantSize(item, requestedSizes) ? 30 : 0
  const pricedScore = item.sell_price !== null ? 4 : 0

  return baseMatchScore + requestedSizeScore + pricedScore
}

async function loadQuoteTemplateContext() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error(userError?.message ?? "Sign in before processing quote templates.")
  }

  const { data, error } = await supabase
    .from("quote_templates")
    .select("id, template_name, category, default_scope, default_exclusions, default_pricing_structure, template_content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12)

  if (error) {
    throw new Error(`Could not load quote templates: ${error.message}`)
  }

  return (data ?? []).map((template): QuoteTemplateContext => ({
    id: String(template.id ?? ""),
    template_name: String(template.template_name ?? "Untitled template"),
    category: String(template.category ?? "custom"),
    default_scope: toStringArray(template.default_scope),
    default_exclusions: toStringArray(template.default_exclusions),
    default_pricing_structure: toStringArray(template.default_pricing_structure),
    reusable_wording: getTemplateContentArray(template.template_content, "reusable_customer_wording"),
    ai_prompt_rules: getTemplateContentArray(template.template_content, "ai_prompt_rules"),
  }))
}

async function loadKnowledgeItemContext(transcript: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error(userError?.message ?? "Sign in before matching Knowledge Base items.")
  }

  const { data, error } = await supabase
      .from("knowledge_items")
      .select("id, source_system, item_code, item_name, item_type, category, description, aliases, unit, sell_price, cost_price, account_code, sales_account_code, tax_code, tax_type, gst_rate, raw_import")
    .eq("user_id", user.id)
    .limit(1000)

  if (error) {
    throw new Error(`Could not load Knowledge Base items: ${error.message}`)
  }

  const transcriptText = transcript.toLowerCase()
  const hasPricingLanguage = transcriptHasPricingLanguage(transcript)
  const hasHourlyLabourLanguage = transcriptMentionsHourlyLabour(transcript)
  const hasPlantRequest = transcriptHasPlantRequest(transcript)
  const labourTrade = getLabourTradeContext(transcript)
  const requestedPlantSizes = extractRequestedPlantSizeTokens(transcript)
  const rawFicusRows = (data ?? [])
    .filter((item) => /ficus|tuffi|tuffy/i.test([item.item_name, JSON.stringify(item.aliases ?? []), JSON.stringify(item.raw_import ?? {})].join(" ")))
    .map((item) => ({
      item_name: item.item_name,
      aliases: item.aliases,
      raw_import: item.raw_import,
      category: item.category,
      sell_price: item.sell_price,
    }))
  if (/ficus|tuffi|tuffy/i.test(transcript) || rawFicusRows.length > 0) {
    console.log("knowledge_items Ficus Tuffi records", rawFicusRows)
  }

  return (data ?? [])
    .map((item): KnowledgeItemContext => {
      const sellPrice = item.sell_price === null || item.sell_price === undefined ? null : Number(item.sell_price)
      const knowledgeItem = {
        source_item_id: String(item.id ?? ""),
        source_system: String(item.source_system ?? ""),
        item_code: String(item.item_code ?? "").trim() || rawImportFirstValue(item.raw_import, ["item_code", "Item Code", "*ItemCode", "ItemCode", "Code"]),
        item_name: String(item.item_name ?? ""),
        item_type: String(item.item_type ?? "other"),
          category: String(item.category ?? rawImportValue(item.raw_import, "category")),
          description: String(item.description ?? rawImportValue(item.raw_import, "description")),
          aliases: toStringArray(item.aliases, 12),
          unit: String(item.unit ?? ""),
          sell_price: sellPrice !== null && Number.isFinite(sellPrice) ? sellPrice : null,
          cost_price: (() => {
            const v = item.cost_price === null || item.cost_price === undefined ? null : Number(item.cost_price)
            return v !== null && Number.isFinite(v) ? v : null
          })(),
          account_code:
            String(item.account_code ?? "").trim() ||
            rawImportFirstValue(item.raw_import, ["account_code", "Account Code", "Sales Account Code", "SalesAccount"]),
          sales_account_code:
            String(item.sales_account_code ?? "").trim() ||
            rawImportFirstValue(item.raw_import, ["sales_account_code", "Sales Account Code", "SalesAccount", "Sales Account"]),
          tax_code:
            String(item.tax_code ?? "").trim() ||
            rawImportFirstValue(item.raw_import, ["tax_code", "Tax Code", "Sales Tax Rate", "SalesTaxRate"]),
          tax_type:
            String(item.tax_type ?? "").trim() ||
            rawImportFirstValue(item.raw_import, ["tax_type", "Tax Type", "Sales Tax Rate", "SalesTaxRate"]),
          gst_rate:
            typeof item.gst_rate === "number" && Number.isFinite(item.gst_rate)
              ? item.gst_rate
              : rawImportFirstNumber(item.raw_import, ["gst_rate", "GST Rate", "Sales Tax Rate", "SalesTaxRate"]),
          plant_name: rawImportFirstValue(item.raw_import, ["plant_name", "Plant Name", "Plant"]),
          plant_size: rawImportFirstValue(item.raw_import, ["plant_size", "Plant Size", "Plant Type", "Size", "Grade", "Height"]),
          pot_size: rawImportFirstValue(item.raw_import, ["pot_size", "Pot Size", "Container Size", "Size", "Grade"]),
          spacing_mm: rawImportNumber(item.raw_import, "spacing_mm"),
          supplier: rawImportValue(item.raw_import, "supplier"),
          stock_status: rawImportValue(item.raw_import, "stock_status"),
          notes: rawImportValue(item.raw_import, "quote_app_notes"),
          raw_import: item.raw_import,
        }

      return {
        ...knowledgeItem,
        ...inferKnowledgeItemPricingRole(knowledgeItem),
      }
    })
    .map((item) => {
      const terms = [item.item_code, item.item_name, ...item.aliases].map((term) => term.toLowerCase()).filter(Boolean)
      const matchScore = terms.reduce((score, term) => score + (transcriptText.includes(term) ? Math.max(2, term.split(/\s+/).length) : 0), 0)
      const commonTypeScore = ["labour", "waste", "equipment", "vehicle", "chemical"].includes(item.item_type) ? 1 : 0
      const pricingRoleScore = hasPricingLanguage && item.pricing_role === "pricing_item" ? 3 : 0
      const serviceRolePenalty = hasPricingLanguage && item.pricing_role === "service_description_item" ? -2 : 0
      const hourlyLabourScore = hasHourlyLabourLanguage && hasHourlyLabourItemSignals(item) ? 8 : 0
      const tradeLabourScore = itemHasSpecificLabourType(item, labourTrade) ? 12 : 0
      const plantCategoryPenalty = hasPlantRequest && itemLooksLikeChemicalTreatment(item) ? -20 : 0
      const plantScore = hasPlantRequest ? plantContextScore(item, transcriptText, requestedPlantSizes) : 0
      const unitScore = item.unit && transcriptText.includes(item.unit.toLowerCase()) ? 1 : 0
      const wordScore = itemWordMatchScore(item, transcriptText)

      return {
        item,
        score:
          matchScore +
          commonTypeScore +
          pricingRoleScore +
          serviceRolePenalty +
          hourlyLabourScore +
          tradeLabourScore +
          plantCategoryPenalty +
          plantScore +
          wordScore +
          unitScore,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 80)
    .map(({ item }) => item)
}

export function RecordScreen({
  initialPastedNotes = "",
  onProcess,
}: {
  initialPastedNotes?: string
  onProcess: (rawTranscript: string, correctedTranscript: string, processedQuote: ProcessedQuote) => void
}) {
  const [state, setState] = useState<RecState>("idle")
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState("")
  const [inputMode, setInputMode] = useState<InputMode>("record")
  const [pastedNotes, setPastedNotes] = useState("")
  const [stage, setStage] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [correctionWarning, setCorrectionWarning] = useState("")
  const [addedNotes, setAddedNotes] = useState("")
  const [visibilityWarning, setVisibilityWarning] = useState("")
  const transcriptRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const discardRef = useRef(false)
  const leftAppWhileRecordingRef = useRef(false)

  useEffect(() => {
    if (state !== "recording") return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [state])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  useEffect(() => {
    const notes = initialPastedNotes.trim()
    if (!notes) return

    setInputMode("paste")
    setPastedNotes(notes)
    setState("idle")
    setErrorMessage("")
    setCorrectionWarning("")
  }, [initialPastedNotes])

  useEffect(() => {
    return () => {
      stopStream()
    }
  }, [])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && (state === "recording" || state === "paused")) {
        leftAppWhileRecordingRef.current = true
        return
      }

      if (document.visibilityState === "visible" && leftAppWhileRecordingRef.current) {
        leftAppWhileRecordingRef.current = false
        setVisibilityWarning("Recording may pause when leaving the app. Add any missing details in Notes.")
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [state])

  const isLive = state === "recording" || state === "paused"
  const canProcess = state === "stopped" && Boolean(audioBlob)
  const canGenerateFromPaste = state !== "processing" && pastedNotes.trim().length > 0

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function reset() {
    mediaRecorderRef.current = null
    chunksRef.current = []
    discardRef.current = false
    stopStream()
    setState("idle")
    setSeconds(0)
    setTranscript("")
    setPastedNotes("")
    setInputMode("record")
    setStage(0)
    setAudioBlob(null)
    setErrorMessage("")
    setCorrectionWarning("")
    setAddedNotes("")
    setVisibilityWarning("")
    leftAppWhileRecordingRef.current = false
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorMessage("Audio recording is not supported in this browser.")
      return
    }

    if (state === "stopped") {
      reset()
    }

    try {
      setErrorMessage("")
      setCorrectionWarning("")
      setAudioBlob(null)
      setTranscript("")
      setStage(0)
      setSeconds(0)
      setVisibilityWarning("")
      chunksRef.current = []
      discardRef.current = false

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setErrorMessage("Recording failed. Please discard and try again.")
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        chunksRef.current = []
        stopStream()

        if (discardRef.current) {
          discardRef.current = false
          mediaRecorderRef.current = null
          setState("idle")
          setSeconds(0)
          setTranscript("")
          setStage(0)
          setAudioBlob(null)
          setErrorMessage("")
          return
        }

        mediaRecorderRef.current = null
        setAudioBlob(blob)
        setTranscript(AUDIO_CAPTURED_MESSAGE)
        setState("stopped")
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setState("recording")
    } catch (error) {
      stopStream()
      setState("idle")
      setErrorMessage(getRecordingErrorMessage(error))
    }
  }

  function pauseRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== "recording") return
    recorder.pause()
    setState("paused")
  }

  function resumeRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== "paused") return
    recorder.resume()
    setState("recording")
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === "inactive") return
    recorder.stop()
  }

  function discardRecording() {
    const recorder = mediaRecorderRef.current

    if (recorder && recorder.state !== "inactive") {
      discardRef.current = true
      recorder.stop()
      return
    }

    reset()
  }

  function toggleMainRecordingControl() {
    if (state === "idle" || state === "stopped") {
      void startRecording()
    } else if (state === "recording") {
      pauseRecording()
    } else if (state === "paused") {
      resumeRecording()
    }
  }

  function processRecording() {
    if (!audioBlob) {
      setErrorMessage("Record audio before processing a quote draft.")
      return
    }

    void transcribeAndProcess(audioBlob)
  }

  async function processTextQuote(rawTranscript: string, sourceLabel: "Voice transcript" | "Pasted notes") {
    setTranscript(rawTranscript)
    setStage(sourceLabel === "Voice transcript" ? 1 : 0)
    setCorrectionWarning("")

    let correctionResult: any = null
    try {
      const correctionResponse = await fetch("/api/correct-transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transcript: rawTranscript }),
      })

      correctionResult = await correctionResponse.json().catch(() => null)

      if (!correctionResponse.ok) {
        const message =
          typeof correctionResult?.error === "string"
            ? correctionResult.error
            : "Transcript correction failed. Continuing with the original transcript."
        setCorrectionWarning(message)
        correctionResult = {
          corrected_transcript: rawTranscript,
          corrections_applied: [],
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? `Transcript correction failed: ${error.message}. Continuing with the original transcript.`
          : "Transcript correction failed. Continuing with the original transcript."
      setCorrectionWarning(message)
      correctionResult = {
        corrected_transcript: rawTranscript,
        corrections_applied: [],
      }
    }

    if (typeof correctionResult?.warning === "string" && correctionResult.warning.trim()) {
      setCorrectionWarning(correctionResult.warning.trim())
    }

    const tradeCorrectedTranscript =
      typeof correctionResult?.corrected_transcript === "string" && correctionResult.corrected_transcript.trim()
        ? correctionResult.corrected_transcript.trim()
        : rawTranscript
    const tradeCorrections = getCorrectionsApplied(correctionResult?.corrections_applied)
    const placeCorrectionResult = applyNzPlaceNameCorrections(tradeCorrectedTranscript)
    const correctedTranscript = placeCorrectionResult.correctedTranscript
    const correctionsApplied = [...tradeCorrections, ...placeCorrectionResult.corrections]
    const correctionsText = correctionLines(correctionsApplied)

    setTranscript(correctedTranscript)
    setStage(2)

    const [templateContext, knowledgeItemContext, primaryTrade] = await Promise.all([
      loadQuoteTemplateContext(),
      loadKnowledgeItemContext(correctedTranscript),
      loadPrimaryTradeContext(),
    ])
    setStage(3)
    const notes = sourceLabel === "Voice transcript" ? addedNotes.trim() : ""
    const combinedInput =
      sourceLabel === "Voice transcript"
        ? `Voice transcript:\n${correctedTranscript}\n\nCorrections applied:\n${correctionsText.length > 0 ? correctionsText.join("\n") : "None."}\n\nAdded notes:\n${notes || "None provided."}`
        : `Pasted notes:\n${correctedTranscript}\n\nCorrections applied:\n${correctionsText.length > 0 ? correctionsText.join("\n") : "None."}`

    const quoteResponse = await fetch("/api/process-quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: combinedInput,
        template_context: templateContext,
        knowledge_item_context: knowledgeItemContext,
        primary_trade: primaryTrade,
      }),
    })

    const processedQuote = await quoteResponse.json().catch(() => null)

    if (!quoteResponse.ok) {
      const message =
        typeof processedQuote?.error === "string"
          ? processedQuote.error
          : "Quote extraction failed. Please try again."
      throw new Error(message)
    }

    if (sourceLabel === "Voice transcript" && notes && Array.isArray(processedQuote?.internal_notes)) {
      processedQuote.internal_notes = [...processedQuote.internal_notes, `Added notes:\n${notes}`]
    }

    if (sourceLabel === "Pasted notes" && Array.isArray(processedQuote?.internal_notes)) {
      processedQuote.internal_notes = [...processedQuote.internal_notes, "Input method: Paste Notes"]
    }

    if (correctionsText.length > 0 && Array.isArray(processedQuote?.internal_notes)) {
      processedQuote.internal_notes = [
        ...processedQuote.internal_notes,
        `Transcript corrections applied:\n${correctionsText.join("\n")}`,
      ]
    }

    for (let nextStage = 4; nextStage < aiStages.length; nextStage += 1) {
      setStage(nextStage)
      await sleep(500)
    }

    onProcess(rawTranscript, correctedTranscript, processedQuote as ProcessedQuote)
  }

  function processPastedNotes() {
    const rawNotes = pastedNotes.trim()
    if (!rawNotes) {
      setErrorMessage("Paste notes before generating a quote.")
      return
    }

    setErrorMessage("")
    setCorrectionWarning("")
    setStage(0)
    setState("processing")
    void processTextQuote(rawNotes, "Pasted notes").catch((error) => {
      setState("idle")
      setStage(0)
      setErrorMessage(error instanceof Error ? error.message : "Quote generation failed. Please try again.")
    })
  }

  async function transcribeAndProcess(blob: Blob) {
    setErrorMessage("")
    setCorrectionWarning("")
    setStage(0)
    setState("processing")

    try {
      const formData = new FormData()
      formData.append("audio", blob, getAudioFileName(blob))

      console.log("Calling /api/transcribe", {
        audioSize: blob.size,
        audioType: blob.type,
        formDataKey: "audio",
      })

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      })

      const result = await response.json().catch(() => null)

      console.log("Received /api/transcribe response", {
        ok: response.ok,
        status: response.status,
        result,
      })

      if (!response.ok) {
        const message =
          typeof result?.error === "string"
            ? result.error
            : "Transcription failed. Please try recording again."
        console.log("/api/transcribe returned an error", {
          status: response.status,
          error: message,
        })
        throw new Error(message)
      }

      if (typeof result?.transcript !== "string" || !result.transcript.trim()) {
        throw new Error("Transcription completed but no text was returned.")
      }

      await processTextQuote(result.transcript.trim(), "Voice transcript")
    } catch (error) {
      setState("stopped")
      setStage(0)
      setErrorMessage(error instanceof Error ? error.message : "Transcription failed. Please try again.")
    }
  }

  const statusLabel =
    state === "recording"
      ? "Listening"
      : state === "paused"
        ? "Paused"
        : state === "stopped"
          ? "Captured"
          : state === "processing"
            ? "Processing"
            : "Ready"
  const processingStages =
    inputMode === "paste" && state === "processing"
      ? ["Preparing notes...", ...aiStages.slice(1)]
      : aiStages

  return (
    <div className="relative flex min-h-full flex-col px-5 pb-4 pt-5">
      {/* Top bar */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Waypoints className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <span className="font-mono text-sm font-medium tracking-tight text-foreground">Talk to Quote</span>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium",
            state === "recording"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : state === "stopped" || state === "processing"
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              state === "recording"
                ? "bg-destructive animate-pulse"
                : state === "idle" || state === "paused"
                  ? "bg-muted-foreground"
                  : "bg-primary animate-pulse-soft",
            )}
          />
          {statusLabel}
        </span>
      </header>

      {isLive && (
        <div className="sticky top-2 z-30 mt-3 flex items-center gap-3 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              state === "recording" ? "animate-pulse bg-destructive" : "bg-muted-foreground",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {state === "recording" ? "Recording" : "Recording paused"}
            </p>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">{formatTime(seconds)}</p>
          </div>
          <button
            type="button"
            onClick={state === "recording" ? pauseRecording : resumeRecording}
            aria-label={state === "recording" ? "Pause recording" : "Resume recording"}
            title={state === "recording" ? "Pause recording" : "Resume recording"}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground active:scale-95"
          >
            {state === "recording" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Stop recording"
            title="Stop recording"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-95"
          >
            <Square className="h-4 w-4" fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={discardRecording}
            aria-label="Discard recording"
            title="Discard recording"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-destructive active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hero copy */}
      <div className="mt-7 text-center">
        <h1 className="text-balance text-[2rem] font-semibold leading-[1.1] tracking-tight text-foreground">
          {state === "processing"
            ? "Building your quote"
            : state === "stopped"
              ? "Recording captured"
              : inputMode === "paste"
                ? "Paste the job.\nGet the quote."
              : "Speak the job.\nGet the quote."}
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
          {state === "processing"
            ? "Our estimator is structuring everything you said into a priced draft."
            : inputMode === "paste"
              ? "Paste site notes, emails, texts, or builder scopes and generate the same quote draft."
            : "Walk the site, talk it through, and let the AI estimator handle the paperwork."}
        </p>
      </div>

      {state !== "processing" && !isLive && (
        <div className="mt-5 grid grid-cols-2 rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setInputMode("record")}
            className={cn(
              "rounded-lg py-2 text-sm font-medium transition-colors",
              inputMode === "record" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Record
          </button>
          <button
            type="button"
            onClick={() => setInputMode("paste")}
            className={cn(
              "rounded-lg py-2 text-sm font-medium transition-colors",
              inputMode === "paste" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Paste Notes
          </button>
        </div>
      )}

      {inputMode === "paste" && state !== "processing" && (
        <section className="mt-6">
          <label htmlFor="paste-notes" className="text-sm font-semibold text-foreground">
            Paste Notes
          </label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Paste site notes, customer emails, builder scopes, text messages, or quote requirements.
          </p>
          <textarea
            id="paste-notes"
            value={pastedNotes}
            onChange={(event) => setPastedNotes(event.target.value)}
            placeholder="Paste the quote notes here..."
            rows={12}
            className="mt-3 min-h-72 w-full resize-y rounded-xl border border-border bg-card px-3 py-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-accent"
          />
          <button
            type="button"
            disabled={!canGenerateFromPaste}
            onClick={processPastedNotes}
            className={cn(
              "relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-base font-semibold transition-all active:scale-[0.99]",
              canGenerateFromPaste
                ? "animate-shimmer bg-primary text-primary-foreground shadow-[0_0_40px_-10px] shadow-primary/50"
                : "cursor-not-allowed border border-border bg-card text-muted-foreground",
            )}
          >
            <Sparkles className="h-5 w-5" />
            Generate Quote
          </button>
        </section>
      )}

      {/* Record control */}
      {(inputMode === "record" || state === "processing") && (
      <div className="relative mt-8 flex flex-col items-center">
        <div className="bg-grid absolute inset-x-0 top-0 h-60 opacity-40 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />
        <div className="relative flex h-60 w-60 items-center justify-center">
          {(state === "recording" || state === "processing") && (
            <div className="record-glow absolute inset-0 rounded-full blur-xl animate-pulse-soft" />
          )}
          {state === "recording" && (
            <>
              <span className="absolute inline-flex h-48 w-48 rounded-full border border-primary/30 animate-ping-ring" />
              <span className="absolute inline-flex h-48 w-48 rounded-full border border-primary/20 animate-ping-ring [animation-delay:.7s]" />
            </>
          )}

          {state === "processing" ? (
            <div className="relative flex h-48 w-48 flex-col items-center justify-center rounded-full border border-primary/40 bg-card">
              <Loader2 className="h-14 w-14 animate-spin text-primary" strokeWidth={1.6} />
              <span className="mt-2 font-mono text-xs text-muted-foreground">
                {stage === 0 ? "transcribing..." : "analysing..."}
              </span>
            </div>
          ) : (
            <button
              type="button"
              aria-label={
                state === "recording" ? "Pause recording" : state === "idle" ? "Start recording" : "Resume recording"
              }
              onClick={toggleMainRecordingControl}
              className={cn(
                "group relative flex h-48 w-48 items-center justify-center rounded-full transition-all active:scale-95",
                state === "recording"
                  ? "bg-primary text-primary-foreground shadow-[0_0_60px_-12px] shadow-primary/60"
                  : "border border-border bg-card text-primary shadow-2xl shadow-black/40",
              )}
            >
              {state === "idle" && (
                <span className="absolute inset-2 rounded-full border border-primary/30 transition-colors group-hover:border-primary/60" />
              )}
              {state === "recording" ? (
                <Pause className="h-16 w-16" strokeWidth={2} />
              ) : state === "paused" ? (
                <Play className="h-16 w-16" strokeWidth={2} />
              ) : (
                <Mic className="h-16 w-16" strokeWidth={1.6} />
              )}
            </button>
          )}
        </div>

        {/* Idle hint / captured summary */}
        {state === "idle" && (
          <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">tap mic to record</p>
        )}
        {state === "stopped" && (
          <p className="mt-6 font-mono text-sm text-muted-foreground">
            <span className="text-foreground">{formatTime(seconds)}</span> captured · ready to process
          </p>
        )}
      </div>
      )}

      {errorMessage && (
        <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {visibilityWarning && (
        <p className="mt-4 rounded-xl border border-warning/50 bg-warning/20 p-3 text-sm text-warning-foreground">
          {visibilityWarning}
        </p>
      )}

      {correctionWarning && (
        <p className="mt-4 rounded-xl border border-warning/50 bg-warning/20 p-3 text-sm text-warning-foreground">
          {correctionWarning}
        </p>
      )}

      {inputMode === "record" && state !== "processing" && (
        <section className="mt-6">
          <label htmlFor="recording-notes" className="text-sm font-semibold text-foreground">
            Notes
          </label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Need to check measurements? Keep recording and add notes below without leaving the app.
          </p>
          <textarea
            id="recording-notes"
            value={addedNotes}
            onChange={(event) => setAddedNotes(event.target.value)}
            placeholder="Type or paste measurements, materials, access notes, or anything the recording may miss."
            rows={7}
            className="mt-3 max-h-64 min-h-40 w-full resize-y overflow-y-auto rounded-xl border border-border bg-card px-3 py-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-accent"
          />
        </section>
      )}

      {/* AI processing stages */}
      {state === "processing" && (
        <div className="mt-7 rounded-2xl border border-border bg-card p-4">
          <ul className="flex flex-col gap-2.5">
            {processingStages.map((label, i) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    i < stage
                      ? "border-primary bg-primary text-primary-foreground"
                      : i === stage
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {i < stage ? (
                    <Sparkles className="h-3 w-3" />
                  ) : i === stage ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                  )}
                </span>
                <span className={cn(i <= stage ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live transcript preview */}
      {inputMode === "record" && state !== "processing" && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              recording note
            </label>
            {transcript && (
              <span className="font-mono text-[11px] text-muted-foreground">{transcript.length} chars</span>
            )}
          </div>
          <div
            ref={transcriptRef}
            className="h-36 overflow-y-auto rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground"
          >
            {transcript ? (
              <p className="text-pretty">
                {transcript}
              </p>
            ) : isLive ? (
              <p className="text-muted-foreground">
                Recording audio in this browser. Live transcription is not connected yet.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Record the client, the site, and the scope of work. The transcript will appear after processing.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Secondary: record actual site visit */}
      {inputMode === "record" && state === "idle" && (
        <button
          type="button"
          onClick={() => void startRecording()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.99]"
        >
          <Radio className="h-4 w-4" />
          Record actual site visit instead
        </button>
      )}

      {/* Process button */}
      {inputMode === "record" && state !== "processing" && (
        <button
          type="button"
          disabled={!canProcess}
          onClick={processRecording}
          className={cn(
            "relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-base font-semibold transition-all active:scale-[0.99]",
            canProcess
              ? "animate-shimmer bg-primary text-primary-foreground shadow-[0_0_40px_-10px] shadow-primary/50"
              : "cursor-not-allowed border border-border bg-card text-muted-foreground",
          )}
        >
          <Sparkles className="h-5 w-5" />
          Process Quote into Draft
        </button>
      )}

      <p className="mx-auto mt-4 max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
        {inputMode === "paste"
          ? "Pasted notes still use templates, Knowledge Base, JMS item matching, and normal quote review."
          : "Speak naturally. Mention the client name, location, job scope, dimensions, and any specific materials used."}
      </p>
    </div>
  )
}
