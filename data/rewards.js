/* =====================================================================
   Wine Tasting Companion — REWARDS
   ---------------------------------------------------------------------
   Three layers, all driven by your saved history:
     1) LEVELS    — cumulative ladder (try X wines -> new tier), like the
                    Top O' Mac beer club.
     2) AWARDS    — earned per tasting based on how you scored.
     3) BADGES    — "collector" milestones for breadth (countries, grapes,
                    styles, restaurants).
   ===================================================================== */

(function () {
  // --- LEVELS: unlocked by total number of wines tasted ---
  const LEVELS = [
    { at: 0,   name: "Newcomer",            icon: "🍇" },
    { at: 1,   name: "First Pour",          icon: "🥂" },
    { at: 3,   name: "Curious Sipper",      icon: "🍷" },
    { at: 7,   name: "Tasting-Room Regular",icon: "🍷" },
    { at: 15,  name: "Palate in Training",  icon: "📖" },
    { at: 30,  name: "Cellar Explorer",     icon: "🗝" },
    { at: 50,  name: "Connoisseur",         icon: "🎖" },
    { at: 75,  name: "Wine Sage",           icon: "🦉" },
    { at: 100, name: "Master of the Glass", icon: "👑" },
  ];

  // --- AWARDS: per-tasting medal based on total score % ---
  const AWARDS = [
    { min: 90, name: "Golden Palate",  icon: "🏆", line: "Sommelier-level read." },
    { min: 75, name: "Sharp Nose",     icon: "🥇", line: "You really nailed it." },
    { min: 60, name: "Solid Sip",      icon: "🥈", line: "Strong, confident tasting." },
    { min: 40, name: "Getting There",  icon: "🥉", line: "The palate is waking up." },
    { min: 0,  name: "Beginner's Luck",icon: "🍀", line: "Every great taster starts here." },
  ];

  // --- per-tasting bonus ribbons (section-specific highlights) ---
  const RIBBONS = [
    { key: "keenNose",       name: "Keen Nose",        icon: "👃", test: (s) => s.sectionPct.nose >= 80 },
    { key: "flavorHound",    name: "Flavor Hound",     icon: "🐕", test: (s) => s.fieldRecall.flavorNotes >= 0.6 },
    { key: "structureScout", name: "Structure Scout",  icon: "🏗", test: (s) => s.sectionPct.palate >= 80 },
    { key: "grapeWhisperer", name: "Grape Whisperer",  icon: "🍇", test: (s) => s.fieldHit.grapeGuess === true },
    { key: "atlasPalate",    name: "Atlas Palate",     icon: "🗺", test: (s) => s.fieldHit.countryGuess === true },
    { key: "eagleEye",       name: "Eagle Eye",        icon: "👁", test: (s) => s.sectionPct.appearance >= 100 },
  ];

  // --- BADGES: breadth/collection milestones (computed over all history) ---
  // each badge: id, name, icon, hint, and progress(history) -> {have, need}
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

  const BADGES = [
    {
      id: "globe-trotter", name: "Globe-Trotter", icon: "🌍",
      hint: "Taste wines from 5 different countries",
      progress: (h) => ({ have: uniq(h.map((t) => t.wine.country)).length, need: 5 }),
    },
    {
      id: "grape-grazer", name: "Grape Grazer", icon: "🍇",
      hint: "Taste 8 different grape varieties",
      progress: (h) => ({ have: uniq(h.flatMap((t) => t.wine.grapes || [])).length, need: 8 }),
    },
    {
      id: "all-rounder", name: "All-Rounder", icon: "🎨",
      hint: "Taste a red, a white, a rosé and a sparkling",
      progress: (h) => ({ have: uniq(h.map((t) => t.wine.type)).filter((t) => ["red", "white", "rose", "sparkling"].includes(t)).length, need: 4 }),
    },
    {
      id: "regular", name: "The Regular", icon: "🍴",
      hint: "Taste wines at 3 different restaurants",
      progress: (h) => ({ have: uniq(h.map((t) => t.restaurantName)).length, need: 3 }),
    },
    {
      id: "bubbles", name: "Bubbles Lover", icon: "🫧",
      hint: "Taste 3 sparkling wines",
      progress: (h) => ({ have: h.filter((t) => t.wine.type === "sparkling").length, need: 3 }),
    },
    {
      id: "sharp-shooter", name: "Sharpshooter", icon: "🎯",
      hint: "Score 75%+ on five tastings",
      progress: (h) => ({ have: h.filter((t) => t.totalPct >= 75).length, need: 5 }),
    },
  ];

  function levelFor(count) {
    let current = LEVELS[0];
    let next = null;
    for (let i = 0; i < LEVELS.length; i++) {
      if (count >= LEVELS[i].at) current = LEVELS[i];
      else { next = LEVELS[i]; break; }
    }
    return { current, next };
  }

  function awardFor(pct) {
    return AWARDS.find((a) => pct >= a.min) || AWARDS[AWARDS.length - 1];
  }

  function ribbonsFor(scoreSummary) {
    return RIBBONS.filter((r) => {
      try { return r.test(scoreSummary); } catch (e) { return false; }
    });
  }

  window.WTC_REWARDS = { LEVELS, AWARDS, RIBBONS, BADGES, levelFor, awardFor, ribbonsFor };
})();
