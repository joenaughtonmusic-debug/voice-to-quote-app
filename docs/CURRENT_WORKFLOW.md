# Current Workflow

Last Updated: June 2026

This document describes the current end-to-end Quotecord workflow and the current known limitations.

---

# Overview

Current flow:

```text
Transcript / Voice Note
↓
Transcription
↓
Transcript Correction
↓
Fact Extraction
↓
Deterministic Processing
↓
Trade-Specific Modules
↓
Customer View
↓
Quote Preview
↓
Export Payload
↓
Make.com
↓
Xero Draft Quote
```

---

# Stage 1 - Transcript Capture

Input methods:

- Voice recording
- Paste Notes
- Test Runner

Examples:

```text
Quote for Marcus at 4A Amy Street, Ellerslie.

11.5m lower planting area.

13.7m upper planting area.

Need pricing for 25L and 45L Ficus Tuffi.

Include 6 bags garden mix.

Include hardfill / spoil removal.
```

Output:

```text
Raw transcript
```

---

# Stage 2 - Transcript Correction

Purpose:

- Fix transcription mistakes.
- Apply trade vocabulary corrections.
- Preserve original meaning.

Output:

```text
Corrected transcript
```

Notes:

- Failure is non-blocking.
- Original transcript is used if correction fails.

---

# Stage 3 - Fact Extraction

Purpose:

Convert transcript into structured facts.

Extracts:

- Customer
- Address
- Job Type
- Labour
- Materials
- Plants
- Areas
- Notes
- Exclusions
- Missing Information

Output:

```json
{
  "customer": "Marcus",
  "job_type": "planting",
  "plant_names": ["Ficus Tuffi"],
  "areas": [
    {
      "name": "Lower planting area",
      "length": 11.5
    }
  ]
}
```

---

# Stage 4 - Deterministic Processing

Purpose:

Run calculations outside AI.

Examples:

## Plant Calculator

Inputs:

```text
Plant name
Length
Spacing
Quantity
Requested sizes
```

Outputs:

```text
Plant count
Plant options
Plant pricing
Warnings
```

Example:

```text
11.5m
850mm spacing
=
15 plants
```

---

# Stage 5 - Trade-Specific Modules

Current implemented trade:

```text
Planting
```

Current modules:

```text
lib/trades/planting/
```

Contains:

- Plant Library
- Plant Calculator
- Quote Option Builder
- Customer Renderer
- Xero Renderer

---

# Stage 6 - Customer Renderer

Purpose:

Convert facts into customer-friendly wording.

Example output:

```text
Plant multiple Ficus Tuffi along lower planting area.

Plant multiple Ficus Tuffi along upper planting area.

Supply garden mix required for planting works.

Remove spoil generated during planting.

Tidy the work area on completion.
```

Customer View and Preview use the same renderer output.

---

# Stage 7 - Quote Options

Purpose:

Generate customer choices.

Example:

```text
Lower Area

Option A
Ficus Tuffi 25L

Option B
Ficus Tuffi 45L
```

Output:

```text
QuoteOption[]
```

---

# Stage 8 - Quote Preview

Purpose:

Generate customer-facing quote.

Current sections:

```text
Scope
Labour
Plants
Materials
Exclusions
```

---

# Stage 9 - Xero Export Renderer

Purpose:

Convert quote into accounting/export lines.

Current Planting Renderer:

```text
Labour
Plants
Materials
Removal
```

Example:

```text
Planting labour

Plants - Ficus Tuffi 25L

Garden mix

Hardfill / spoil removal
```

Output:

```text
xeroLineItemsArray
```

---

# Stage 10 - Make.com

Purpose:

Receive export payload.

Flow:

```text
Webhook
↓
Search Contact
↓
Router
↓
Create Contact (if needed)
↓
Create Quote
↓
Webhook Response
```

---

# Stage 11 - Xero Draft Quote

Current output:

```text
Labour
Plants
Materials
Removal
```

Accounts:

```text
10010 - Labour
10115 - Plants
10011 - Materials
```

Tax:

```text
OUTPUT2
```

---

# Universal Core

Trade-neutral components:

- Capture
- Transcription
- Correction
- Extraction
- Structured Quote Model
- Draft Saving
- Review UI
- Knowledge Base
- Import Framework
- Item Matching
- Export Adapters

---

# Current Trade Modules

Implemented:

```text
Planting
```

Planned:

```text
Maintenance
Hedge Trimming
Electrical
Plumbing
Building
Painting
Cleaning
Arborist
```

---

# Known Issues

## Xero Material Account Mapping

Current status:

```text
Garden Mix
Hardfill
```

correctly appear in:

```text
Webhook Payload
```

with:

```text
AccountCode 10011
```

but may not appear correctly inside Xero.

Likely cause:

```text
Make.com Create Quote mapping
```

rather than Quotecord export.

---

# Current Product Direction

Architecture:

```text
Universal Core
+
Trade-Specific Modules
+
User Templates
+
Knowledge Base
+
Export Adapters
```

Goal:

```text
One quoting engine

Many trades

Many export systems
```

Examples:

```text
Gardener
Builder
Electrician
Plumber
Painter
Cleaner
Arborist
```

all using the same core workflow.
