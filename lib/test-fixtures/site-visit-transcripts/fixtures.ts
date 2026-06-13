import type { SiteVisitTranscriptFixture } from "./types"

export const siteVisitTranscriptFixtures: SiteVisitTranscriptFixture[] = [
  {
    id: "decking-susan-tarawera-terrace",
    name: "Decking - Susan / Tarawera Terrace",
    transcript: `OK just went and saw Susan at 6 Tarawera Terrace.
Deck comes out 12.8m and across 15.6m.
Need to remove existing deck.
Estimate 2 people 2 days for removal.
Use my usual removal calculator.
Use decking template.
Labour should be joists and decking only.
Posts are still in good condition.
Use Kwila 140x19 for entire deck.
Allow time for tidy up.
Entire job should be around 2 weeks with 2 people.
No staining for this job.
Access is poor so add 10 hours.`,
    expected: {
      tradeCategory: "decking",
      measurements: [
        { value: 12.8, unit: "m" },
        { value: 15.6, unit: "m" },
      ],
      exclusionsOrNotes: ["No staining for this job"],
      facts: [
        "client:Susan",
        "address:6 Tarawera Terrace",
        "decking:detected",
        "material:kwila",
        "product:Kwila 140x19",
        "existing_posts:retained",
        "removal:detected",
        "access:poor",
        "labour:2 people 2 days",
        "duration:2 weeks",
      ],
      nonEvents: [
        { id: "decking.missing-material" },
        { id: "decking.missing-access" },
        { id: "decking.missing-existing-structure" },
      ],
    },
  },
  {
    id: "retaining-replacement-poor-access",
    name: "Retaining - replacement timber retaining wall",
    transcript: `Quote for Mark at 18 Kauri Road, Glen Eden.
Replacement timber retaining wall along the lower boundary.
Wall is 9.6m long and 800mm high.
Allow H4 100x100 posts and post holes.
Include drainage with scoria and Novaflow.
Remove the old wall timbers and cart away waste.
Access is poor down steep steps, allow extra time.`,
    expected: {
      tradeCategory: "retaining",
      measurements: [
        { value: 9.6, unit: "m", dimension: "length" },
        { value: 800, unit: "mm", dimension: "height" },
      ],
      reviewNotices: [],
      facts: [
        "client:Mark",
        "address:18 Kauri Road, Glen Eden",
        "retaining:detected",
        "material:timber",
        "product:100x100 H4 posts",
        "drainage:detected",
        "waste:detected",
        "access:poor",
      ],
      nonEvents: [
        { id: "retaining.missing-drainage" },
        { id: "retaining.missing-material" },
        { id: "retaining.missing-posts" },
        { id: "retaining.missing-waste" },
        { id: "retaining.missing-access" },
      ],
    },
  },
  {
    id: "amy-hedge-quote",
    name: "Amy Hedge Quote",
    transcript: `Quote for Amy at 44 Amy Street.

Install approximately 11.5 metres of Ficus Tuffi hedge along the front boundary.

Provide options for:
- 1.2 metre
- 14 litre
- 25 litre

Supply garden mix and mulch.

Allow labour for installation.

Customer would like the hedge to eventually screen the property from the road.

Access is straightforward.

No irrigation required.`,
    expected: {
      tradeCategory: "planting",
      measurements: [{ value: 11.5, unit: "m", approximate: true }],
      reviewNotices: [{ messageIncludes: "approximate" }],
      exclusionsOrNotes: ["No irrigation required"],
      facts: [
        "client:Amy",
        "address:44 Amy Street",
        "planting:detected",
        "plant:Ficus Tuffi",
        "plant_option:1.2m",
        "plant_option:14l",
        "plant_option:25l",
        "material:garden mix",
        "material:mulch",
        "access:straightforward",
      ],
      nonEvents: [
        { fact: "decking:detected" },
        { fact: "retaining:detected" },
      ],
    },
  },
  {
    id: "sarah-multi-area-planting",
    name: "Sarah Multi-Area Planting",
    transcript: `Quote for Sarah at 44a Amy Street, Ellerslie.

11.5m lower planting area.
Need to add 1 hour for access.
Need pricing for approximately 1m size Ficus Tuffi, 25L and 45L.

Labour for lower planting:
1.25 days, 2 people.

Lower paver area:
1.5m x 3.5m.

Upper planting area:
13.7m hedge row to be planted.

Need to determine the number of plants relative to size using a calculator.
Pricing options same as lower hedge:
1m, 25L and 45L.

Labour for upper planting:
1.75 days, 2 people.

Include hardfill / removal of old soil.

Include 6 bags garden mix.`,
    expected: {
      tradeCategory: "planting",
      measurements: [
        { value: 11.5, unit: "m" },
        { value: 13.7, unit: "m" },
      ],
      facts: [
        "client:Sarah",
        "address:44a Amy Street, Ellerslie",
        "planting:detected",
        "area:Lower planting area",
        "area:Upper planting area",
        "plant:Ficus Tuffi",
        "plant_option:1m",
        "plant_option:25l",
        "plant_option:45l",
        "material:garden mix",
        "waste:detected",
      ],
      nonEvents: [
        { fact: "decking:detected" },
        { fact: "retaining:detected" },
      ],
    },
  },
  {
    id: "simple-gardening-maintenance",
    name: "Simple Gardening Maintenance Visit",
    transcript: `Quote for Ben at 7 Nikau Place, Mount Eden.
Simple gardening maintenance visit.
Mow lawns, trim edges, weed the front beds and prune the camellias by the path.
Take away greenwaste.
No calculators needed and no dimensions taken.
Allow half a day for one person.`,
    expected: {
      tradeCategory: "gardening-maintenance",
      reviewNotices: [],
      facts: [
        "client:Ben",
        "address:7 Nikau Place, Mount Eden",
        "gardening:detected",
        "greenwaste:detected",
        "calculator:none",
      ],
      nonEvents: [
        { fact: "decking:detected" },
        { fact: "retaining:detected" },
        { fact: "planting:detected" },
        { measurementValue: 7 },
      ],
    },
  },
  {
    id: "ambiguous-quote-missing-measurements-materials",
    name: "Ambiguous Quote",
    transcript: `Quote for Lee at 22 Totara Lane.
Client wants a new outdoor area and maybe some screening along the fence.
Need to go back for actual measurements.
Material selection not confirmed.
No plant sizes chosen yet.
Access seemed okay but scope is still unclear.`,
    expected: {
      tradeCategory: "ambiguous",
      reviewNotices: [],
      facts: [
        "client:Lee",
        "address:22 Totara Lane",
        "missing:measurements",
        "missing:materials",
        "scope:unclear",
      ],
      nonEvents: [
        { fact: "decking:detected" },
        { fact: "retaining:detected" },
        { fact: "planting:detected" },
      ],
    },
  },
  {
    id: "approximate-measurements",
    name: "Approximate Measurements",
    transcript: `Quote for Olivia at 5 Beach Road, Devonport.
Retaining wall is about 10m long.
Maybe 800 high near the driveway end.
Roughly 5m of extra garden edging beside it.
Need to confirm all measurements before pricing.`,
    expected: {
      tradeCategory: "retaining",
      measurements: [
        { value: 10, unit: "m", dimension: "length", approximate: true },
        { value: 800, unit: "mm", dimension: "height", uncertain: true, unit_inferred: true },
        { value: 5, unit: "m", approximate: true },
      ],
      reviewNotices: [
        { messageIncludes: "about 10m long" },
        { messageIncludes: "Maybe 800 high" },
        { messageIncludes: "Roughly 5m" },
      ],
      facts: [
        "client:Olivia",
        "address:5 Beach Road, Devonport",
        "retaining:detected",
        "measurement:approximate",
        "measurement:uncertain",
      ],
    },
  },
  {
    id: "exclusions",
    name: "Exclusions",
    transcript: `Quote for Nick at 31 Willow Street, Ellerslie.
Replace the small deck landing with Kwila boards.
No irrigation.
No staining.
Client supplying plants for the side garden.
We only allow labour and fixings for the landing.`,
    expected: {
      tradeCategory: "decking",
      exclusionsOrNotes: ["No irrigation", "No staining", "Client supplying plants for the side garden"],
      facts: [
        "client:Nick",
        "address:31 Willow Street, Ellerslie",
        "decking:detected",
        "material:kwila",
        "client_supply:plants",
      ],
      nonEvents: [{ id: "decking.missing-material" }],
    },
  },
  {
    id: "product-specification-quote",
    name: "Product Specification Quote",
    transcript: `Quote for Priya at 12 Rimu Drive, Remuera.
Use Kwila 140x19 for the new deck boards.
Plant Ficus Tuffi 25L along the side fence.
Use 100x100 H4 posts for the short timber retaining wall.
Allow stainless fixings and 6 bags garden mix.
Access is normal.`,
    expected: {
      tradeCategory: "multi-trade",
      measurements: [],
      facts: [
        "client:Priya",
        "address:12 Rimu Drive, Remuera",
        "decking:detected",
        "retaining:detected",
        "planting:detected",
        "product:Kwila 140x19",
        "product:Ficus Tuffi 25L",
        "product:100x100 H4 posts",
        "material:timber",
        "material:garden mix",
      ],
      nonEvents: [
        { id: "decking.missing-material" },
        { id: "retaining.missing-material" },
      ],
    },
  },
  {
    id: "customer-address-extraction",
    name: "Customer + Address Extraction",
    transcript: `Quote for Moana Williams at 9A Wairiki Road, Mount Eden.
Second visit is for James at 14 Kowhai Avenue, New Lynn.
Also note possible future work for Aroha at 3 Te Atatu Road, Te Atatu Peninsula.
For this quote only use Moana as the customer and Wairiki Road as the site.
Simple garden tidy with greenwaste removal.`,
    expected: {
      tradeCategory: "gardening-maintenance",
      facts: [
        "client:Moana Williams",
        "address:9A Wairiki Road, Mount Eden",
        "street_number:9A",
        "street_name:Wairiki Road",
        "suburb:Mount Eden",
        "road_name:Wairiki Road",
        "gardening:detected",
      ],
      nonEvents: [
        { fact: "client:James" },
        { fact: "address:14 Kowhai Avenue, New Lynn" },
      ],
    },
  },
]
