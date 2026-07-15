# Quote Engine Reliability Goal

**App:** Talk to Quote — estimating and quoting engine for Pristine Gardens  
**Branch:** wip/export-mapping-refactor-from-cursor  
**Status:** Active development — do not merge to main until full golden suite passes

---

## 1. Product Goal

Turn messy voice/pasted site notes into a complete, reviewer-ready, exportable quote package:

```
Raw transcript
→ ProcessedQuote (AI extraction + deterministic calculators)
→ Quote QA / Quote Auditor
→ corrected/reviewable ProcessedQuote
→ Customer Preview
→ Internal Review
→ Matched JMS Line Items
→ Xero/JMS Export Lines
```

The quote engine is **not** a nice AI writing tool. It is a reliable estimating processor.
A quote is only "working" when **all five output layers are aligned**:

| Layer | Must contain |
|---|---|
| Customer Preview | Title, Scope of Work, Materials, Optional Works — no internal data |
| Internal Review | Labour quantities, material assumptions, warnings, item/rate mappings |
| Pricing Facts | Genuine prices only — no quantities misread as prices |
| Matched JMS Line Items | Correct quantity, unit, rate, total, item code, account/tax code |
| Xero/JMS Export | Correct descriptions, quantities, prices, codes, review flags |

---

## 2. What "Reliable Quote Processor" Means

A quote is **reliable** if and only if:

1. The customer preview reads naturally, captures the full job scope, and exposes no internal data.
2. The internal review preserves all labour, material, and cost assumptions with correct quantities.
3. Pricing facts contain only genuine spoken prices — not material quantities, not labour hours.
4. Matched JMS line items have consistent quantity × rate = total (or a flagged reason why not).
5. The Xero/JMS export is ready to send without manual correction.
6. Optional works are separate from the primary scope at every layer.
7. The selected template matches the actual job type.
8. Calculator outputs (planting, retaining, decking, paving) are consistent with the transcript.
9. All warnings, review flags, and missing information are surfaced — not silently dropped.
10. The quote does not contradict itself across layers.

---

## 3. Current Known Quote Types

| Quote type | Template | Key calculators | Status |
|---|---|---|---|
| General landscaping / garden bed renovation | Landscaping Estimate | Labour allowance (per-task hours) | ✅ tested |
| One-off garden tidy | One-Off Garden Tidy | Labour allowance (days × people) | ✅ tested |
| Planting | Planting | Planting calculator, plant library | ✅ tested |
| Retaining wall | Retaining Wall Quote | Retaining calculator | ✅ tested |
| Decking | Decking Quote | Decking calculator | ✅ tested |
| Paving | Paving Quote | Paving calculator | ✅ tested |
| Fencing | Fencing Quote | — | ✅ tested |
| Maintenance (recurring) | Maintenance / Service Agreement | Greenwaste, cadence | ✅ tested |
| Mixed (retaining + landscaping + planting optional) | Landscaping Estimate | Multiple calculators | ⚠️ golden quote 3 needed |

---

## 4. Customer Preview Contract

The customer-facing quote preview **must**:

- Show: Title, Scope of Work, Materials, Optional Works (where present), Exclusions (where present)
- Use customer-safe plant names (spoken name preferred over fuzzy library variant names)
- Show planting area length and spacing in the scope
- Show optional works as a separate section — not merged into main scope
- Show optional works items only — no `Title:`, `Job type:`, `Cadence:` metadata

The customer-facing quote preview **must not**:

- Show internal notes
- Show raw `job_type` slugs (e.g. `garden_bed_renovation`, `planting`)
- Show labour hours, allowance breakdowns, or pricing workings
- Show pricing facts, rates, totals, or account/tax codes
- Show stray `[]` or empty placeholders
- Show plant names from fuzzy library matches when the spoken name is known (e.g. `Michelia 'Gracepies'` vs `Michelia gracipes`)
- Show nonsense plant names extracted by calculator (e.g. `long`, `metres long. The`)
- Show Matched JMS line item descriptions
- Contradict the Internal Review on the scope of the job

---

## 5. Internal Review Contract

The internal review **must**:

- Show labour: task-by-task breakdown (where applicable), total hours, person-days, total labour cost
- Show materials: quantities, sourcing status, flagged unknowns
- Show calculators: planting area(s), plant name, plant count, spacing, options
- Show optional works: clearly separated from primary scope
- Show missing information: flagged with review-required status
- Show warnings: pricing review flags, spacing conflicts, fuzzy matches
- Show Matched JMS Line Items: item name, item code, quantity, unit, KB rate, final rate, total

The internal review **must not**:

- Show the Labour Pricing total and the Matched JMS Labour total as different values for the same job
- Show unit mismatches (`Qty 1.5 days hours`)
- Show material quantities as pricing facts (`$5` from `5 bags of garden mix`)
- Show optional works mixed into primary scope

---

## 6. JMS / Xero Export Contract

For every exported line item:

- `quantity × rate = total` (or a flagged reason why not — e.g. lump sum, override)
- Unit is consistent with rate basis (hours if hourly rate, m² if area rate)
- Item code, account code, and tax code are present or flagged for review
- Description is customer-safe (no internal codes or calculation scaffolding)
- Labour line reflects billable hours (not person-days when rate is per-hour)
- Fuzzy matches are flagged with `needs_review: true`
- Missing rates are flagged with `Warning: Rate missing`

---

## 7. Golden Quote Suite

### Golden Quote 1 — Michelia Planting (Stephanie, Cotswold Lane)

**Transcript:**
```text
Went to see Stephanie at 10 Cotswold Lane, Mount Wellington.

This is a planting quote for the front garden bed.

The planting area is approximately 14.2 metres long.

The plant she wanted was Michelia gracipes.

She does not want the biggest size, but please show both size options if available.

Plant spacing should be 50 centimetres.

Allow one person for one and a half days because there are roots in the garden bed.

Allow 5 bags of garden mix.

Optional work:
Install a 150x50 timber board border around the planting area.

Internal notes:
This is a planting job, not a garden tidy.
Use the spoken 50 centimetre spacing.
Keep the timber board border as optional work.
```

**Critical expectations:**

| Expectation | Layer |
|---|---|
| Job type: planting | Classification |
| Customer: Stephanie | Address |
| Address: 10 Cotswold Lane, Mount Wellington | Address |
| Scope says "Michelia gracipes" (spoken name) | Customer Preview |
| Scope says "14.2 metres long" | Customer Preview |
| Scope says "50cm centres" | Customer Preview |
| Materials: Garden mix | Customer Preview |
| Optional Works: timber board border | Customer Preview |
| No "long hedge" | Customer Preview |
| No "metres long. The" | Customer Preview |
| No "Job type:" metadata | Customer Preview |
| Plant count 30 | Internal Review |
| Labour 1 person × 1.5 days = 12 hours | Internal Review |
| Labour total $1,320 at $110/hr | Internal Review |
| Garden mix: 5 bags (not $5 pricing fact) | Internal Review |
| Matched JMS labour: Qty 12 hours, Total 1320.00 | JMS/Export |
| Not "Qty 1.5 days hours" | JMS/Export |
| Not "$165" | JMS/Export |
| Only one planting calculator area | Calculator |
| No "Planting area 2" | Calculator |
| Optional timber border in optional_quotes | Data model |

**Tests currently covering this:** `lib/quote-presentation/planting-cutover.test.ts` (31 tests), `lib/quote-presentation/stephanie-live-transcript.test.ts` (4 tests), `lib/export/map-to-xero.test.ts` (labour normalisation tests)

**Gaps:** No test verifies Matched JMS labour total equals Labour Pricing total in a single assertion. No end-to-end test through the full API route.

---

### Golden Quote 2 — Garden Bed Renovation (Stephanie, Cotswold Lane)

**Transcript:**
```text
Went to see Stephanie at 10 Cotswold Lane, Mount Wellington.

This quote is for the left-hand garden bed renovation.

Scope of work:
Remove the existing keystone edging.
Remove the existing mandarin tree.
Install new 200x50 timber garden bed borders.
The garden bed area is approximately 10 square metres.
The new border comes out approximately 900 millimetres from the fence.

Labour allowance:
Allow 7 hours to remove the keystone edging.
Allow 2 hours to remove the mandarin tree.
Allow 8 hours to install the new timber garden bed border.

Materials:
200x50 timber.
Timber pegs.
Bugle screws and fixings.

Optional works:
Remove weed species from the garden bed.
Remove apple tree stump.
Replenish the garden bed with garden mix and mulch.

Internal notes:
This is a small garden bed renovation / timber border job, not a retaining wall.
Keep optional works separate from the main quote.
```

**Critical expectations:**

| Expectation | Layer |
|---|---|
| job_type: garden_bed_renovation or general_landscaping | Classification |
| Not retaining | Classification |
| Customer Preview title: Garden Bed Renovation | Customer Preview |
| Scope: 5 items (edging, mandarin, border, area, setback) | Customer Preview |
| Materials: 200x50 timber, timber pegs, bugle screws | Customer Preview |
| Optional Works: 3 items (weeds, stump, garden mix+mulch) | Customer Preview |
| No labour hours in customer preview | Customer Preview |
| No "not specified" in labour allowance when breakdown exists | Internal Review |
| Labour total: 17h (7 + 2 + 8) | Internal Review |
| Labour cost: 17h × $110 = $1,870 | Internal Review |
| No $7, $2, $8 pricing facts | Pricing Facts |
| Garden mix/mulch NOT in required materials | Materials |
| Garden mix/mulch ONLY in optional works | Optional Works |
| No "Title:", "Job type:", "Cadence:" in Optional Works | Customer Preview |

**Tests currently covering this:** `lib/general-landscaping-mvp-acceptance.test.ts` (73 tests — most comprehensive)

**Gaps:** No single test verifies the complete 5-layer alignment. Labour total vs JMS consistency not tested.

---

### Golden Quote 3 — Mixed Landscaping / Lawn Levelling / Retaining / Topsoil (Adam, Titirangi)

**Transcript:**
```text
Okay, this is a quote for Adam at 20 Lemnos Street in Titirangi. So the main job is levelling the back lawn. Before we do that though, we need to construct a small timber retaining wall, approximately 400mm high, using two 200x50 retaining timbers with 100x100 timber posts along that length. And we also need to install some polythene along the fence to protect the fence. Once we've installed the retaining wall, we can then look to put down a whole bunch of topsoil. So we're looking at doing a 50mm depth across the area, and the area is approximately 6m by 16.8m. And the retaining wall is going to sit 900mm off the fence, and the length is going to be 16.8m for the retaining wall. And it would be great to also have the option for lawn mix to go on top of the area, but in the actual quote we'll use topsoil. And we also need to have a count for some lawn seed, but we'll just use the cheap lawn seed. I imagine a 5kg bag, $129 for the bag, and it would be great if you could also do an optional price for planting a Ficus Tuffi hedge along the fence with roughly one metre sized plants, and the labour for that being two people one day.
```

**Critical expectations:**

| Expectation | Layer |
|---|---|
| Customer: Adam | Address |
| Address includes "Titirangi" suburb | Address |
| Not classified as decking | Classification |
| No "Deck area 1" | Customer Preview |
| No "Decking boards" | Customer Preview |
| No "Plant multiple Deck area 1" | Customer Preview |
| Retaining wall: ~400mm high, 16.8m long | Internal Review |
| Topsoil area: 6m × 16.8m = 100.8m² | Internal Review |
| Topsoil depth: 50mm | Internal Review |
| Topsoil volume: ~5.04m³ | Internal Review |
| Lawn seed: 5kg bag, $129 spoken price | Internal Review |
| Lawn mix as optional (not primary material) | Optional Works |
| Optional: Ficus Tuffi hedge along fence | Optional Works |
| Optional hedge labour: 2 people × 1 day = 16h | Optional Works |
| Warning if Ficus spacing/plant count missing | Warnings |
| Warning if retaining post spacing / drainage missing | Warnings |
| Warning if topsoil rate missing | Warnings |

**Tests currently covering this:** **None.** This is a new golden quote.

---

## 8. Quote Auditor Concept

The Quote Auditor is a deterministic + optional AI review layer that runs after the initial `ProcessedQuote` is assembled, before the quote is sent, exported, or displayed.

**It does not:**
- Call AI to rewrite the quote
- Silently mutate the quote without recording what changed
- Block the quote from displaying

**It does:**
- Detect impossible or suspicious outputs
- Apply safe deterministic corrections (e.g. normalise days to hours for JMS)
- Surface unresolvable issues as review warnings
- Block export if export-critical fields are wrong

**Pipeline position:**
```
Transcript
→ AI extraction → processedQuote (raw AI output)
→ deterministic calculators (planting, retaining, decking, paving, etc.)
→ applyDeterministicLabourAllowances / normaliseDaysLabourLineItem
→ Quote Auditor ← NEW
→ corrected/reviewable ProcessedQuote
→ Customer Preview / Internal Review / JMS Export
```

---

## 9. Deterministic Validators Required

### V01 — Unit sanity
- Green waste cannot have unit `days` or `hours`.
- Labour export unit must be `hours` when rate is per-hour.
- Materials cannot have time units (days, hours, minutes).
- Flag: `unit_mismatch`

### V02 — Pricing facts guard
- Patterns `N bags`, `N plants`, `N rolls`, `N m3`, `N litres` are **quantities**, not prices.
- Do not extract `$N` from `Allow N bags of X`.
- `$129` (explicit currency symbol) is a price.
- Flag: `pricing_fact_is_quantity`

### V03 — Labour consistency
- Labour Pricing panel total must equal Matched JMS labour total for the same line item.
- If labour unit is `days` and rate is hourly, convert: `hours = people × days × 8`.
- Never output `Qty 1.5 days hours`.
- Flag: `labour_total_mismatch`

### V04 — Classification conflicts
- Decking calculator must not run if transcript does not mention deck/decking/decking boards.
- Retaining is allowed inside a wider landscaping quote.
- Planting optional works must not take over the primary quote scope.
- Flag: `wrong_calculator_active`

### V05 — Optional works isolation
- Optional works must not appear in `primary_quote.scope`.
- No `Title:`, `Job type:`, `Cadence:` metadata visible in customer preview Optional Works section.
- Flag: `optional_works_in_primary_scope`, `optional_works_metadata_leak`

### V06 — Customer preview safety
- No internal notes in customer-facing output.
- No raw `job_type` slug in title/subtitle.
- No plant names that are adjectives or measurements (`long`, `metres long. The`, `short`, `tall`).
- No missing major scope items that are clearly present in the transcript.
- Flag: `customer_preview_leaks_internal_data`, `bogus_plant_name`, `missing_scope_item`

### V07 — Export mapping
- `quantity × rate = total` for every line item (or flagged override/lump-sum reason).
- Missing rate → `needs_review: true`, `Warning: Rate missing`.
- Fuzzy item match → `needs_review: true`, warning.
- Flag: `total_inconsistency`, `missing_rate`, `fuzzy_match_unreviewed`

### V08 — Address
- If transcript says `[street] in [suburb]` or `[street], [suburb]`, the extracted suburb must match.
- If suburb is known (e.g. Titirangi) but missing from extracted address, flag it.
- Flag: `suburb_missing_from_address`

---

## 10. AI Semantic Review Layer

After deterministic validators, an optional AI review pass compares `rawTranscript` against the assembled outputs and answers:

```json
{
  "main_job_captured": true,
  "missing_scope_items": ["polythene along the fence"],
  "optional_became_required": false,
  "template_makes_sense": true,
  "customer_preview_vs_internal_contradictions": [],
  "suspicious_calculator_choices": ["Decking calculator fired — no decking in transcript"],
  "likely_missing_quantities": ["retaining post spacing", "topsoil rate"],
  "ai_review_confidence": "medium",
  "notes": "..."
}
```

If JSON parsing fails, the system continues with deterministic validators and adds:
```
AI Quote Auditor returned invalid JSON; deterministic checks only.
```

---

## 11. Browser Verification Workflow

For each golden quote:

1. Start local dev server: `npm run dev`
2. Open `localhost:3000`
3. Paste transcript into the quote input
4. Wait for processing to complete
5. Check **Customer View** tab:
   - Title correct
   - Scope of Work complete
   - Materials correct
   - Optional Works correct and metadata-free
   - No internal data
6. Check **Internal View** tab:
   - Labour allowance breakdown present
   - Matched JMS Line Items: correct quantity, unit, total
   - No total mismatch between Labour Pricing panel and JMS
   - Warnings/missing info surfaced correctly
7. Check **Quote Options** (for planting/decking/paving):
   - Plant options with correct pricing
   - No bogus areas
8. Record pass/fail per expectation row from Section 7

Automation: Use Playwright (`npx playwright test`) for repeatable E2E. Current browser tool can be used for manual spot-checks but is not reliable enough for repeatable CI.

---

## 12. Safety Rules for Future Cursor Work

These rules apply to all future changes in this repository:

1. **Do not fix symptoms — fix contracts.** If a quote output is wrong, update the golden contract first, write a failing test, then fix the code.
2. **Hours are quantities, never currency.** `Allow 7 hours` → `7h labour`, not `$7 pricing fact`.
3. **Optional works must stay optional.** They must never appear in primary scope at any layer.
4. **Customer preview must never expose internal data.** See Section 4.
5. **Labour Pricing panel and Matched JMS must agree.** If they differ, it is a bug.
6. **Do not call `normaliseDaysLabourLineItem` before KB matching.** It must run after `attachMatchedLineItemMetadata`.
7. **Fuzzy plant library matches must produce a review warning.** The spoken plant name is safer for customer scope.
8. **Deterministic calculators run before AI review.** The Quote Auditor catches what deterministic code can catch; AI review catches semantic gaps.
9. **Never merge to main while a golden quote is failing.** The golden suite is the release gate.
10. **Commit only what you worked on.** `.DS_Store`, `next-env.d.ts`, `tsconfig.tsbuildinfo` are never committed.

---

## 13. Recommended First Implementation Batch (Quote Auditor Phase 0)

Do not implement all validators at once. Start with the three that have caused repeated bugs:

### Batch QA-0

1. **`lib/quote-auditor/index.ts`** — skeleton types and `auditProcessedQuote()` entry point
2. **`lib/quote-auditor/validators/v01-unit-sanity.ts`** — green waste / labour unit checks
3. **`lib/quote-auditor/validators/v02-pricing-facts.ts`** — material quantity ≠ price checks
4. **`lib/quote-auditor/validators/v03-labour-consistency.ts`** — Labour Pricing = JMS total
5. **`lib/quote-auditor/fixtures/michelia.ts`** — Michelia golden quote fixture
6. **`lib/quote-auditor/fixtures/garden-bed-renovation.ts`** — Garden Bed Renovation fixture
7. **`lib/quote-auditor/index.test.ts`** — acceptance tests for all three validators against both fixtures

Wire `auditProcessedQuote()` into `app/api/process-quote/route.ts` so audit results are returned as `quote.audit` on the `ProcessedQuote` response.

Display audit issues in the Internal View (non-blocking for now — display only, no export block yet).

---

*Last updated: 2026-07-05*
