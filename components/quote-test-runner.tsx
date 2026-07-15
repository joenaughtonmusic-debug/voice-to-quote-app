"use client"

import { useEffect, useMemo, useState } from "react"
import { Bug, CheckCircle2, ChevronDown, FileText, Loader2, Play, Plus, Save, XCircle } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import type { ProcessedQuote } from "@/lib/processed-quote"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { isPrimaryTrade, type PrimaryTrade } from "@/lib/trade-profile"
import { resolveLabourExportPrice } from "@/lib/export/labour-line-builder"

type Industry =
  | "Gardening / Maintenance"
  | "Landscaping"
  | "Building"
  | "Electrical"
  | "Plumbing"
  | "Painting"
  | "Cleaning"
  | "Arborist"

type SavedTestCase = {
  id: string
  test_name: string
  industry: Industry
  transcript: string
  expected_client_name: string
  expected_site_address: string
  expected_job_type: string
  expected_template_name: string
  expected_line_items: string
  expected_missing_info: string
}

type TestResult = {
  id: string
  name: string
  rawTranscript: string
  correctedTranscript: string
  quote: ProcessedQuote | null
  error: string
  checks: Array<{ label: string; passed: boolean; skipped?: boolean }>
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
  item_code: string
  item_name: string
  item_type: string
  category: string
  description: string
  aliases: string[]
  unit: string
  sell_price: number | null
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

const industries: Industry[] = [
  "Gardening / Maintenance",
  "Landscaping",
  "Building",
  "Electrical",
  "Plumbing",
  "Painting",
  "Cleaning",
  "Arborist",
]

const savedTestsKey = "voicequote.debug.savedTests"

const defaultForm: SavedTestCase = {
  id: "",
  test_name: "",
  industry: "Gardening / Maintenance",
  transcript: "",
  expected_client_name: "",
  expected_site_address: "",
  expected_job_type: "",
  expected_template_name: "",
  expected_line_items: "",
  expected_missing_info: "",
}

const placeCorrections = [
  { pattern: /\bnewlin\b/gi, corrected: "New Lynn", reason: "Likely Auckland suburb New Lynn." },
  { pattern: /\b(tierra|tiara|terra|tear|tier)\s*(2|two|to|too)\s*peninsula\b/gi, corrected: "Te Atatū Peninsula", reason: "Likely Auckland suburb Te Atatū Peninsula." },
  { pattern: /\bte\s+atatu\s+peninsula\b/gi, corrected: "Te Atatū Peninsula", reason: "Normalised Auckland suburb spelling." },
  { pattern: /\bte\s+atatu\s+south\b/gi, corrected: "Te Atatū South", reason: "Normalised Auckland suburb spelling." },
  { pattern: /\bnew\s+lynn\b/gi, corrected: "New Lynn", reason: "Normalised Auckland suburb spelling." },
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
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function getTemplateContentArray(templateContent: unknown, key: string) {
  if (!templateContent || typeof templateContent !== "object") return []
  return toStringArray((templateContent as Record<string, unknown>)[key])
}

function applyPlaceCorrections(transcript: string) {
  let correctedTranscript = transcript
  const corrections: string[] = []

  for (const correction of placeCorrections) {
    correctedTranscript = correctedTranscript.replace(correction.pattern, (match) => {
      if (match === correction.corrected) return match
      corrections.push(`${match} -> ${correction.corrected} (${correction.reason})`)
      return correction.corrected
    })
  }

  return { correctedTranscript, corrections }
}

function parsePastedTests(value: string) {
  return value
    .split(/\n(?:---|### Test)\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function includesText(actual: string | undefined | null, expected: string) {
  if (!expected.trim()) return true
  return String(actual ?? "").toLowerCase().includes(expected.trim().toLowerCase())
}

function lineItemsText(quote: ProcessedQuote) {
  return quote.line_items
    .map((item) => [item.item_code, item.item_name, item.description, item.quantity, item.rate, item.total].filter(Boolean).join(" "))
    .join("\n")
}

function buildChecks(test: SavedTestCase, quote: ProcessedQuote | null) {
  if (!quote) return []

  const expectedLineItems = getLines(test.expected_line_items)
  const expectedMissing = getLines(test.expected_missing_info)
  const lineText = lineItemsText(quote)
  const missingText = quote.missing_information.join("\n")

  return [
    {
      label: "client matched",
      passed: includesText(quote.client_name, test.expected_client_name),
      skipped: !test.expected_client_name.trim(),
    },
    {
      label: "address matched",
      passed: includesText(quote.site_address, test.expected_site_address),
      skipped: !test.expected_site_address.trim(),
    },
    {
      label: "job type matched",
      passed: includesText(quote.job_type, test.expected_job_type),
      skipped: !test.expected_job_type.trim(),
    },
    {
      label: "template matched",
      passed: includesText(quote.selected_template_name, test.expected_template_name),
      skipped: !test.expected_template_name.trim(),
    },
    {
      label: "expected line items found",
      passed: expectedLineItems.every((item) => includesText(lineText, item)),
      skipped: expectedLineItems.length === 0,
    },
    {
      label: "missing info flagged",
      passed: expectedMissing.every((item) => includesText(missingText, item)),
      skipped: expectedMissing.length === 0,
    },
  ]
}

function resultPassed(result: TestResult) {
  if (result.error || !result.quote) return false
  const activeChecks = result.checks.filter((check) => !check.skipped)
  if (activeChecks.length === 0) return true
  return activeChecks.every((check) => check.passed)
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

  if (item.sell_price !== null) pricingSignals.push("has_sell_price")

  if (/\b(per|rate|hourly|charge|labour|labor|material|waste|greenwaste|hire|rental|bag|metre|meter|visit|day)\b/.test(text)) {
    pricingSignals.push("pricing_language")
  }

  if (name.length > 55 || name.split(/\s+/).length > 7) serviceSignals.push("long_descriptive_name")
  if (itemType === "service" || itemType === "other") serviceSignals.push(`broad_item_type:${item.item_type || "other"}`)
  if (!item.unit.trim()) serviceSignals.push("no_unit")
  if (item.sell_price === null) serviceSignals.push("no_sell_price")

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

export function QuoteTestRunner({ onOpenQuoteReview }: { onOpenQuoteReview?: (raw: string, corrected: string, quote: ProcessedQuote) => void }) {
  const { user, loading: authLoading } = useAuth()
  const [mode, setMode] = useState<"paste" | "saved">("paste")
  const [pasteValue, setPasteValue] = useState("")
  const [savedTests, setSavedTests] = useState<SavedTestCase[]>([])
  const [form, setForm] = useState<SavedTestCase>(defaultForm)
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const stored = window.localStorage.getItem(savedTestsKey)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) setSavedTests(parsed)
    } catch {
      setSavedTests([])
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(savedTestsKey, JSON.stringify(savedTests))
  }, [savedTests])

  const groupedTests = useMemo(
    () =>
      industries.map((industry) => ({
        industry,
        tests: savedTests.filter((test) => test.industry === industry),
      })),
    [savedTests],
  )

  function updateForm(key: keyof SavedTestCase, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function saveTestCase() {
    if (!form.test_name.trim() || !form.transcript.trim()) {
      setErrorMessage("Add a test name and transcript before saving.")
      return
    }

    const nextTest = { ...form, id: form.id || crypto.randomUUID() }
    setSavedTests((current) => {
      const exists = current.some((test) => test.id === nextTest.id)
      return exists ? current.map((test) => (test.id === nextTest.id ? nextTest : test)) : [nextTest, ...current]
    })
    setForm(defaultForm)
    setErrorMessage("")
  }

  function editTestCase(test: SavedTestCase) {
    setForm(test)
    setMode("saved")
  }

  function deleteTestCase(testId: string) {
    setSavedTests((current) => current.filter((test) => test.id !== testId))
  }

  async function loadQuoteTemplateContext() {
    const { data, error } = await supabase
      .from("quote_templates")
      .select("id, template_name, category, default_scope, default_exclusions, default_pricing_structure, template_content")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false })
      .limit(12)

    if (error) throw new Error(`Could not load quote templates: ${error.message}`)

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
    const { data, error } = await supabase
      .from("knowledge_items")
      .select("item_code, item_name, item_type, category, description, aliases, unit, sell_price, raw_import")
      .eq("user_id", user?.id)
      .limit(1000)

    if (error) throw new Error(`Could not load Knowledge Base items: ${error.message}`)

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
          item_code: String(item.item_code ?? ""),
          item_name: String(item.item_name ?? ""),
          item_type: String(item.item_type ?? "other"),
          category: String(item.category ?? rawImportValue(item.raw_import, "category")),
          description: String(item.description ?? rawImportValue(item.raw_import, "description")),
          aliases: toStringArray(item.aliases, 12),
          unit: String(item.unit ?? ""),
          sell_price: sellPrice !== null && Number.isFinite(sellPrice) ? sellPrice : null,
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
            unitScore,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map(({ item }) => item)
  }

  async function processTranscript(transcript: string) {
    const correctionResponse = await fetch("/api/correct-transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    })
    const correctionResult = await correctionResponse.json().catch(() => null)

    if (!correctionResponse.ok) {
      throw new Error(typeof correctionResult?.error === "string" ? correctionResult.error : "Transcript correction failed.")
    }

    const tradeCorrected =
      typeof correctionResult?.corrected_transcript === "string" && correctionResult.corrected_transcript.trim()
        ? correctionResult.corrected_transcript.trim()
        : transcript
    const placeCorrection = applyPlaceCorrections(tradeCorrected)
    const correctedTranscript = placeCorrection.correctedTranscript
    const correctionsApplied = [
      ...toStringArray(
        Array.isArray(correctionResult?.corrections_applied)
          ? correctionResult.corrections_applied.map((item: Record<string, string>) =>
              `${item.original ?? ""} -> ${item.corrected ?? ""}${item.reason ? ` (${item.reason})` : ""}`,
            )
          : [],
        20,
      ),
      ...placeCorrection.corrections,
    ]

    const [templateContext, knowledgeItemContext, primaryTrade] = await Promise.all([
      loadQuoteTemplateContext(),
      loadKnowledgeItemContext(correctedTranscript),
      loadPrimaryTradeContext(),
    ])
    const combinedInput = `Voice transcript:\n${correctedTranscript}\n\nCorrections applied:\n${correctionsApplied.length > 0 ? correctionsApplied.join("\n") : "None."}\n\nAdded notes:\nNone provided.`

    const quoteResponse = await fetch("/api/process-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: combinedInput,
        template_context: templateContext,
        knowledge_item_context: knowledgeItemContext,
        primary_trade: primaryTrade,
      }),
    })
    const quote = await quoteResponse.json().catch(() => null)

    if (!quoteResponse.ok) {
      throw new Error(typeof quote?.error === "string" ? quote.error : "Quote extraction failed.")
    }

    return { correctedTranscript, quote: quote as ProcessedQuote }
  }

  async function runTests(tests: Array<{ id: string; name: string; transcript: string; saved?: SavedTestCase }>) {
    if (!user) {
      setErrorMessage("Sign in before running quote tests.")
      return
    }

    setRunning(true)
    setErrorMessage("")
    setResults([])

    const nextResults: TestResult[] = []
    for (const test of tests) {
      try {
        const processed = await processTranscript(test.transcript)
        const checks = test.saved ? buildChecks(test.saved, processed.quote) : []
        nextResults.push({
          id: test.id,
          name: test.name,
          rawTranscript: test.transcript,
          correctedTranscript: processed.correctedTranscript,
          quote: processed.quote,
          error: "",
          checks,
        })
      } catch (error) {
        nextResults.push({
          id: test.id,
          name: test.name,
          rawTranscript: test.transcript,
          correctedTranscript: "",
          quote: null,
          error: error instanceof Error ? error.message : "Test failed.",
          checks: [],
        })
      }
      setResults([...nextResults])
    }

    setRunning(false)
  }

  function runPastedTests() {
    const tests = parsePastedTests(pasteValue).map((transcript, index) => ({
      id: `paste-${Date.now()}-${index}`,
      name: `Pasted Test ${index + 1}`,
      transcript,
    }))

    if (tests.length === 0) {
      setErrorMessage("Paste at least one transcript.")
      return
    }

    void runTests(tests)
  }

  function runSavedTest(test: SavedTestCase) {
    void runTests([{ id: test.id, name: test.test_name, transcript: test.transcript, saved: test }])
  }

  function runAllSavedTests() {
    if (savedTests.length === 0) {
      setErrorMessage("Add at least one saved test case.")
      return
    }
    void runTests(savedTests.map((test) => ({ id: test.id, name: test.test_name, transcript: test.transcript, saved: test })))
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Bug className="h-4 w-4 text-primary" />
            Testing / Debug
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Development-only quote extraction tests. Uses correction, templates, Knowledge Base, and JMS items.
          </p>
        </div>
        {running && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </div>

      {authLoading ? (
        <p className="text-sm text-muted-foreground">Checking auth...</p>
      ) : !user ? (
        <p className="text-sm text-muted-foreground">Sign in to run quote tests.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex rounded-xl bg-secondary p-1">
            {[
              { id: "paste", label: "Quick Paste Tests" },
              { id: "saved", label: "Saved Test Cases" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id as "paste" | "saved")}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-xs font-semibold",
                  mode === item.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {errorMessage && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{errorMessage}</p>}

          {mode === "paste" ? (
            <div className="space-y-3">
              <textarea
                value={pasteValue}
                onChange={(event) => setPasteValue(event.target.value)}
                rows={8}
                placeholder={"Paste transcripts here.\n\nSeparate tests with:\n---\nor\n### Test"}
                className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={runPastedTests}
                disabled={running}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run Pasted Tests
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                <div className="grid grid-cols-1 gap-2">
                  <input className="rounded-lg border border-input bg-card px-3 py-2 text-sm" placeholder="Test name" value={form.test_name} onChange={(event) => updateForm("test_name", event.target.value)} />
                  <select className="rounded-lg border border-input bg-card px-3 py-2 text-sm" value={form.industry} onChange={(event) => updateForm("industry", event.target.value)}>
                    {industries.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </select>
                  <textarea className="rounded-lg border border-input bg-card px-3 py-2 text-sm" rows={4} placeholder="Transcript" value={form.transcript} onChange={(event) => updateForm("transcript", event.target.value)} />
                  <input className="rounded-lg border border-input bg-card px-3 py-2 text-sm" placeholder="Expected client name" value={form.expected_client_name} onChange={(event) => updateForm("expected_client_name", event.target.value)} />
                  <input className="rounded-lg border border-input bg-card px-3 py-2 text-sm" placeholder="Expected site address" value={form.expected_site_address} onChange={(event) => updateForm("expected_site_address", event.target.value)} />
                  <input className="rounded-lg border border-input bg-card px-3 py-2 text-sm" placeholder="Expected job type" value={form.expected_job_type} onChange={(event) => updateForm("expected_job_type", event.target.value)} />
                  <input className="rounded-lg border border-input bg-card px-3 py-2 text-sm" placeholder="Expected template name" value={form.expected_template_name} onChange={(event) => updateForm("expected_template_name", event.target.value)} />
                  <textarea className="rounded-lg border border-input bg-card px-3 py-2 text-sm" rows={2} placeholder="Expected line items, one per line" value={form.expected_line_items} onChange={(event) => updateForm("expected_line_items", event.target.value)} />
                  <textarea className="rounded-lg border border-input bg-card px-3 py-2 text-sm" rows={2} placeholder="Expected missing info, one per line" value={form.expected_missing_info} onChange={(event) => updateForm("expected_missing_info", event.target.value)} />
                </div>
                <button type="button" onClick={saveTestCase} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
                  {form.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {form.id ? "Save Test" : "Add Test"}
                </button>
              </div>

              <button type="button" onClick={runAllSavedTests} disabled={running || savedTests.length === 0} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground disabled:opacity-60">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run All Tests
              </button>

              <div className="space-y-3">
                {groupedTests.map((group) =>
                  group.tests.length > 0 ? (
                    <div key={group.industry}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.industry}</p>
                      <div className="space-y-2">
                        {group.tests.map((test) => (
                          <div key={test.id} className="rounded-xl border border-border bg-card p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">{test.test_name}</p>
                              <button type="button" onClick={() => runSavedTest(test)} disabled={running} className="rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-primary">
                                Run Test
                              </button>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{test.transcript}</p>
                            <div className="mt-2 flex gap-2">
                              <button type="button" onClick={() => editTestCase(test)} className="text-xs font-medium text-primary">
                                Edit
                              </button>
                              <button type="button" onClick={() => deleteTestCase(test.id)} className="text-xs font-medium text-destructive">
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Results</p>
              {results.map((result) => (
                <ResultCard
                  key={result.id}
                  result={result}
                  expanded={expandedResultId === result.id}
                  onToggle={() => setExpandedResultId((current) => (current === result.id ? null : result.id))}
                  onOpenQuoteReview={onOpenQuoteReview}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ResultCard({
  result,
  expanded,
  onToggle,
  onOpenQuoteReview,
}: {
  result: TestResult
  expanded: boolean
  onToggle: () => void
  onOpenQuoteReview?: (raw: string, corrected: string, quote: ProcessedQuote) => void
}) {
  const passed = resultPassed(result)
  const quote = result.quote

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {passed ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
          {result.name}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {quote ? (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p>Client: {quote.client_name || "Not captured"}</p>
          <p>Address: {quote.site_address || "Not captured"}</p>
          <p>Job type: {quote.job_type || "Not captured"}</p>
          <p>Template: {quote.selected_template_name || "None"}</p>
          <p>Missing: {quote.missing_information.length ? quote.missing_information.join("; ") : "None"}</p>
          <p>Warnings: {quote.confidence_warnings.length ? quote.confidence_warnings.join("; ") : "None"}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-destructive">{result.error}</p>
      )}

      {quote && (
        <div className="mt-2 rounded-lg border border-border bg-card p-2">
          <p className="mb-1 text-xs font-semibold text-foreground">Matched JMS Line Items</p>
          {quote.line_items.length > 0 ? (() => {
            const labourExportPrice = resolveLabourExportPrice({
              pricing_facts: undefined,
              labour_allowance: quote.labour_allowance,
              primary_quote: quote.primary_quote,
              line_items: quote.line_items,
            })
            return (
              <div className="space-y-1">
                {quote.line_items.map((item, index) => {
                  const isLabourItem = (item.item_type ?? "").toLowerCase() === "labour"
                  const kbTotal = typeof item.total === "number" ? item.total : Number(item.total ?? NaN)
                  const exportAmount = labourExportPrice.amount
                  const showAnnotation =
                    isLabourItem &&
                    labourExportPrice.pricingSource !== "unpriced" &&
                    Number.isFinite(kbTotal) &&
                    Math.abs(kbTotal - exportAmount) > 0.01
                  return (
                    <div key={`${item.item_code}-${index}`}>
                      <p className="text-xs text-muted-foreground">
                        {[item.item_code, item.item_name || item.description, item.quantity ? `qty ${item.quantity}` : "", item.final_rate_used ? `rate ${item.final_rate_used}` : "", item.total ? `total ${item.total}` : "", item.needs_review ? "review" : ""].filter(Boolean).join(" | ")}
                      </p>
                      {showAnnotation && (
                        <p className="text-xs font-medium text-amber-600">
                          KB matched total: ${kbTotal.toFixed(2)} → export price: ${exportAmount.toFixed(2)} from {labourExportPrice.pricingSource === "structured_allowance" ? "structured allowance" : "spoken fixed price"}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })() : (
            <p className="text-xs text-muted-foreground">No line items.</p>
          )}
        </div>
      )}

      {result.checks.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-1">
          {result.checks.map((check) => (
            <p key={check.label} className={cn("text-xs", check.skipped ? "text-muted-foreground" : check.passed ? "text-success" : "text-destructive")}>
              {check.skipped ? "Skipped" : check.passed ? "Pass" : "Fail"}: {check.label}
            </p>
          ))}
        </div>
      )}

      {quote && onOpenQuoteReview && (
        <button type="button" onClick={() => onOpenQuoteReview(result.rawTranscript, result.correctedTranscript, quote)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-accent py-2 text-xs font-semibold text-primary">
          <FileText className="h-4 w-4" />
          Open full quote review
        </button>
      )}

      {expanded && (!passed || result.error) && (
        <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-secondary p-3 text-[11px] leading-relaxed text-foreground">
          {JSON.stringify(result.quote ?? { error: result.error }, null, 2)}
        </pre>
      )}
    </div>
  )
}
