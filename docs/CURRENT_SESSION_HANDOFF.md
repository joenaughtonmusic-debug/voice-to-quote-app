# Current Session Handoff

Re-orientation for a fresh session. Branch: `wip/export-mapping-refactor-from-cursor`
(pushed to origin, **do not merge to main**). North star: **`docs/PRODUCTION_DIRECTION.md`**.
Grading answer keys: **`docs/reference_quotes/ANSWER_KEYS.md`** (real sent quotes as PDFs alongside).

---

## 1. ONE-OFF TIDY — DONE, send-ready

The tidy customer quote is a priced invoice in Joe's QU-0572 format, deterministic run-to-run,
and its Xero export total matches the draft. Built across T1–T7 + a phrasing pass:

- **T1** — deterministic tidy pricing-facts parsed from the RAW transcript (`lib/export/tidy-pricing-facts.ts`), so figures don't flicker with AI narration.
- **T2** — labour day-rate rule: full day = 7.5h, rate PER PERSON; spoken labour total wins (`dayRateLabourPrice` in `lib/export/labour-line-builder.ts`).
- **T3** — greenwaste rule: $26.50/bag, 6 bags = 1 trailer; spoken $ wins; odd units ("1.5 days") flagged not guessed; only a single unambiguous quantity is priced (`lib/export/waste-line-builder.ts`). (This was B2.)
- **T4** — priced extras from an extensible list `TIDY_EXTRAS_PRICE_LIST` (`lib/export/tidy-extras.ts`); spoken $ wins; unmatched extras flagged "price to confirm". For now: weedkiller extra-strength = $6.
- **T5** — GST-INCLUSIVE totals: TOTAL = sum of line $; GST line = SUM of each line's $×3/23 (per-line rounding — matches Xero and the keys; total×3/23 is wrong, gives David $62.58 not $62.57). 2-decimal currency. `computeTidyTotals` unit-tested against the keys.
- **T6** — Xero garden-tidy renderer exports an extras line so **Xero total == draft total** (Xavier $1,336 = $1,336). Parity test in place.
- **T7** — one merged **"Labour – main scope"** line (scope prose + $, or rate-stripped crew when unpriced); no standalone Scope-of-Work section; Xero labour description repointed via shared `isLabourFinalLine`.
- **Phrasing pass** — 18-phrasing scorecard = 18/18; fixed "N hours total, M people" (don't ×people again), "half a day" (0.5 not 1), and "$80/hr" abbreviation.

**Produces** (live Xavier): `Labour – main scope [scope…] $1,200.00 · Green Waste $130.00 ·
Extras weedkiller $6.00 (+organic flagged) · Includes GST (15%) $174.26 · Total (NZD) $1,336.00`.

Assembler: `lib/customer-quote-assembly/garden-tidy.ts`. Tests: `lib/garden-tidy-mvp-acceptance.test.ts` (78).
All suites green + `npm run build` clean; no live OpenAI in tests. Note: Joe's *sent* figures differ
from transcript figures where he manually adjusted — grade on what was SPOKEN + the rules, not the sent totals.

---

## 2. NEXT SESSION — MAINTENANCE (agreed plan)

Make ongoing maintenance send-ready the same way, **reusing the tidy engine**. Grade against
**Nadia QU-0521** (6-weekly) and **Brett QU-0569** (2-monthly + lawns).

- **Per-visit price = hours × rate**, reusing the tidy labour engine (`dayRateLabourPrice` / the facts layer). Spoken per-visit total wins if given.
- **Greenwaste = a separate priced line BY DEFAULT** (like Nadia's $26.50 + range note), using the tidy greenwaste rule — **but suppressible**: when Joe says greenwaste is **"included" / "standard … included"** (Brett), fold it into the service, no separate line.
- **Frequency shown** on the customer quote (cadence is captured today but not surfaced — this is the core B4 gap).
- **Extras priced-or-flagged** (sprays/extras, tool servicing, petrol) via the same extras mechanism / price list.
- **GST-inclusive total + Xero parity**, same per-line GST as tidy.
- Keep B3 intact: team/site notes (dog, gates, steep driveway) stay OUT of the customer quote, retained internally.

Maintenance assembler: `lib/customer-quote-assembly/maintenance.ts`. `lib/export/garden-tidy-export-lines.ts`
is the tidy Xero renderer to mirror.

---

## 3. Paused / Queued

- **PAUSED — paver / mixed-trade (AI-0c, AI-1):** per PRODUCTION_DIRECTION, do NOT untangle mixed jobs; split at the door. Do not start under the bread-and-butter phase.
- **QUEUED — B4:** the maintenance thinness fix above (per-visit price, greenwaste line, frequency shown, priced extras). This IS the next session's work.
- Also queued: a first-class **Team-instructions output** to receive the B3 access/hazard notes (currently they live in the internal view only).

Full batch history + statuses: `docs/QUOTE_ENGINE_BATCH_PLAN.md`.
