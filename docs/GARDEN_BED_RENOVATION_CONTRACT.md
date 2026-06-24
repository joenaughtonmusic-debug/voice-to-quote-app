# Golden Workflow Contract — Garden Bed Renovation (General Landscaping)

**Status:** Active  
**Trade path:** General Landscaping  
**Test file:** `lib/general-landscaping-mvp-acceptance.test.ts`  
**Test script:** `npm run test:general-landscaping-mvp`

---

## Acceptance Transcript

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

---

## Classification Contract

| Check | Expected |
|---|---|
| `job_type` | `garden_bed_renovation` or `general_landscaping` |
| Must NOT be | `retaining` |
| Selected template | Must NOT be "Retaining Wall Quote" |
| Template recommendation | Must NOT recommend "Planting" |
| Retaining detector confidence | `low` or `none` |
| `isRetainingTranscript` | `false` |

**Reason:** This job involves 200x50 timber garden bed borders, keystone edging removal, and garden bed renovation. Timber is present but does not indicate a structural retaining wall. No slope, embankment, posts, or wall height are described.

---

## Customer Preview Contract

### What MUST appear

| Section | Required items |
|---|---|
| Title | "Garden Bed Renovation" |
| Scope of Work | All 5 scope items (see below) |
| Materials | All 3 material items |
| Optional Works | All 3 optional items |

**Scope of Work — required items (5):**
1. Remove the existing keystone edging
2. Remove the existing mandarin tree
3. Install new 200x50 timber garden bed borders
4. The garden bed area is approximately 10 square metres
5. The new border comes out approximately 900 millimetres from the fence

**Materials — required items (3):**
1. 200x50 timber
2. Timber pegs
3. Bugle screws and fixings

**Optional Works — required items (3):**
1. Remove weed species from the garden bed
2. Remove apple tree stump
3. Replenish the garden bed with garden mix and mulch

### What must NEVER appear in customer preview

- Labour hour allowances (`Allow 7 hours to…`, `Allow 2 hours to…`, `Allow 8 hours to…`)
- Internal notes (`This is a small garden bed renovation / timber border job, not a retaining wall`)
- Internal notes (`Keep optional works separate from the main quote`)
- Pricing facts or line item rates
- Account codes or tax codes
- `[]` placeholders

---

## Internal Review Contract

### Labour

| Task | Hours |
|---|---|
| Remove keystone edging | 7 h |
| Remove mandarin tree | 2 h |
| Install timber border | 8 h |
| **Total** | **17 h** |

Labour must be captured as **hour quantities**, not currency amounts.  
The total labour basis for pricing is **17 hours × configured landscaping labour rate**.

### Materials

All 3 materials must be captured and flagged for quantity/pricing review where no quantity was stated:
- 200x50 timber (quantity: unknown — review required)
- Timber pegs (quantity: unknown — review required)
- Bugle screws and fixings (quantity: unknown — review required)

### Optional works

All 3 optional works items must be captured **separately** from the main quote.

---

## Pricing Facts Contract

### MUST NOT occur

| Forbidden fact | Why it's wrong |
|---|---|
| `amount: 7` sourced from "Allow 7 hours" | Hours are quantities, not currency |
| `amount: 2` sourced from "Allow 2 hours" | Hours are quantities, not currency |
| `amount: 8` sourced from "Allow 8 hours" | Hours are quantities, not currency |

The `extractPricing()` function must not produce allowance facts with amounts 7, 2, or 8 derived from labour hour phrases.

### Expected pricing basis

- Labour: 17 h × configured landscaping labour rate (e.g. NZD 85/h = NZD 1,445)
- Materials: to be priced once quantities are confirmed
- Optional works: separate line items, not included in main quote total

---

## Xero / JMS Export Contract

*(Exporter not yet built for this trade path — these are future guardrails)*

- Must NOT export `$7`, `$2`, or `$8` as unit prices derived from labour hour phrases
- Labour lines must export as: `quantity = hours, unitAmount = hourly rate`
- Optional works must be in a separate export group, not merged into the main quote

---

## Known Failing Tests (as of contract creation)

The following test assertions currently **fail** because the pricing extractor misreads labour hour phrases as currency allowances:

1. `extractPricing(transcript)` must not produce amount=7 — **FAILS** (allowance extractor matches "Allow 7 hours" → $7)
2. `extractPricing(transcript)` must not produce amount=2 — **FAILS** (allowance extractor matches "Allow 2 hours" → $2)
3. `extractPricing(transcript)` must not produce amount=8 — **FAILS** (allowance extractor matches "Allow 8 hours" → $8)

### Recommended fix (after approval)

Add a labour-phrase guard to `allowanceForSentence()` in `lib/core/pricing-extraction/extractor.ts`:

```typescript
// Guard: "Allow N hours to <task>" is a labour quantity, not a price allowance
if (/\ballow\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?)\s+to\b/i.test(sentence)) return null
```

This single guard prevents all three failing tests from producing bad pricing facts without changing any other pricing extraction behaviour.

---

## Implementation Batch (after approval)

1. Fix `lib/core/pricing-extraction/extractor.ts` — add labour-phrase guard to `allowanceForSentence`
2. Verify `npm run test:general-landscaping-mvp` passes all assertions
3. Verify `npm run test:pricing` still passes (no regression on legitimate allowance extraction)
4. Add labour hour extraction module to `lib/core/` for internal review
5. Wire labour extraction into the general landscaping processing pipeline
