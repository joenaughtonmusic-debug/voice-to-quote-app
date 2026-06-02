export type TradeVocabularyEntry = {
  category: "plant" | "material" | "tool" | "task" | "mishearing"
  term: string
  aliases: string[]
  notes: string
}

export const defaultTradeVocabulary: TradeVocabularyEntry[] = [
  {
    category: "mishearing",
    term: "flax",
    aliases: ["flecks", "flex", "flacks"],
    notes: "NZ garden plant. In gardening context, 'do not remove flecks' likely means 'do not remove flax'.",
  },
  {
    category: "plant",
    term: "Griselinia",
    aliases: ["grislynia", "griselinia", "grisalinea", "gris linia"],
    notes: "Common NZ hedging plant.",
  },
  {
    category: "plant",
    term: "Ficus Tuffi",
    aliases: ["ficus tuffy", "ficus tuffi", "tuffy", "tuffi"],
    notes: "Common hedging ficus cultivar.",
  },
  {
    category: "plant",
    term: "Buxus",
    aliases: ["box hedge", "boxwood", "bucks us", "buxis"],
    notes: "Often referred to as box hedge.",
  },
  {
    category: "plant",
    term: "Pittosporum",
    aliases: ["pittosporum", "pitosporum", "pittosporam", "pittisporum"],
    notes: "Common NZ shrub or hedging plant.",
  },
  {
    category: "plant",
    term: "Corokia",
    aliases: ["korokia", "corokya"],
    notes: "Common NZ native hedging shrub.",
  },
  {
    category: "plant",
    term: "Coprosma",
    aliases: ["coprosner", "coprosma"],
    notes: "Common NZ native shrub.",
  },
  {
    category: "plant",
    term: "Hebe",
    aliases: ["hebe", "heeby"],
    notes: "Common NZ garden shrub.",
  },
  {
    category: "material",
    term: "mulch",
    aliases: ["mulching", "bark mulch", "garden mulch"],
    notes: "Garden bed covering material.",
  },
  {
    category: "material",
    term: "compost",
    aliases: ["organic compost", "garden compost"],
    notes: "Soil improvement material.",
  },
  {
    category: "material",
    term: "topsoil",
    aliases: ["top soil", "garden soil"],
    notes: "Soil supply or top-up material.",
  },
  {
    category: "material",
    term: "weed mat",
    aliases: ["weedmat", "weed cloth", "landscape fabric"],
    notes: "Weed suppression fabric.",
  },
  {
    category: "tool",
    term: "hedge trimmer",
    aliases: ["hedger", "hedge cutter"],
    notes: "Tool for hedge trimming.",
  },
  {
    category: "tool",
    term: "line trimmer",
    aliases: ["weed eater", "weedeater", "weed whacker"],
    notes: "Tool for edges and long grass.",
  },
  {
    category: "tool",
    term: "chainsaw",
    aliases: ["chain saw"],
    notes: "Tree and branch cutting tool.",
  },
  {
    category: "task",
    term: "greenwaste removal",
    aliases: ["green waste", "garden waste", "tip run", "cart away"],
    notes: "Removal and disposal of garden waste.",
  },
  {
    category: "task",
    term: "garden tidy",
    aliases: ["garden clean up", "garden cleanup", "initial tidy", "section tidy"],
    notes: "One-off tidy-up scope.",
  },
  {
    category: "task",
    term: "ongoing maintenance",
    aliases: ["regular maintenance", "two-monthly maintenance", "bi-monthly maintenance", "monthly maintenance"],
    notes: "Recurring garden maintenance scope.",
  },
]
