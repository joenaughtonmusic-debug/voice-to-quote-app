# Xero Maintenance Export MVP Acceptance

## Purpose

This document defines the finish line for the Maintenance to Xero Quote export workflow before modifying export behavior.

## Acceptance Transcript

```text
Monthly maintenance for Stella at 6 Tarawera Terrace, St Heliers.

Allow 4.5 hours labour per visit.

Price per visit $405 including greenwaste removal, herbicide spraying, and standard maintenance materials.

Main focus of visits will be weeding, pruning, and removal of self-seeded plants.

Each visit may include weeding, pruning, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required.

There is a greenwaste bin on site which can be filled up to approximately two-thirds full each visit.
```

## Required Extraction

Customer:
Stella

Address:
6 Tarawera Terrace, St Heliers

Job Type:
maintenance

Price:
$405 per visit

Includes:
- Greenwaste removal
- Herbicide spraying
- Standard maintenance materials

## Required Customer Quote

Title:
Monthly Maintenance

Main Focus:
- Weeding
- Pruning
- Removal of self-seeded plants

Service Includes:
- Greenwaste removal
- Herbicide spraying
- Standard maintenance materials

Price:
- $405 per visit

## Required Xero Quote

Quote Title:
Monthly Maintenance

Line Item 1:

Description:
Ongoing Garden Maintenance

Includes:
- Greenwaste removal
- Herbicide spraying
- Standard maintenance materials

Quantity:
1

Unit Price:
405

Tax:
15% GST

## Must Not Show

- Labour hours
- 4.5 hours
- Internal labour allowance
- Legacy labour total ($360)
- Planting labour
- Raw calculator output

## Definition Of Done

The workflow is complete when:
- Customer quote draft is correct.
- Xero quote reflects the customer price ($405).
- Internal labour calculations do not overwrite the spoken customer price.
- Joe would send the generated Xero quote to a customer without major editing.
