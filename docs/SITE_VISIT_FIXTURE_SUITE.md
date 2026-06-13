# Site Visit Transcript Fixture Suite

## Purpose

The site visit transcript fixture suite is a deterministic regression library for estimator-style voice-note transcripts. It lets us validate quote-processing layers against realistic field notes without recording new audio or calling external AI services.

The suite lives in:

```text
lib/test-fixtures/site-visit-transcripts/
```

It intentionally does not modify `ProcessedQuote`, customer preview rendering, or Xero export behavior. The current test path exercises deterministic layers only:

- client name extraction
- address extraction
- measurement extraction
- decking and retaining detection
- planting calculator request extraction
- review notice generation
- fixture-only fact and exclusion/note checks

## How To Add Fixtures

Add a new entry to `lib/test-fixtures/site-visit-transcripts/fixtures.ts`.

Each fixture should include:

- `id`: stable kebab-case identifier
- `name`: readable scenario name
- `transcript`: realistic site visit wording
- `expected.tradeCategory`: expected deterministic category
- `expected.measurements`: values and optional unit/dimension/confidence flags
- `expected.reviewNotices`: warnings/notices that should appear
- `expected.exclusionsOrNotes`: exclusions such as `No staining`
- `expected.facts`: deterministic facts expected from the transcript
- `expected.nonEvents`: warnings, facts, or measurements that must not appear

Keep fixtures reusable. Do not add one-off customer or job details to business logic just to satisfy a fixture. If a fixture exposes a real deterministic parsing gap, either capture it as an expected warning/non-event or fix the shared deterministic parser deliberately.

## How To Run

Run only the fixture suite:

```bash
npm run test:site-fixtures
```

Run it with the core and trade regression suites:

```bash
npm run test:core
npm run test:trades
npm run test:site-fixtures
```

For full validation after changing deterministic processing:

```bash
npm run test:core
npm run test:trades
npm run test:site-fixtures
npx tsc --noEmit
npm run build
```

## Why Fixtures Instead Of Repeated Voice Recordings

Transcription is now treated as largely solved. Re-recording site visits would make estimating-engine tests slower, harder to reproduce, and dependent on audio capture and external transcription behavior.

Text fixtures give us stable regression coverage for the estimating engine. They preserve realistic estimator language while keeping the tests fast, deterministic, and safe to run locally or in CI without OpenAI calls.
