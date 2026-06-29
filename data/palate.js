/* =====================================================================
   Wine Tasting Companion — PALATE KNOWLEDGE
   ---------------------------------------------------------------------
   A small "organic" intelligence layer that lets the engine behave like
   it understands wine:
     • FAMILY        — each flavor note's family, for near-miss partial
                       credit ("you said Red cherry, it was Black cherry").
     • TYPE_FAMILIES — which families are plausible for each wine style,
                       so the tasting flow can surface the likely notes
                       first (adaptive, but type-based — never leaks the
                       actual answer).
   Edit alongside data/tasting-schema.js if Amy's chart changes the vocab.
   ===================================================================== */

(function () {
  const FAMILY = {
    // black fruit
    "Plum": "black_fruit", "Blackberry": "black_fruit", "Black cherry": "black_fruit",
    "Blackcurrant (Cassis)": "black_fruit", "Blueberry": "black_fruit",
    // red fruit
    "Red cherry": "red_fruit", "Raspberry": "red_fruit", "Strawberry": "red_fruit",
    "Cranberry": "red_fruit",
    // dried
    "Fig": "dried_fruit",
    // citrus
    "Lemon": "citrus", "Lime": "citrus", "Grapefruit": "citrus",
    // orchard
    "Green apple": "orchard", "Ripe apple": "orchard", "Pear": "orchard", "Quince": "orchard",
    // stone
    "Peach": "stone", "Apricot": "stone", "Nectarine": "stone",
    // tropical
    "Pineapple": "tropical", "Mango": "tropical", "Passionfruit": "tropical",
    "Melon": "tropical", "Lychee": "tropical",
    // oak / toast
    "Vanilla": "oak", "Oak/Cedar": "oak", "Dark chocolate": "oak", "Mocha/Coffee": "oak",
    "Smoke": "oak", "Toast/Brioche": "oak",
    // earth / savory
    "Tobacco": "earth", "Leather": "earth", "Earth/Forest floor": "earth", "Mushroom": "earth",
    // mineral
    "Wet stone/Mineral": "mineral", "Flint": "mineral",
    // nutty
    "Almond": "nutty",
    // spice
    "Black pepper": "spice", "White pepper": "spice", "Cinnamon": "spice", "Clove": "spice",
    "Baking spice": "spice", "Licorice": "spice",
    // herbal / green
    "Dried herbs": "herbal", "Eucalyptus": "herbal", "Fresh grass": "herbal", "Bell pepper": "herbal",
    // floral
    "Violet": "floral", "Rose": "floral", "Honey": "floral",
    // creamy
    "Butter": "dairy",
  };

  const FAMILY_LABEL = {
    black_fruit: "black fruit", red_fruit: "red fruit", dried_fruit: "dried fruit",
    citrus: "citrus", orchard: "orchard fruit", stone: "stone fruit", tropical: "tropical fruit",
    oak: "oak & toast", earth: "earth & savory", mineral: "minerality", nutty: "nutty",
    spice: "spice", herbal: "herbal / green", floral: "floral", dairy: "creamy", other: "other",
  };

  // plausible families per style (general knowledge, NOT the wine's answer)
  const TYPE_FAMILIES = {
    red: ["black_fruit", "red_fruit", "spice", "oak", "earth", "herbal", "dried_fruit", "floral", "mineral", "nutty"],
    white: ["citrus", "orchard", "stone", "tropical", "mineral", "oak", "floral", "herbal", "nutty", "dairy"],
    sparkling: ["citrus", "orchard", "stone", "oak", "floral", "mineral", "nutty", "dairy"],
    rose: ["red_fruit", "citrus", "stone", "floral", "herbal", "tropical"],
    dessert: ["stone", "dried_fruit", "tropical", "oak", "floral", "nutty", "citrus"],
    orange: ["orchard", "stone", "dried_fruit", "nutty", "herbal", "oak", "spice"],
  };

  function noteFamily(n) { return FAMILY[n] || "other"; }
  function relevantFamilies(type) { return new Set(TYPE_FAMILIES[type] || TYPE_FAMILIES.red); }

  window.WTC_PALATE = { FAMILY, FAMILY_LABEL, TYPE_FAMILIES, noteFamily, relevantFamilies };
})();
