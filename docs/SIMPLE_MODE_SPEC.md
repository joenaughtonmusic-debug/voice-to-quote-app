# Simple Mode — Maintenance + One-Off Tidy Quoting (Spec)

> Status: APPROVED by Joe (15 Jul 2026) and built on `feat/simple-mode` — Simple is
> the default record-tab mode; Gardening/Landscaping remain available and untouched.
> Context: the July 2026 audit found ~75–80% of the codebase serves multi-trade
> generality the bread-and-butter workflow never uses, AI free-text routing can
> send an explicit "Maintenance" job to the tidy renderer, and spoken prices can
> silently lose to the $80/hr default. Simple Mode is a fresh straight-line path
> built inside this repo, reusing the good pieces. The existing Gardening
> auto-quoter and Landscaping builder are left untouched until Simple Mode has
> proven itself on real quotes.

## Goal

Turn spoken or pasted site-visit notes into a ready-to-send maintenance or
one-off tidy quote with **zero silent guesses**: every extracted fact is shown
as an editable confirm field, prices follow the spoken-price-first rule loudly,
and the customer body comes from a fixed template — not re-derived from the
transcript.

## Non-goals (v1)

- No landscaping, planting, decking, retaining, paving, fencing. (Builder mode
  still exists separately; not Simple Mode's problem.)
- No AI classification of job type — Joe picks Maintenance or Tidy.
- No template learning, quote plan, auditor, overseer, golden-quote harness.
- No optional/$0.00 reference lines (QU-0568/0571 pattern) — deferred to v1.1.
- No changes to the existing Gardening/Landscaping paths.

## User flow

1. **Record screen (Simple)** — mode selector gains a third option, **Simple**,
   which becomes the default. Two big toggles: `Maintenance` | `One-off tidy`.
   Record voice (existing `/api/transcribe`) or paste notes. One button:
   "Extract".
2. **Confirm screen** — every extracted field rendered as an editable input
   (Joe's long-standing top ask — nothing silently trusted):
   - Client name · Site address (always shown, always editable)
   - Maintenance: frequency (monthly / 6-weekly / 2-monthly / 3-monthly /
     4-monthly / custom), per-visit price, greenwaste treatment, extras,
     lawns-between-visits note
   - Tidy: task list (editable lines), hours (per-task + total), rate, spoken
     total, greenwaste treatment, extras
   - Pricing source is shown next to the price (e.g. "spoken", "hours × rate",
     "**defaulted $80/hr — check**" in red). A defaulted price can never look
     like a confirmed one.
3. **Preview screen** — customer body from the fixed template, line items,
   GST-inclusive total with "Includes GST (15%)" line. Edits flow back.
4. **Export** — existing `/api/export-xero-quote` (idempotent, webhook) via
   `buildXeroQuotePayload`. Copy-to-clipboard of the body text as a fallback.

## The one AI call

Single OpenAI structured-output call (strict JSON schema), replacing the
current correct → classify → extract chain. Trade-term hints (Tecoma, Michelia,
buxus, stump paste, …) fold into the prompt — no separate correction call.
Model from `OPENAI_QUOTE_MODEL`; recommend upgrading the default from
`gpt-4o-mini` for this call (one call per quote — cost is trivial).

Schema (`SimpleExtraction`):

```
client_name          string | null
site_address         string | null
frequency            "monthly"|"6-weekly"|"2-monthly"|"3-monthly"|"4-monthly"|"other"|null
frequency_note       string | null        // e.g. "lawns mowed between visits"
tasks                { description, hours: number|null }[]
stated_total_hours   number | null        // "Total of 3.5 hours" — wins over sum
spoken_rate          number | null        // only if explicitly spoken
spoken_total         number | null        // "maybe $300" — captured, never invented
greenwaste           { treatment: "included"|"separate_line"|"not_mentioned",
                       amount: number|null, note: string|null }
extras               { name, amount: number|null }[]   // petrol, weedkiller, tool servicing…
internal_notes       string[]             // day-of-week reminders, access, hazards — NEVER customer-facing
```

Prompt rules: never invent amounts; null over guess; hours/rates/totals only
when explicitly spoken; anything scheduling/access/hazard-flavoured goes to
`internal_notes`.

## Deterministic pricing (code, not AI — and not 30 regexes)

All arithmetic runs on the **confirmed** fields, so the parser burden is tiny;
the AI extracts, Joe confirms, code calculates.

Labour/visit price priority (each result carries its `pricingSource`):
1. Manual edit on the confirm screen — a deliberate deviation from the global
   "spoken first" order: the confirm field is pre-filled with the spoken price, so
   spoken wins by default, and an explicit edit is Joe overriding a mis-heard
   price *after seeing it* — an informed correction, which must win.
2. `spoken_total` (or spoken per-visit price for maintenance) — **$300 beats $280, always**
3. `stated_total_hours` (else Σ task hours) × `spoken_rate`
4. hours × `DEFAULT_LABOUR_RATE` ($80) — flagged **defaulted**, styled loud.
   Deliberately no automatic ~25% contingency on this fallback: the defaulted
   price is a red-flagged placeholder Joe must review, not a quotable number.
5. Unpriced — red banner, export blocked until priced

Greenwaste: `included` → template wording claims greenwaste removal, no priced
line · `separate_line` → own priced line (own Xero line) · `not_mentioned` →
shown on the confirm screen for a decision, and the customer body makes **no
greenwaste claim at all** until Joe sets it — never silently promised.

Extras: each spoken extra becomes its own line (Nadia's sprays/tool servicing,
Brett's petrol) — priced if an amount was spoken, else "price to confirm" and
excluded from the total with a note.

GST: all amounts GST-inclusive; `gst = round2(total × 3/23)`; totals block
matches the answer keys' "INCLUDES GST 15%" convention and Xero parity.

## Fixed templates

**Maintenance body** (the real one — currently exists only in test files):

```
Ongoing {Frequency} Garden Maintenance – {address}

Price reflects the {frequency-word} service fee and includes ongoing garden
maintenance, greenwaste removal, and spraying (pesticides and herbicides as required)

Scheduled visits to maintain the overall presentation, health, and condition of
the garden. Pricing is based on {frequency-word} service frequency.

Service Overview

Each visit may include:

Hedge trimming and shaping as required
General weeding of garden beds and landscaped areas
Removal of unwanted or self-seeded plants
Monitoring and treatment of plant health, pests, and diseases
Weed spraying where required
Feeding of garden as plants in general and as required
Leaf litter removal and general garden tidy
Blow down of work areas on completion

{main-focus block: only when specific tasks were spoken — rendered as
"Main focus: …" bullets above the overview}
{greenwaste note per treatment}
{frequency_note, e.g. lawns between visits}
```

**Tidy body**: `One-Off Garden Tidy – {address}` + cleaned task bullets (from
the confirmed task list; wording per the `quote-writing` skill — outcome-led,
no hour figures in customer text) + standard closers ("All greenwaste removed"
when included, "Blow down and tidy of work areas on completion").

Line items (both): Labour/main scope · Greenwaste (when separate) · each extra.
`internal_notes` render only in an Internal section of the preview, never in
the body or export (Dave's "Friday blowdown" rule).

## Reuse map (lift, don't rewrite)

| Piece | From |
|---|---|
| Voice → text | `app/api/transcribe/route.ts` (as-is) |
| Name/address extraction (pre-fill before AI returns) | `lib/client-name-extraction.ts`, `lib/address-extraction.ts` |
| Xero payload + export + idempotency | `lib/xero-quote-payload.ts`, `lib/xero-export.ts`, `app/api/export-xero-quote/route.ts` |
| GST maths convention | `computeTidyTotals` (reimplement — it's 10 lines — rather than import garden-tidy.ts) |
| Auth | `lib/api-auth.ts` |
| UI primitives | `components/ui/*` |

New code lives in `lib/simple/` + `components/simple-quote-screen.tsx` +
`app/api/simple-extract/route.ts`. Nothing in `lib/pipeline/`,
`lib/customer-quote-assembly/`, `lib/trades/` etc. is imported or modified.

## Acceptance tests (golden cases — answer keys in `docs/reference_quotes/`)

Deterministic layer: unit tests on fixed `SimpleExtraction` fixtures captured
from real live runs. End-to-end: the `.tmp/liverun`-style headless harness runs
the real extraction call (nondeterministic, so smoke-graded on facts).

1. **Dan — 54 Marua Road** (the transcript that started this): mode=Maintenance
   → maintenance body, Dan / 54 Marua Road, three tasks in main focus, **$300**
   (spoken beats 3.5h×$80=$280), greenwaste included, GST line present.
2. **Nadia QU-0521** (6-weekly): $285/visit + greenwaste $26.50 own line (range
   note $26.50–$66.25) + sprays $10 + tool servicing $12 = **$333.50**, GST $43.50.
3. **Brett QU-0569** (2-monthly + lawns): $467.50/visit + petrol $7 =
   **$474.50**; greenwaste-included note, lawns-between-visits captured.
4. **Dave QU-0570** (tidy): $440 + greenwaste $39.75 = **$479.75**; the Friday
   blowdown reminder appears in internal notes only — customer leak = fail.
5. **Xavier QU-0572** (tidy): $720 + greenwaste ½-trailer $72.88 + weedkiller
   $6 = **$798.88**, GST $104.20.
6. **Curzon Street** (monthly): body renders the fixed template verbatim with
   monthly wording.
7. **Negative**: no spoken price and no hours → unpriced banner, export blocked;
   defaulted $80/hr price → visibly flagged on confirm + preview.

Plus Xero parity: payload line amounts sum to the GST-inclusive total for every
golden case.

## Build phases

- **S0** — mode entry + `lib/simple/types.ts` + screen shell.
- **S1** — extraction route + schema + confirm screen with editable fields and
  pricing-source badges.
- **S2** — pricing resolver + both templates + preview render (customer +
  internal sections).
- **S3** — Xero export wiring + GST parity checks.
- **S4** — golden acceptance tests + live headless smoke run of Dan's
  transcript; then real-quote trial period.

Each phase ends green on `pnpm lint` + `pnpm exec tsc --noEmit` and the S4
harness before "done".

## Risks

- **Extraction misses odd phrasing** — mitigated by design: the confirm screen
  makes every field visible/editable, so a miss costs a keystroke, not a wrong
  quote.
- **Xero payload shape assumptions** — `buildXeroQuotePayload` takes the old
  `XeroPayloadQuote`; Simple Mode builds a minimal adapter. Verified in S3
  against a real export.
- **Two live paths confuse usage** — Simple is the default tab and clearly
  labelled; old modes remain until Simple has survived ~2 weeks of real quotes,
  then the strip-back decision is made with evidence.
- **Scope creep** — landscaping asks route to Builder mode or a later version;
  v1 ships nothing beyond this spec.
