/* =====================================================================
   Wine Tasting Companion — TASTING SCHEMA  (v0)
   ---------------------------------------------------------------------
   This is the data-driven "blind-tasting chart." The whole tasting game
   is generated from this file, so when Amy sends screenshots of her
   sommelier practice chart we just edit THIS file — no app rewrite.

   Structure mirrors a WSET-style grid (Appearance > Nose > Palate >
   Conclusions) as a faithful placeholder until Amy's exact questions land.

   Each field's `key` matches a key on the wine record in wines.js, so the
   user's guess can be scored against the wine's real published profile.
   ===================================================================== */

(function () {
  // ---- shared controlled vocabularies (must match wines.js exactly) ----
  const COLOR_OPTIONS = {
    red: ["Purple", "Ruby", "Garnet", "Tawny/Brick"],
    white: ["Pale lemon-green", "Lemon", "Gold", "Amber"],
    sparkling: ["Pale lemon-green", "Lemon", "Gold", "Amber"],
    rose: ["Pale pink", "Salmon", "Deep pink/Copper"],
    orange: ["Lemon", "Gold", "Amber"],
    dessert: ["Gold", "Amber", "Tawny/Brick"],
  };

  const AROMA_CATEGORIES = [
    "Red fruit", "Black fruit", "Citrus", "Stone fruit", "Tropical fruit",
    "Floral", "Herbal/Green", "Spice", "Oak/Vanilla", "Earth/Mineral",
    "Butter/Cream", "Dried fruit", "Nutty",
  ];

  // grouped for a glanceable picker
  const FLAVOR_GROUPS = [
    {
      group: "Fruit",
      notes: [
        "Plum", "Blackberry", "Black cherry", "Red cherry", "Raspberry",
        "Strawberry", "Blackcurrant (Cassis)", "Blueberry", "Cranberry", "Fig",
        "Lemon", "Lime", "Grapefruit", "Green apple", "Ripe apple", "Pear",
        "Quince", "Peach", "Apricot", "Nectarine", "Pineapple", "Mango",
        "Passionfruit", "Melon", "Lychee",
      ],
    },
    {
      group: "Earth & Oak",
      notes: [
        "Vanilla", "Oak/Cedar", "Tobacco", "Leather", "Dark chocolate",
        "Mocha/Coffee", "Wet stone/Mineral", "Flint", "Earth/Forest floor",
        "Mushroom", "Smoke", "Toast/Brioche", "Almond",
      ],
    },
    {
      group: "Spice",
      notes: [
        "Black pepper", "White pepper", "Cinnamon", "Clove", "Baking spice",
        "Licorice", "Dried herbs", "Eucalyptus",
      ],
    },
    {
      group: "Floral & Other",
      notes: ["Violet", "Rose", "Honey", "Butter", "Fresh grass", "Bell pepper"],
    },
  ];
  const ALL_FLAVOR_NOTES = FLAVOR_GROUPS.flatMap((g) => g.notes);

  // common grapes / countries for the "guess" conclusions
  // CMS-Americas examinable "probable varieties" (10 white + 14 red) + the
  // extra grapes our real Nashville list uses, so every wine stays answerable.
  const GRAPE_OPTIONS = [
    // examinable whites
    "Albariño", "Chardonnay", "Chenin Blanc", "Gewürztraminer", "Grüner Veltliner",
    "Pinot Grigio/Gris", "Riesling", "Sauvignon Blanc", "Torrontés", "Viognier",
    // examinable reds
    "Cabernet Sauvignon", "Cabernet Franc", "Carménère", "Corvina", "Gamay",
    "Grenache", "Malbec", "Merlot", "Nebbiolo", "Pinot Noir",
    "Sangiovese", "Syrah/Shiraz", "Tempranillo", "Zinfandel",
    // also present on our wine lists
    "Barbera", "Cortese", "Glera (Prosecco)", "Brachetto", "Champagne blend", "Other",
  ];

  const COUNTRY_OPTIONS = [
    "France", "Italy", "Spain", "USA", "Argentina", "Chile", "Australia",
    "New Zealand", "Germany", "Austria", "Portugal", "South Africa", "Other",
  ];

  // deductive calls (sommelier study mode)
  const REGION_OPTIONS = [
    "Barolo", "Barbaresco", "Piedmont", "Chianti Classico", "Brunello di Montalcino",
    "Valpolicella", "Tuscany", "Gavi", "Veneto", "Champagne", "Burgundy (Bourgogne)",
    "Chablis", "Sancerre", "Loire Valley", "Rhône Valley", "Provence", "Rioja",
    "Ribera del Duero", "Napa Valley", "Sonoma", "Willamette Valley", "Mosel",
    "Rheingau", "Mendoza", "Barossa Valley", "Marlborough", "Other",
  ];
  const AGE_OPTIONS = [
    "Youthful · 0–3 yr", "Developing · 4–7 yr", "Mature · 8–15 yr", "Aged · 15+ yr", "Non-vintage",
  ];

  // ---- ordinal scales (used for "off by one" partial credit) ----
  const SCALES = {
    appearanceIntensity: ["Pale", "Medium", "Deep"],
    noseIntensity: ["Light", "Medium", "Pronounced"],
    body: ["Light", "Medium", "Full"],
    acidity: ["Low", "Medium", "High"],
    tannin: ["None", "Low", "Medium", "High"],
    sweetness: ["Dry", "Off-dry", "Medium-sweet", "Sweet"],
    finish: ["Short", "Medium", "Long"],
  };

  const isRedOrTannic = (w) => w.type === "red" || w.tannin === "Medium" || w.tannin === "High";

  // ---- the chart itself: sections -> fields ----
  const SECTIONS = [
    {
      key: "appearance",
      title: "Appearance",
      icon: "👁",
      blurb: "Tilt the glass against something white. What do you see?",
      fields: [
        {
          key: "appearanceColor",
          label: "Color",
          prompt: "What color is it?",
          type: "select",
          ordinal: false,
          optionsByType: COLOR_OPTIONS,
          weight: 1,
        },
        {
          key: "appearanceIntensity",
          label: "Intensity",
          prompt: "How deep is the color?",
          type: "select",
          ordinal: true,
          options: SCALES.appearanceIntensity,
          weight: 1,
        },
      ],
    },
    {
      key: "nose",
      title: "Nose",
      icon: "👃",
      blurb: "Swirl, then take a few short sniffs. What families of aroma jump out?",
      fields: [
        {
          key: "noseIntensity",
          label: "Aroma intensity",
          prompt: "How strong is the nose?",
          type: "select",
          ordinal: true,
          options: SCALES.noseIntensity,
          weight: 1,
        },
        {
          key: "aromaCategories",
          label: "Aroma families",
          prompt: "Pick the families you smell",
          type: "multiselect",
          options: AROMA_CATEGORIES,
          weight: 2,
          suggested: 3,
        },
      ],
    },
    {
      key: "palate",
      title: "Palate",
      icon: "👅",
      blurb: "Take a sip and let it coat your mouth. Notice structure before flavor.",
      fields: [
        {
          key: "body",
          label: "Body",
          prompt: "How full does it feel?",
          type: "select",
          ordinal: true,
          options: SCALES.body,
          weight: 1.5,
        },
        {
          key: "acidity",
          label: "Acidity",
          prompt: "How mouth-watering / tart?",
          type: "select",
          ordinal: true,
          options: SCALES.acidity,
          weight: 1.5,
        },
        {
          key: "tannin",
          label: "Tannin",
          prompt: "That drying grip on your gums?",
          type: "select",
          ordinal: true,
          options: SCALES.tannin,
          weight: 1.5,
          appliesTo: isRedOrTannic,
        },
        {
          key: "sweetness",
          label: "Sweetness",
          prompt: "Bone dry or some sugar?",
          type: "select",
          ordinal: true,
          options: SCALES.sweetness,
          weight: 1,
        },
        {
          key: "flavorNotes",
          label: "Flavors",
          prompt: "Which specific notes do you taste?",
          type: "multiselect",
          options: ALL_FLAVOR_NOTES,
          groups: FLAVOR_GROUPS,
          weight: 3,
          suggested: 4,
        },
        {
          key: "finish",
          label: "Finish",
          prompt: "How long does the flavor linger after you swallow?",
          type: "select",
          ordinal: true,
          options: SCALES.finish,
          weight: 1,
        },
      ],
    },
    {
      key: "conclusions",
      title: "Conclusions",
      icon: "🎯",
      blurb: "Put it together — take your best guess at the bottle.",
      fields: [
        {
          key: "grapeGuess",
          label: "Main grape",
          prompt: "What's the primary grape?",
          type: "select",
          ordinal: false,
          options: GRAPE_OPTIONS,
          weight: 1.5,
          // scored against wine.grapes (any match) — see scoring.js logic in app.js
          matchAgainst: "grapes",
        },
        {
          key: "countryGuess",
          label: "Country",
          prompt: "Where's it from?",
          type: "select",
          ordinal: false,
          options: COUNTRY_OPTIONS,
          weight: 1,
          matchAgainst: "country",
        },
        {
          key: "regionGuess",
          label: "Region",
          prompt: "Region or appellation?",
          type: "select",
          ordinal: false,
          options: REGION_OPTIONS,
          weight: 1.5,
          matchAgainst: "region",
          fuzzy: true,
          studyOnly: true,
        },
        {
          key: "ageGuess",
          label: "Age",
          prompt: "Roughly how old is it?",
          type: "select",
          options: AGE_OPTIONS,
          weight: 1,
          synthetic: true,
          ageScore: true,
          studyOnly: true,
          appliesTo: (w) => !!w.vintage,
        },
        {
          key: "climateGuess",
          label: "Climate",
          prompt: "Cool, moderate, or warm climate?",
          type: "select",
          options: ["Cool", "Moderate", "Warm"],
          weight: 1,
          synthetic: true,
          climateScore: true,
          studyOnly: true,
        },
      ],
    },
  ];

  window.WTC_SCHEMA = {
    version: "v0-wset-placeholder",
    note: "Replace with Amy's sommelier practice chart when screenshots arrive.",
    sections: SECTIONS,
    scales: SCALES,
    colorOptions: COLOR_OPTIONS,
    aromaCategories: AROMA_CATEGORIES,
    flavorGroups: FLAVOR_GROUPS,
    allFlavorNotes: ALL_FLAVOR_NOTES,
    grapeOptions: GRAPE_OPTIONS,
    countryOptions: COUNTRY_OPTIONS,
  };
})();
