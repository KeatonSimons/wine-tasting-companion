/* =====================================================================
   Wine Tasting Companion — app engine + UI
   Vanilla JS, no build step. Reads:
     window.WTC_SCHEMA   (tasting chart)
     window.WTC_DATA     (real restaurants + wines)
     window.WTC_REWARDS  (levels / awards / badges)
     window.WTC_PALATE   (flavor families + style relevance)

   "Organic" intelligence layers:
     • forgiving scoring  — near-miss flavor notes earn partial credit
     • adaptive flow      — flavor picker tunes to the wine's style
     • palate profile     — learns what you catch / miss / how you improve
     • autosave & resume  — never lose a tasting
     • smart suggestion   — nudges your next pour to widen your range

   Reference prototype for the Emergent build — see BUILD-BRIEF-FOR-EMERGENT.md.
   ===================================================================== */

(function () {
  "use strict";

  const SCHEMA = window.WTC_SCHEMA;
  const DATA = window.WTC_DATA || { seeded: false, restaurants: [], wines: [] };
  const REWARDS = window.WTC_REWARDS;
  const PALATE = window.WTC_PALATE || {
    noteFamily: () => "other", relevantFamilies: () => null, FAMILY_LABEL: {},
  };
  const GRAPES = window.WTC_GRAPES || [];
  const REGIONS = window.WTC_REGIONS || [];
  const THEORY = window.WTC_THEORY || [];
  const HKEY = "wtc_history_v1";
  const SKEY = "wtc_srs_v1";   // spaced-repetition schedule for flashcards
  const SRS_DAYS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };  // Leitner box → days until due
  const OKEY = "wtc_onboarded";
  const PKEY = "wtc_inprogress_v1";

  // ---------------- storage ----------------
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HKEY)) || []; }
    catch (e) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HKEY, JSON.stringify(h)); } catch (e) {}
  }
  function persistProgress() {
    if (!state.wineId) return;
    try {
      localStorage.setItem(PKEY, JSON.stringify({
        wineId: state.wineId, restaurantId: state.restaurantId, mode: state.mode,
        stepIndex: state.stepIndex, guesses: state.guesses, dateISO: new Date().toISOString(),
      }));
    } catch (e) {}
  }
  function clearProgress() { try { localStorage.removeItem(PKEY); } catch (e) {} }
  function loadProgress() { try { return JSON.parse(localStorage.getItem(PKEY)); } catch (e) { return null; } }

  // ---------------- state ----------------
  const state = {
    stack: ["home"],
    mode: "solo",             // "solo" (you picked it) | "study" (blind practice)
    restaurantId: null,
    wineId: null,
    stepIndex: 0,
    guesses: {},
    showAllNotes: false,
    lastResultId: null,
    historyDetailId: null,
    cardOrder: null,           // flashcard study
    cardIdx: 0,
    cardFlipped: false,
    quizMode: false,
    deck: "grapes",            // "grapes" | "regions"
    exam: null,                // timed blind exam: { wineIds, idx, results, mins, deadline }
    examPrefs: { tier: "all", n: 3, mins: 5 },
    review: null,              // spaced-repetition session: { queue, idx, got, missed }
  };
  let examTick = null;
  const screen = () => state.stack[state.stack.length - 1];
  function go(s) { state.stack.push(s); render(); window.scrollTo(0, 0); }
  function replace(s) { state.stack[state.stack.length - 1] = s; render(); window.scrollTo(0, 0); }
  function back() {
    if (state.stack.length > 1) state.stack.pop();
    render(); window.scrollTo(0, 0);
  }
  function goTab(s) { state.stack = [s]; render(); window.scrollTo(0, 0); }

  // ---------------- helpers ----------------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const typeEmoji = { red: "🍷", white: "🥂", sparkling: "🍾", rose: "🌸", dessert: "🍯", orange: "🟠" };
  const typeLabel = { red: "red", white: "white", sparkling: "sparkling", rose: "rosé", dessert: "dessert wine", orange: "orange wine" };
  const wineById = (id) => DATA.wines.find((w) => w.id === id);
  const restById = (id) => DATA.restaurants.find((r) => r.id === id);
  const winesForRest = (id) => DATA.wines.filter((w) => (w.restaurantIds || []).includes(id));

  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function askableFields(section, wine) {
    return section.fields.filter((f) => {
      if (f.studyOnly && state.mode !== "study") return false;   // deductive calls = blind mode only
      if (f.appliesTo && !f.appliesTo(wine)) return false;
      if (f.synthetic) return true;                              // e.g. ageGuess (computed, no wine field)
      if (f.matchAgainst) {
        const v = wine[f.matchAgainst];
        return v != null && (Array.isArray(v) ? v.length : true);
      }
      return wine[f.key] != null && wine[f.key] !== "" &&
        !(Array.isArray(wine[f.key]) && wine[f.key].length === 0);
    });
  }

  // --- deductive helpers (sommelier study mode) ---
  function ageBracket(vintage) {
    const yr = parseInt(vintage, 10);
    if (!vintage || String(vintage).toUpperCase() === "NV" || isNaN(yr)) return "Non-vintage";
    const age = new Date().getFullYear() - yr;
    if (age <= 3) return "Youthful · 0–3 yr";
    if (age <= 7) return "Developing · 4–7 yr";
    if (age <= 15) return "Mature · 8–15 yr";
    return "Aged · 15+ yr";
  }
  const deaccent = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function fuzzyContains(guess, actual) {
    if (!guess || !actual) return false;
    const a = deaccent(actual);
    const gt = deaccent(guess).match(/[a-z]+/g) || [];
    const at = a.match(/[a-z]+/g) || [];
    return gt.some((t) => t.length > 3 && (a.includes(t) || at.some((x) => x.includes(t) || t.includes(x))));
  }
  // derive a CMS-style climate call from the wine's region/country
  function climateFor(wine) {
    const r = ((wine.region || "") + " " + (wine.country || "")).toLowerCase();
    const cool = ["champagne", "mosel", "chablis", "sancerre", "loire", "chinon", "vouvray", "sonoma coast", "bourgogne", "burgundy", "gevrey", "marlborough", "rheingau", "willamette", "germany"];
    const warm = ["napa", "rutherford", "provence", "côtes du rhône", "chateauneuf", "châteauneuf", "gigondas", "rioja", "barossa", "mclaren", "south australia", "douro", "peumo", "cachapoal"];
    if (cool.some((k) => r.includes(k))) return "Cool";
    if (warm.some((k) => r.includes(k))) return "Warm";
    return "Moderate";
  }
  const askableSections = (wine) =>
    SCHEMA.sections.filter((s) => askableFields(s, wine).length > 0);

  function optionsFor(field, wine) {
    let opts = field.optionsByType
      ? (field.optionsByType[wine.type] || field.optionsByType.red).slice()
      : (field.options || []).slice();
    const actual = wine[field.key];
    if (typeof actual === "string" && actual && !opts.includes(actual)) opts.push(actual);
    return opts;
  }

  // ---------------- scoring (forgiving / "organic") ----------------
  function grapeMatch(guess, grapes) {
    if (!guess || !grapes) return false;
    const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
    const gTokens = norm(guess).match(/[a-z]+/g) || [norm(guess)];
    return grapes.some((wg) => {
      const w = norm(wg);
      return gTokens.some((t) => t.length > 3 && (w.includes(t) || t.includes(w)));
    });
  }

  function scoreTasting(wine, guesses) {
    const detail = [];
    const sectionAgg = {};
    const fieldRecall = {};
    const fieldHit = {};
    let totW = 0, totS = 0;

    SCHEMA.sections.forEach((section) => {
      const fields = askableFields(section, wine);
      let secW = 0, secS = 0;
      fields.forEach((field) => {
        const w = field.weight || 1;
        const g = guesses[field.key];
        let s = 0;
        const d = { section: section.key, key: field.key, label: field.label, type: field.type };

        if (field.type === "multiselect") {
          const actual = wine[field.key] || [];
          const guessed = Array.isArray(g) ? g : [];
          const matched = guessed.filter((x) => actual.includes(x));
          const missed = actual.filter((x) => !guessed.includes(x));
          let wrong = guessed.filter((x) => !actual.includes(x));

          // near-miss credit: a wrong guess in the same flavor family as a
          // missed actual note counts half. (flavorNotes only — aroma
          // categories ARE families already.)
          const near = [];
          if (field.key === "flavorNotes" && PALATE.noteFamily) {
            const pool = missed.slice();
            wrong = wrong.filter((gx) => {
              const fam = PALATE.noteFamily(gx);
              const i = pool.findIndex((m) => PALATE.noteFamily(m) === fam);
              if (i >= 0) { near.push({ guess: gx, actual: pool[i] }); pool.splice(i, 1); return false; }
              return true;
            });
          }

          const credited = matched.length + 0.5 * near.length;
          const recall = actual.length ? credited / actual.length : 0;
          const precision = guessed.length ? credited / guessed.length : 0;
          s = guessed.length ? (0.8 * recall + 0.2 * precision) : 0;

          fieldRecall[field.key] = actual.length ? credited / actual.length : 0;
          d.matched = matched; d.missed = missed; d.wrong = wrong; d.near = near;
          d.skipped = guessed.length === 0;
          const stillMissed = missed.filter((m) => !near.some((n) => n.actual === m));
          if (stillMissed.length && field.key === "flavorNotes") {
            d.callout = "Actually — there was " + stillMissed.slice(0, 2).join(" and ") + " in there.";
          } else if (stillMissed.length && field.key === "aromaCategories") {
            d.callout = "There was also " + stillMissed.slice(0, 2).join(" and ") + " on the nose.";
          } else if (near.length && field.key === "flavorNotes") {
            d.callout = "So close — you were in the right neighborhood.";
          }
        } else if (field.ageScore) {
          const opts = field.options || [];
          const actualVal = ageBracket(wine.vintage);
          d.your = g || null; d.actual = actualVal; d.skipped = !g;
          if (g === actualVal) s = 1;
          else if (g && actualVal !== "Non-vintage" && g !== "Non-vintage" &&
                   opts.includes(g) && opts.includes(actualVal)) {
            s = Math.abs(opts.indexOf(g) - opts.indexOf(actualVal)) === 1 ? 0.5 : 0;
          } else s = 0;
          fieldHit[field.key] = s === 1;
        } else if (field.climateScore) {
          const opts = field.options || [];
          const actualVal = climateFor(wine);
          d.your = g || null; d.actual = actualVal; d.skipped = !g;
          if (g === actualVal) s = 1;
          else if (g && opts.includes(g) && opts.includes(actualVal)) {
            s = Math.abs(opts.indexOf(g) - opts.indexOf(actualVal)) === 1 ? 0.5 : 0;
          } else s = 0;
          fieldHit[field.key] = s === 1;
        } else if (field.matchAgainst) {
          const actualVal = wine[field.matchAgainst];
          d.your = g || null; d.actual = Array.isArray(actualVal) ? actualVal.join(", ") : actualVal;
          d.skipped = !g;
          let hit = false;
          if (g) {
            hit = field.key === "grapeGuess" ? grapeMatch(g, wine.grapes || [])
              : field.fuzzy ? fuzzyContains(g, actualVal)
              : (String(g).toLowerCase() === String(actualVal).toLowerCase());
          }
          s = hit ? 1 : 0;
          fieldHit[field.key] = hit;
        } else {
          const opts = optionsFor(field, wine);
          const actualVal = wine[field.key];
          d.your = g || null; d.actual = actualVal;
          d.skipped = !g;
          if (g === actualVal) s = 1;
          else if (g && opts.includes(g) && opts.includes(actualVal)) {
            const diff = Math.abs(opts.indexOf(g) - opts.indexOf(actualVal));
            s = diff === 1 ? 0.5 : 0;
          } else s = 0;
        }

        d.pct = Math.round(s * 100);
        d.weight = w;
        detail.push(d);
        secW += w; secS += s * w;
        totW += w; totS += s * w;
      });
      if (secW > 0) sectionAgg[section.key] = Math.round((secS / secW) * 100);
    });

    const totalPct = totW ? Math.round((totS / totW) * 100) : 0;
    return { totalPct, sectionPct: sectionAgg, fieldRecall, fieldHit, detail };
  }

  // ---------------- smart suggestion ----------------
  function suggestNext(history) {
    if (!DATA.wines.length) return null;
    const tasted = new Set(history.map((t) => t.wine.id));
    const untasted = DATA.wines.filter((w) => !tasted.has(w.id));
    if (!untasted.length) return null;
    const types = new Set(history.map((t) => t.wine.type));
    const countries = new Set(history.map((t) => t.wine.country));
    const grapes = new Set(history.flatMap((t) => t.wine.grapes || []));

    let pick = untasted.find((w) => !types.has(w.type));
    let reason = pick ? `A ${typeLabel[pick.type] || pick.type} you haven't tried yet` : null;
    if (!pick) { pick = untasted.find((w) => !countries.has(w.country)); if (pick) reason = `From ${pick.country} — new ground for your palate`; }
    if (!pick) { pick = untasted.find((w) => (w.grapes || []).some((g) => !grapes.has(g))); if (pick) reason = `A grape you haven't met: ${(pick.grapes || [])[0]}`; }
    if (!pick) { pick = untasted[0]; reason = "One more for the cellar"; }
    return { wine: pick, reason };
  }

  // ---------------- palate profile ("learns" you) ----------------
  function computePalate(history) {
    const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
    const totals = history.map((t) => t.totalPct);
    const overall = avg(totals);
    const recent = avg(totals.slice(-5));
    const prev = totals.length > 5 ? avg(totals.slice(-10, -5)) : 0;
    const trend = prev ? recent - prev : 0;

    const secAvg = {};
    ["appearance", "nose", "palate", "conclusions"].forEach((k) => {
      const vals = history.map((t) => t.score && t.score.sectionPct ? t.score.sectionPct[k] : undefined)
        .filter((v) => v != null);
      if (vals.length) secAvg[k] = avg(vals);
    });
    const secEntries = Object.entries(secAvg);
    let strong = null, weak = null;
    if (secEntries.length) {
      strong = secEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
      weak = secEntries.reduce((a, b) => (b[1] < a[1] ? b : a));
    }

    const seen = {}, hit = {};
    history.forEach((t) => {
      const fn = (t.score && t.score.detail || []).find((d) => d.key === "flavorNotes");
      if (!fn) return;
      (fn.matched || []).forEach((x) => { hit[x] = (hit[x] || 0) + 1; });
      (fn.matched || []).concat(fn.missed || []).forEach((x) => { seen[x] = (seen[x] || 0) + 1; });
    });
    const rate = (x) => (seen[x] ? (hit[x] || 0) / seen[x] : 0);
    const repeated = Object.keys(seen).filter((x) => seen[x] >= 2);
    const caught = repeated.filter((x) => rate(x) >= 0.6).sort((a, b) => rate(b) - rate(a)).slice(0, 6);
    const missed = repeated.filter((x) => rate(x) < 0.4).sort((a, b) => rate(a) - rate(b)).slice(0, 6);

    const grapes = new Set(history.flatMap((t) => t.wine.grapes || [])).size;
    const countries = new Set(history.map((t) => t.wine.country)).size;
    const types = [...new Set(history.map((t) => t.wine.type))];
    const best = history.slice().sort((a, b) => b.totalPct - a.totalPct)[0];

    return { n: history.length, overall, recent, prev, trend, secAvg, strong, weak, caught, missed, grapes, countries, types, best };
  }

  function palateRead(p) {
    const lbl = { appearance: "eyes", nose: "nose", palate: "palate", conclusions: "deduction" };
    let s = "";
    if (p.strong) s += `Your sharpest sense is your ${lbl[p.strong[0]] || p.strong[0]} (${p.strong[1]}%). `;
    if (p.weak && (!p.strong || p.weak[0] !== p.strong[0])) s += `Biggest growth area: ${lbl[p.weak[0]] || p.weak[0]} (${p.weak[1]}%). `;
    if (p.prev) s += p.trend >= 3 ? "And you're clearly sharpening — keep going." :
      p.trend <= -3 ? "A tougher run lately — trust your first instinct." : "You're holding steady.";
    else s += "Keep tasting and this read gets sharper.";
    return s;
  }

  // ---------------- render: shell ----------------
  const root = () => document.getElementById("app");

  function render() {
    const s = screen();
    // stop the exam countdown whenever we're not mid-pour
    if (examTick && !(s === "tasting" && state.exam)) { clearInterval(examTick); examTick = null; }
    let html = "";
    const showTabs = ["home", "history", "palate", "rewards", "historyDetail"].includes(s);

    if (s === "home") html = viewHome();
    else if (s === "onboarding") html = viewOnboarding();
    else if (s === "mode") html = viewMode();
    else if (s === "restaurants") html = viewRestaurants();
    else if (s === "winelist") html = viewWineList();
    else if (s === "tasting") html = viewTasting();
    else if (s === "reveal") html = viewReveal();
    else if (s === "history") html = viewHistory();
    else if (s === "historyDetail") html = viewHistoryDetail();
    else if (s === "palate") html = viewPalate();
    else if (s === "flashcards") html = viewFlashcards();
    else if (s === "review") html = viewReview();
    else if (s === "examsetup") html = viewExamSetup();
    else if (s === "examreport") html = viewExamReport();
    else if (s === "rewards") html = viewRewards();

    root().innerHTML = `<div class="fade-in">${html}</div>` + (showTabs ? tabbar(s) : "");
    bind(s);
  }

  function topbar(title, crumb) {
    return `<div class="topbar">
      <button class="back" data-act="back" aria-label="Back">‹</button>
      <h1>${esc(title)}</h1>
    </div>${crumb ? `<div class="crumb muted" style="margin:-6px 2px 8px">${esc(crumb)}</div>` : ""}`;
  }

  function tabbar(active) {
    const on = (id) => active === id || (id === "history" && active === "historyDetail");
    const tab = (id, ic, label) =>
      `<button data-tab="${id}" class="${on(id) ? "active" : ""}"><span class="t-ic">${ic}</span>${label}</button>`;
    return `<nav class="tabbar">
      ${tab("home", "🍷", "Taste")}
      ${tab("history", "📖", "Cellar")}
      ${tab("palate", "👅", "Palate")}
      ${tab("rewards", "🏆", "Rewards")}
    </nav>`;
  }

  // ---------------- views ----------------
  function viewOnboarding() {
    const step = (ic, t, d) => `
      <div class="ob-step">
        <div class="ob-num">${ic}</div>
        <div><div class="ob-t">${t}</div><div class="ob-d">${d}</div></div>
      </div>`;
    return `
      <div class="hero card" style="margin-top:24px">
        <div class="glass-mark">🍷</div>
        <h1>How it works</h1>
        <p>A tasting game for the bottle right in front of you.</p>
      </div>
      <div class="card" style="margin-top:14px">
        ${step("🍴", "Find your wine", "Pick the restaurant you're at, then tap the bottle you ordered.")}
        <div class="divider"></div>
        ${step("👃", "Play the tasting", "Mark what you see, smell and taste — guess it like a sommelier.")}
        <div class="divider"></div>
        ${step("🏆", "See what you nailed", "Get scored, earn awards & levels, and watch your palate sharpen.")}
      </div>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-act="onboard-done">Let's taste 🍷</button>
      <div class="spacer"></div>
    `;
  }

  function viewMode() {
    return `
      ${topbar("How are you tasting?", "Pick a mode")}
      <div class="row-list" style="margin-top:8px">
        <div class="row mode-card" data-act="mode-solo">
          <div class="row-emoji">🍷</div>
          <div class="row-body">
            <div class="row-title">Just me</div>
            <div class="row-sub">Solo tasting — pick the wine and score your palate.</div>
          </div>
          <div class="row-go">›</div>
        </div>
        <div class="row mode-card" data-act="mode-study">
          <div class="row-emoji">🎓</div>
          <div class="row-body">
            <div class="row-title">Sommelier practice <span class="pill">Blind</span></div>
            <div class="row-sub">A random mystery pour — deduce grape, region & age, exam-style.</div>
          </div>
          <div class="row-go">›</div>
        </div>
        <div class="row mode-card soon" data-act="mode-group">
          <div class="row-emoji">👥</div>
          <div class="row-body">
            <div class="row-title">Group tasting <span class="pill">Soon</span></div>
            <div class="row-sub">Taste the same bottle as a table and compete — live multiplayer is next.</div>
          </div>
        </div>
      </div>
      <p class="muted center" style="font-size:.8rem;margin-top:18px">Group play is the next phase. For now, solo is fully playable — or pass one phone around the table.</p>
    `;
  }

  function viewHome() {
    const hist = loadHistory();
    const count = hist.length;
    const { current, next } = REWARDS.levelFor(count);
    let progressHtml = "";
    if (next) {
      const span = next.at - current.at;
      const into = count - current.at;
      const pct = Math.max(4, Math.round((into / span) * 100));
      progressHtml = `<div class="progress"><span style="width:${pct}%"></span></div>
        <div class="lvl-sub" style="margin-top:6px">${next.at - count} more to <b>${esc(next.name)}</b></div>`;
    } else {
      progressHtml = `<div class="lvl-sub" style="margin-top:6px">Top tier reached — pour something special. 🥂</div>`;
    }

    // resume in-progress tasting
    const prog = loadProgress();
    const progWine = prog && wineById(prog.wineId);
    const resumeHtml = progWine ? `
      <div class="card" style="margin-top:14px;border-color:var(--brass)">
        <div class="eyebrow">⏳ Resume tasting</div>
        <div style="font-family:var(--serif);font-size:1.15rem;margin-top:4px">${esc(progWine.producer)} ${esc(progWine.name)}</div>
        <div class="muted" style="font-size:.8rem">You're partway through — pick up where you left off.</div>
        <div class="spacer"></div>
        <div class="btn-row">
          <button class="btn btn-ghost" data-act="discard-progress">Discard</button>
          <button class="btn btn-gold" data-act="resume-progress">Resume</button>
        </div>
      </div>` : "";

    // smart suggestion
    let suggestHtml = "";
    if (count >= 1 && !progWine) {
      const sug = suggestNext(hist);
      if (sug) {
        suggestHtml = `
          <div class="eyebrow" style="margin:22px 2px 10px">Suggested next</div>
          <div class="row" data-suggest="${esc(sug.wine.id)}" data-rest="${esc((sug.wine.restaurantIds || [])[0] || "")}">
            <div class="row-emoji">${typeEmoji[sug.wine.type] || "🍷"}</div>
            <div class="row-body">
              <div class="row-title">${esc(sug.wine.producer)} ${esc(sug.wine.name)}</div>
              <div class="row-sub">${esc(sug.reason)}</div>
            </div>
            <div class="row-go">›</div>
          </div>`;
      }
    }

    const recent = hist.slice(-3).reverse();
    const recentHtml = recent.length ? `
      <div class="eyebrow" style="margin:22px 2px 10px">Recently tasted</div>
      <div class="row-list">${recent.map(historyRow).join("")}</div>` : "";

    const dataWarn = (!DATA.seeded || DATA.wines.length === 0) ? `
      <div class="banner-warn">🍇 The Nashville wine list is being prepared with real, sourced bottles. Check back in a moment — nothing here is faked.</div>` : "";

    return `
      <div class="hero card">
        <div class="glass-mark">🍷</div>
        <h1>Wine Tasting<br/>Companion</h1>
        <p>Order a bottle, guess what's in it, then see what you nailed.</p>
        <button class="link-btn" data-act="howto" style="margin-top:12px">How it works</button>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="level-strip">
          <div class="level-badge">${current.icon}</div>
          <div class="level-meta">
            <div class="lvl-name">${esc(current.name)}</div>
            <div class="lvl-sub">${count} wine${count === 1 ? "" : "s"} tasted</div>
            ${progressHtml}
          </div>
        </div>
      </div>
      ${resumeHtml}

      <div class="spacer"></div>
      <button class="btn btn-primary" data-act="start">🍷 Start a tasting</button>
      <div class="spacer"></div>
      <button class="btn btn-ghost" data-act="startstudy">🎓 Sommelier practice (blind)</button>
      ${dataWarn}
      ${suggestHtml}
      ${recentHtml}
    `;
  }

  function viewRestaurants() {
    const rows = DATA.restaurants.map((r) => {
      const n = winesForRest(r.id).length;
      return `<div class="row" data-rest="${r.id}">
        <div class="row-emoji">🍴</div>
        <div class="row-body">
          <div class="row-title">${esc(r.name)}</div>
          <div class="row-sub">${esc(r.neighborhood || r.city || "Nashville")} · ${n} wine${n === 1 ? "" : "s"}${r.style ? " · " + esc(r.style) : ""}</div>
        </div>
        <div class="row-go">›</div>
      </div>`;
    }).join("");

    const body = DATA.restaurants.length ? `<div class="row-list">${rows}</div>` :
      `<div class="empty"><div class="e-ic">🍇</div><p>The Nashville list is being prepared with real bottles. Hang tight.</p></div>`;

    return topbar("Where are you?", "Nashville · pick your spot") + body;
  }

  function viewWineList() {
    const r = restById(state.restaurantId);
    if (!r) { back(); return ""; }
    const wines = winesForRest(r.id);
    const tasted = new Set(loadHistory().map((t) => t.wine.id));
    const rows = wines.map((w) => `
      <div class="row" data-wine="${w.id}">
        <div class="row-emoji">${typeEmoji[w.type] || "🍷"}</div>
        <div class="row-body">
          <div class="row-title">${esc(w.producer)} ${esc(w.name)}${tasted.has(w.id) ? ' <span class="pill">tasted</span>' : ""}</div>
          <div class="row-sub">${w.vintage ? esc(w.vintage) + " · " : ""}${esc((w.grapes || []).join(", "))} · ${esc(w.region || w.country)}</div>
        </div>
        <div class="row-go">›</div>
      </div>`).join("");
    return topbar(r.name, "Tap the wine you ordered") +
      (wines.length ? `<div class="row-list">${rows}</div>` :
        `<div class="empty"><div class="e-ic">🍷</div><p>No wines listed yet for this spot.</p></div>`);
  }

  // ---- tasting game ----
  function startTasting(wineId, mode) {
    state.mode = mode || "solo";
    state.wineId = wineId;
    state.stepIndex = 0;
    state.guesses = {};
    state.showAllNotes = false;
    state.tasteStart = Date.now();
    persistProgress();
    go("tasting");
  }

  // blind practice: a random mystery pour, identity hidden until the reveal
  function startStudy() {
    if (!DATA.wines.length) { toast("Wine list still loading"); return; }
    const w = DATA.wines[Math.floor(Math.random() * DATA.wines.length)];
    state.restaurantId = (w.restaurantIds || [])[0] || null;
    startTasting(w.id, "study");
  }

  function viewTasting() {
    const wine = wineById(state.wineId);
    if (!wine) { back(); return ""; }
    const sections = askableSections(wine);
    const section = sections[state.stepIndex];
    const fields = askableFields(section, wine);
    const isLast = state.stepIndex === sections.length - 1;

    const dots = sections.map((s, i) =>
      `<span class="dot ${i === state.stepIndex ? "active" : i < state.stepIndex ? "done" : ""}"></span>`).join("");

    const fieldsHtml = fields.map((f) => renderField(f, wine)).join("");

    return `
      ${topbar(state.mode === "study" ? "Blind tasting" : section.title, `Step ${state.stepIndex + 1} of ${sections.length}`)}
      <div class="taste-head">
        ${state.mode === "study"
          ? `<div class="wine-name">🎓 Mystery pour</div><div class="wine-meta">Deduce it — no peeking</div>`
          : `<div class="wine-name">${esc(wine.producer)} ${esc(wine.name)}</div><div class="wine-meta">${w_meta(wine)}</div>`}
      </div>
      ${state.exam ? `<div class="exam-bar">
        <span>Wine ${state.exam.idx + 1} of ${state.exam.wineIds.length}</span>
        <span id="exam-timer">${fmtTime(Math.max(0, Math.round((state.exam.deadline - Date.now()) / 1000)))}</span>
      </div>` : ""}
      <div class="step-dots">${dots}</div>
      <div class="card">
        <div class="eyebrow">${section.icon} ${esc(section.title)}</div>
        <p class="muted" style="margin:8px 0 0;font-size:.88rem">${esc(section.blurb)}</p>
        ${fieldsHtml}
      </div>
      <div style="height:90px"></div>
      <div class="taste-nav">
        <button class="btn btn-gold" data-act="next">${isLast ? "✨ Reveal the wine" : "Next →"}</button>
      </div>
    `;
  }

  function w_meta(w) {
    return `${w.vintage ? esc(w.vintage) + " · " : ""}${esc((w.grapes || []).join(", "))}${w.region ? " · " + esc(w.region) : ""}`;
  }

  function renderField(field, wine) {
    const g = state.guesses[field.key];
    if (field.type === "multiselect") {
      const sel = Array.isArray(g) ? g : [];
      let body, toggle = "", hint;
      if (field.groups) {
        // adaptive: surface notes plausible for this style; "show all" reveals the rest.
        // blind practice shows the full vocab (no style hint that could leak the wine).
        const blind = state.mode === "study";
        const relSet = (state.showAllNotes || blind) ? null : (PALATE.relevantFamilies && PALATE.relevantFamilies(wine.type));
        body = field.groups.map((grp) => {
          let notes = grp.notes;
          if (relSet) notes = notes.filter((n) => relSet.has(PALATE.noteFamily(n)));
          if (!notes.length) return "";
          return `<div class="flavor-group">
            <div class="grp-label">${esc(grp.group)}</div>
            <div class="choices">${notes.map((n) => choiceChip(field.key, n, sel.includes(n), true)).join("")}</div>
          </div>`;
        }).join("");
        if (blind) {
          hint = "Blind — the full list. Mark exactly what you taste.";
        } else {
          toggle = `<div class="skip-line"><button class="link-btn" data-act="toggle-notes">${state.showAllNotes ? "Show fewer notes" : "+ Show all notes"}</button></div>`;
          hint = state.showAllNotes
            ? "The full list — pick whatever you taste."
            : `Tuned to this style. Pick a few${field.suggested ? ` (≈${field.suggested})` : ""}, or tap "show all".`;
        }
      } else {
        body = `<div class="choices">${field.options.map((n) =>
          choiceChip(field.key, n, sel.includes(n), true)).join("")}</div>`;
        hint = `Pick a few${field.suggested ? ` (≈${field.suggested})` : ""} — or skip if nothing stands out.`;
      }
      return `<div class="field">
        <div class="field-prompt">${esc(field.prompt)}</div>
        <div class="field-hint">${hint}</div>
        ${body}${toggle}
      </div>`;
    }
    const opts = optionsFor(field, wine);
    return `<div class="field">
      <div class="field-prompt">${esc(field.prompt)}</div>
      <div class="choices">${opts.map((o) => choiceChip(field.key, o, g === o, false)).join("")}</div>
      <div class="skip-line"><button class="link-btn" data-skip="${field.key}">I didn't catch this</button></div>
    </div>`;
  }

  function choiceChip(key, val, selected, multi) {
    return `<button class="choice ${multi ? "multi" : ""} ${selected ? "selected" : ""}"
      data-choice="${esc(key)}" data-val="${esc(val)}" data-multi="${multi ? 1 : 0}">${esc(val)}</button>`;
  }

  // ---- reveal ----
  function finishTasting() {
    const wine = wineById(state.wineId);
    const score = scoreTasting(wine, state.guesses);
    const award = REWARDS.awardFor(score.totalPct);
    const ribbons = REWARDS.ribbonsFor(score);
    const rest = restById(state.restaurantId);
    const attempt = loadHistory().filter((r) => r.wine && r.wine.id === wine.id).length + 1;
    const durationSec = state.tasteStart ? Math.round((Date.now() - state.tasteStart) / 1000) : null;
    const rec = {
      id: "t" + (loadHistory().length + 1) + "_" + wine.id + "_" + score.totalPct + "_" + Math.floor(performance.now()),
      dateISO: new Date().toISOString(),
      mode: state.mode,
      restaurantId: state.restaurantId,
      restaurantName: rest ? rest.name : "",
      wine: JSON.parse(JSON.stringify(wine)),
      guesses: state.guesses,
      score,
      totalPct: score.totalPct,
      attempt,
      durationSec,
      award: { name: award.name, icon: award.icon, line: award.line },
      ribbons: ribbons.map((r) => ({ name: r.name, icon: r.icon })),
      notes: "",
    };
    const h = loadHistory();
    h.push(rec);
    saveHistory(h);
    clearProgress();
    state.lastResultId = rec.id;
    replace("reveal");
  }

  function viewReveal() {
    const rec = loadHistory().find((r) => r.id === state.lastResultId);
    if (!rec) { goTab("home"); return ""; }
    return revealCard(rec, true);
  }

  function revealCard(rec, fresh) {
    const wine = rec.wine;
    const ring = scoreRing(rec.totalPct);
    const award = rec.award;

    const ribbons = (rec.ribbons || []).map((r) =>
      `<span class="ribbon">${r.icon} ${esc(r.name)}</span>`).join("");

    const detail = rec.score.detail;
    const bySection = {};
    detail.forEach((d) => { (bySection[d.section] = bySection[d.section] || []).push(d); });
    const sectionTitle = {};
    SCHEMA.sections.forEach((s) => sectionTitle[s.key] = s.title);

    const detailHtml = Object.keys(bySection).map((secKey) => {
      const rows = bySection[secKey].map((d) => revealField(d, wine)).join("");
      const secPct = rec.score.sectionPct[secKey];
      return `<div class="card" style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div class="eyebrow">${esc(sectionTitle[secKey] || secKey)}</div>
          <div class="muted" style="font-size:.8rem;font-weight:800">${secPct}%</div>
        </div>
        ${rows}
      </div>`;
    }).join("");

    const srcHtml = wine.source && wine.source.url ?
      `<div class="src-note">Profile source: <a href="${esc(wine.source.url)}" target="_blank" rel="noopener">${esc(wine.source.name || "published notes")}</a>${wine.onListVerified ? " · confirmed on this list" : ""}</div>` : "";

    const photoHtml = rec.hasPhoto ? `<img class="bottle-photo" data-photo="${esc(rec.id)}" alt="bottle photo"/>` : "";
    const voiceHtml = rec.hasVoice ? `<audio controls data-voice="${esc(rec.id)}" style="width:100%;margin-top:10px"></audio>` : "";
    const notesBlock = `
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">Your note on this wine</div>
        ${photoHtml}
        <p class="muted" style="font-size:.84rem;margin:8px 0">Jot a note — snap the bottle, or tap the mic and just talk.</p>
        <textarea class="notes" data-notes="${esc(rec.id)}" placeholder="e.g. Loved the long finish — would order again.">${esc(rec.notes || "")}</textarea>
        <div class="capture-actions">
          <button class="chip-btn" data-act="recvoice" data-id="${esc(rec.id)}">🎙️ <span class="cap-label">${rec.hasVoice ? "Re-record" : "Voice note"}</span></button>
          <button class="chip-btn" data-act="addphoto" data-id="${esc(rec.id)}">📷 <span class="cap-label">${rec.hasPhoto ? "Retake" : "Bottle photo"}</span></button>
        </div>
        ${voiceHtml}
        <input type="file" accept="image/*" capture="environment" data-photoinput="${esc(rec.id)}" style="display:none"/>
        <div class="spacer"></div>
        <div class="btn-row">
          <button class="btn btn-ghost" data-act="savenote" data-id="${esc(rec.id)}">Save note</button>
          <button class="btn btn-gold" data-act="share" data-id="${esc(rec.id)}">Share 🍷</button>
        </div>
      </div>`;

    const isStudy = rec.mode === "study";
    const inExam = fresh && state.exam;
    const deductionHtml = isStudy ? deductionCard(rec) : "";
    const senseHtml = senseDeductions(rec);
    const head = fresh ? `<div class="topbar"><h1>${isStudy ? "Unveiled" : "The reveal"}</h1></div>` : topbar("Tasting", rec.restaurantName || "");
    const footer = inExam
      ? (state.exam.idx < state.exam.wineIds.length - 1
          ? `<button class="btn btn-primary" data-act="exam-next">Next wine (${state.exam.idx + 2} of ${state.exam.wineIds.length}) →</button>`
          : `<button class="btn btn-primary" data-act="exam-finish">See exam results →</button>`)
      : fresh
        ? `<button class="btn btn-primary" data-act="${isStudy ? "studyagain" : "tasteanother"}">${isStudy ? "🎓 Another blind pour" : "🍷 Taste another"}</button>
           <div class="spacer"></div>
           <button class="btn btn-ghost" data-act="gohome">Done</button>`
        : `<button class="btn btn-primary" data-act="retaste" data-wine="${esc(wine.id)}" data-rest="${esc(rec.restaurantId)}">🍷 Taste this again</button>`;

    return `
      ${head}
      <div class="card center">
        <div class="eyebrow">${esc(wine.producer)}</div>
        <h2 class="section-title">${esc(wine.name)}</h2>
        <div class="muted" style="font-size:.85rem">${w_meta(wine)} · ${esc(wine.country)}</div>
        <div class="score-ring-wrap">${ring}</div>
        <div class="award-banner">
          <div class="award-icon">${award.icon}</div>
          <div class="award-name">${esc(award.name)}</div>
          <div class="award-line">${esc(award.line)}</div>
        </div>
        ${ribbons ? `<div class="ribbons">${ribbons}</div>` : ""}
        ${revealMeta(rec)}
        ${wine.blurb ? `<p class="muted" style="margin:14px 0 0;font-size:.88rem;font-style:italic">"${esc(wine.blurb)}"</p>` : ""}
        ${srcHtml}
      </div>
      ${deductionHtml}
      ${senseHtml}
      ${detailHtml}
      ${notesBlock}
      <div class="spacer"></div>
      ${footer}
      <div class="spacer"></div>
    `;
  }

  // ---- coaching feedback (NVWA-style "here's the why") ----
  function grapeCard(wine) {
    const g = (wine.grapes || [])[0]; if (!g) return null;
    const first = g.toLowerCase().split(/[ /]/)[0];
    return GRAPES.find((c) => {
      const cg = c.grape.toLowerCase();
      return cg.includes(first) || first.includes(cg.split(/[ /]/)[0]);
    }) || null;
  }
  function regionCard(wine) {
    if (!wine.region) return null;
    return REGIONS.find((c) => fuzzyContains(c.region, wine.region) || fuzzyContains(wine.region, c.region)) || null;
  }
  // a short, true coaching sentence for one tasting field
  function coachFor(d, wine) {
    const a = d.actual;
    const low = (x) => String(x == null ? "" : x).toLowerCase();
    switch (d.key) {
      case "appearanceColor": {
        const t = typeLabel[wine.type] || wine.type;
        let why;
        if (wine.type === "white") why = /amber|gold/i.test(a) ? "a golden, deeper hue hints at oak or some age" : "a pale lemon tint reads young and fresh";
        else if (wine.type === "red") why = /tawny|brick|garnet/i.test(a) ? "garnet-to-brick edges show bottle age" : "a vivid purple-ruby reads youthful";
        else if (wine.type === "rose") why = "the pink intensity hints at the grape and how long it kissed the skins";
        else why = "the hue places its style";
        return `That ${low(a)} color tells you it's a ${t} — ${why}.`;
      }
      case "appearanceIntensity":
        return a === "Deep" ? "Deep color points to a thick-skinned grape or a ripe, warm-climate vintage."
          : a === "Pale" ? "Pale color suggests a delicate, thin-skinned grape or a cool climate."
          : "Medium intensity is the broad middle — lean on the nose and palate to narrow it.";
      case "noseIntensity":
        return a === "Pronounced" ? "A pronounced nose suggests an aromatic grape, oak, or bottle development."
          : a === "Light" ? "A quiet nose leans subtle, youthful, or simply closed — give it some air."
          : "Medium aroma intensity is typical — which families you find matters more than the volume.";
      case "aromaCategories":
      case "flavorNotes": {
        const gc = grapeCard(wine);
        return gc && gc.tell ? `Aromas are your biggest clue to the grape. ${gc.grape}: ${gc.tell}`
          : "The aroma & flavor families are your strongest bridge to the grape — group them before you guess.";
      }
      case "body":
        return a === "Full" ? "Full body comes from higher alcohol, riper fruit, or oak — often a bold grape or warm climate."
          : a === "Light" ? "Light body leans cool-climate and delicate (think Pinot Noir or a crisp white)."
          : "Medium body is the versatile middle.";
      case "acidity":
        return a === "High" ? "High, mouth-watering acidity is a cool-climate fingerprint."
          : a === "Low" ? "Low acidity points to warmth and ripeness."
          : "Medium acidity is common — weigh it together with the fruit character.";
      case "tannin":
        return (a === "High" || a === "Medium") ? "That drying grip is tannin — a red-grape signature, firmest in thick-skinned grapes (Cabernet, Nebbiolo) and in youth or oak."
          : "Little to no tannin means a white, a rosé, or a light low-tannin red like Gamay.";
      case "sweetness":
        return a === "Dry" ? "Bone dry — like most table wine. Real sweetness would point to late-harvest or fortified styles."
          : "Residual sugar like this points to off-dry or dessert styles.";
      case "finish":
        return a === "Long" ? "A long, lingering finish is a hallmark of quality and concentration."
          : a === "Short" ? "A short finish suggests a simpler, everyday wine."
          : "A medium finish is solid and typical.";
      case "grapeGuess": {
        const gc = grapeCard(wine);
        return gc && gc.tell ? `The giveaway for ${gc.grape}: ${gc.tell}` : "Anchor the grape to its structure plus its signature aromas.";
      }
      case "countryGuess":
        return "Country comes from the whole picture — climate cues, grape, and style — not any single clue.";
      case "regionGuess": {
        const rc = regionCard(wine);
        return rc && rc.tell ? `${rc.region}: ${rc.tell}` : (rc && rc.fact ? `${rc.region} — ${rc.fact}` : "Region is the hardest call — let climate and grape narrow it before you commit.");
      }
      case "climateGuess":
        return `${a} climate — read it from acidity (high = cool), alcohol/body (high = warm), and fruit (tart/green = cool, ripe/jammy = warm).`;
      case "ageGuess":
        return `Age shows in color (browning) and tertiary notes (dried fruit, leather, mushroom). This one reads ${low(a)}.`;
      default: return "";
    }
  }

  // ---- deduction-chaining: observation → inference → verdict (NVWA's core move) ----
  // unambiguous oak/barrel markers only (Almond, Smoke = lees/reductive, not oak)
  const OAK_FLAVORS = ["Vanilla", "Oak/Cedar", "Toast/Brioche", "Mocha/Coffee", "Dark chocolate"];
  function adjacentClimate(x, y) { const o = ["Cool", "Moderate", "Warm"]; return Math.abs(o.indexOf(x) - o.indexOf(y)) === 1; }
  function climateWhy(c) {
    return c === "Cool" ? "high acid, lower alcohol, tart/green fruit."
      : c === "Warm" ? "lower acid, higher alcohol, ripe/jammy fruit."
      : "a balanced middle — moderate acid and ripeness.";
  }
  function senseDeductions(rec) {
    const wine = rec.wine, g = rec.guesses || {};
    const chains = [];

    // 1) Oak / maturation — the signature deductive question
    const userOakNotes = (g.aromaCategories || []).filter((x) => x === "Oak/Vanilla")
      .concat((g.flavorNotes || []).filter((x) => OAK_FLAVORS.includes(x)));
    const wineOaked = (wine.aromaCategories || []).includes("Oak/Vanilla") ||
      (wine.flavorNotes || []).some((n) => OAK_FLAVORS.includes(n));
    const userSawOak = userOakNotes.length > 0;
    chains.push({
      obs: userSawOak ? "you noted " + userOakNotes.slice(0, 2).join(" & ") : "you flagged no oak notes",
      inf: userSawOak ? "it was matured in oak" : "no oak — an inert vessel",
      correct: userSawOak === wineOaked,
      truth: wineOaked ? "Oak-aged — vanilla, toast & baking spice are the tells."
        : "Unoaked — made in steel/inert vessel to keep the fruit pure.",
    });

    // 2) Climate from the structure you felt
    if (g.acidity || g.body) {
      let sc = 0;
      if (g.acidity === "High") sc--; else if (g.acidity === "Low") sc++;
      if (g.body === "Light") sc--; else if (g.body === "Full") sc++;
      const inf = sc < 0 ? "Cool" : sc > 0 ? "Warm" : "Moderate";
      const truth = climateFor(wine);
      const obsBits = [g.acidity ? g.acidity.toLowerCase() + " acidity" : null,
        g.body ? g.body.toLowerCase() + " body" : null].filter(Boolean).join(" + ");
      chains.push({
        obs: "you felt " + obsBits,
        inf: inf + " climate",
        correct: inf === truth ? true : (adjacentClimate(inf, truth) ? "near" : false),
        truth: truth + " climate — " + climateWhy(truth),
      });
    }

    // 3) Age from the color you saw
    if (wine.vintage && g.appearanceColor) {
      const col = g.appearanceColor;
      const dev = wine.type === "white" ? /gold|amber/i.test(col) : /garnet|tawny|brick/i.test(col);
      const bracket = ageBracket(wine.vintage);
      const truthDev = !/Youthful/.test(bracket) && bracket !== "Non-vintage";
      chains.push({
        obs: "the " + col.toLowerCase() + " color",
        inf: dev ? "some bottle age" : "a youthful wine",
        correct: bracket === "Non-vintage" ? "near" : dev === truthDev,
        truth: bracket === "Non-vintage" ? "Non-vintage blend." : bracket + ".",
      });
    }

    if (!chains.length) return "";
    const rows = chains.map((c) => {
      const ok = c.correct === true, near = c.correct === "near";
      const mark = ok ? "✓" : near ? "≈" : "✗", cls = ok ? "good" : near ? "partial" : "miss";
      return `<div class="reveal-field">
        <div class="rf-top"><div class="rf-label">Because ${esc(c.obs)}…</div><div class="rf-score ${cls}">${mark}</div></div>
        <div class="rf-line">→ you'd deduce <span class="tag you">${esc(c.inf)}</span></div>
        <div class="rf-coach">💡 ${esc(c.truth)}</div>
      </div>`;
    }).join("");
    return `<div class="card" style="margin-top:12px;border-color:var(--brass)">
      <div class="eyebrow">🔍 Connect the dots — your deductions</div>
      <p class="muted" style="font-size:.82rem;margin:6px 0 2px">How a sommelier reasons from what the senses pick up to a conclusion.</p>
      ${rows}
    </div>`;
  }

  // results header: spot-on count · time · attempt# · date (NVWA-style)
  function fmtClock(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m + ":" + String(s).padStart(2, "0"); }
  function revealMeta(rec) {
    const detail = rec.score.detail || [];
    const nailed = detail.filter((d) => d.pct >= 100).length;
    const bits = [`<b>${nailed}/${detail.length}</b> spot-on`];
    if (rec.durationSec != null) bits.push("⏱ " + fmtClock(rec.durationSec));
    if (rec.attempt) bits.push("Attempt #" + rec.attempt);
    const dt = new Date(rec.dateISO);
    bits.push(dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
    return `<div class="reveal-meta muted">${bits.join(" · ")}</div>`;
  }

  function revealField(d, wine) {
    const cls = d.pct >= 100 ? "good" : d.pct > 0 ? "partial" : "miss";
    let body = "";
    if (d.type === "multiselect") {
      const hit = (d.matched || []).map((x) => `<span class="tag hit">✓ ${esc(x)}</span>`).join("");
      const near = (d.near || []).map((n) => `<span class="tag near">≈ ${esc(n.guess)} → ${esc(n.actual)}</span>`).join("");
      const stillMissed = (d.missed || []).filter((m) => !(d.near || []).some((n) => n.actual === m));
      const missed = stillMissed.map((x) => `<span class="tag missed">+ ${esc(x)}</span>`).join("");
      const wrong = (d.wrong || []).map((x) => `<span class="tag wrong">${esc(x)}</span>`).join("");
      body = `<div style="margin-top:6px">${hit}${near}${missed}${wrong}</div>` +
        (d.callout ? `<div class="rf-callout">${esc(d.callout)}</div>` : "");
      if (d.skipped) body = `<div class="rf-line">You skipped this — the answer was: ${(d.missed || []).map((x) => `<span class="tag missed">${esc(x)}</span>`).join("")}</div>`;
    } else {
      const your = d.skipped ? "—" : esc(d.your);
      const actual = esc(d.actual);
      const right = d.pct >= 100;
      body = `<div class="rf-line">You: <span class="tag you">${your}</span> ${right ? "✓" : "→ Actual:"} ${right ? "" : `<span class="tag hit">${actual}</span>`}</div>`;
    }
    const coach = wine ? coachFor(d, wine) : "";
    return `<div class="reveal-field">
      <div class="rf-top">
        <div class="rf-label">${esc(d.label)}</div>
        <div class="rf-score ${cls}">${d.pct >= 100 ? "Nailed it" : d.pct > 0 ? "Close" : "Missed"}</div>
      </div>
      ${body}
      ${coach ? `<div class="rf-coach">💡 ${esc(coach)}</div>` : ""}
    </div>`;
  }

  // sommelier deduction scorecard (study mode) — the exam-relevant calls
  function deductionCard(rec) {
    const keys = ["grapeGuess", "regionGuess", "climateGuess", "ageGuess", "countryGuess"];
    const labels = { grapeGuess: "Grape", regionGuess: "Region", climateGuess: "Climate", ageGuess: "Age", countryGuess: "Country" };
    const ds = rec.score.detail.filter((d) => keys.includes(d.key));
    if (!ds.length) return "";
    const got = ds.filter((d) => d.pct >= 100).length;
    const rows = ds.map((d) => {
      const ok = d.pct >= 100, near = d.pct > 0 && d.pct < 100;
      const mark = ok ? "✓" : near ? "≈" : "✗";
      const cls = ok ? "good" : near ? "partial" : "miss";
      return `<div class="reveal-field">
        <div class="rf-top"><div class="rf-label">${labels[d.key] || d.label}</div><div class="rf-score ${cls}">${mark}</div></div>
        <div class="rf-line">You: <span class="tag you">${d.skipped ? "—" : esc(d.your)}</span> · Actual: <span class="tag hit">${esc(d.actual)}</span></div>
      </div>`;
    }).join("");
    return `<div class="card" style="margin-top:12px;border-color:var(--brass)">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div class="eyebrow">🎓 Deduction</div>
        <div class="muted" style="font-size:.8rem;font-weight:800">${got}/${ds.length} called</div>
      </div>
      ${rows}
    </div>`;
  }

  function scoreRing(pct) {
    const r = 76, c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    return `<div class="score-ring">
      <svg width="168" height="168" viewBox="0 0 168 168">
        <circle cx="84" cy="84" r="${r}" fill="none" stroke="rgba(0,0,0,.1)" stroke-width="12"/>
        <circle class="ring-progress" cx="84" cy="84" r="${r}" fill="none" stroke="url(#g)" stroke-width="12"
          stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-target="${off.toFixed(1)}"/>
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9c2c43"/><stop offset="1" stop-color="#cda459"/>
        </linearGradient></defs>
      </svg>
      <div class="ring-num"><div><div class="big">${pct}<span style="font-size:1.2rem">%</span></div>
      <div class="pct">match</div></div></div>
    </div>`;
  }

  // ---- history (cellar) ----
  function historyRow(rec) {
    const w = rec.wine;
    const d = new Date(rec.dateISO);
    const dstr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const marks = (rec.hasPhoto ? " 📷" : "") + (rec.hasVoice ? " 🎙️" : "");
    return `<div class="row" data-hist="${esc(rec.id)}">
      <div class="row-emoji">${rec.award.icon}</div>
      <div class="row-body">
        <div class="row-title">${esc(w.producer)} ${esc(w.name)}</div>
        <div class="row-sub">${dstr} · ${rec.totalPct}% · ${esc(rec.restaurantName || w.country)}${marks}</div>
      </div>
      <div class="row-go">›</div>
    </div>`;
  }

  function viewHistory() {
    const hist = loadHistory().slice().reverse();
    const body = hist.length
      ? `<div class="row-list">${hist.map(historyRow).join("")}</div>`
      : `<div class="empty"><div class="e-ic">📖</div><p>Your cellar is empty.<br/>Taste a wine and it'll be saved here.</p></div>`;
    const count = hist.length;
    const grapes = new Set(hist.flatMap((t) => t.wine.grapes || [])).size;
    const countries = new Set(hist.map((t) => t.wine.country)).size;
    const stat = count ? `<div class="card center" style="display:flex;justify-content:space-around">
      <div><div class="serif" style="font-size:1.6rem">${count}</div><div class="muted" style="font-size:.72rem">wines</div></div>
      <div><div class="serif" style="font-size:1.6rem">${grapes}</div><div class="muted" style="font-size:.72rem">grapes</div></div>
      <div><div class="serif" style="font-size:1.6rem">${countries}</div><div class="muted" style="font-size:.72rem">countries</div></div>
    </div>` : "";
    return `<div class="topbar"><h1>My Cellar</h1></div>${stat}<div class="spacer"></div>${body}`;
  }

  function viewHistoryDetail() {
    const rec = loadHistory().find((r) => r.id === state.historyDetailId);
    if (!rec) { goTab("history"); return ""; }
    return revealCard(rec, false);
  }

  // ---- palate profile ----
  function viewPalate() {
    const hist = loadHistory();
    if (hist.length < 1) {
      return `<div class="topbar"><h1>Your Palate</h1></div>
        <div class="empty"><div class="e-ic">👅</div>
        <p>Taste a wine and your palate profile builds itself here —<br/>what you reliably catch, what slips past, and how you're improving.</p></div>
        <button class="btn btn-gold" data-act="review">🔁 Review cards (${srsDue().length} due)</button>
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-act="flashcards">🎴 Study flashcards (grapes · regions · theory)</button>
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-act="examsetup">🎓 Timed exam simulation</button>
        <div class="spacer"></div>`;
    }
    const p = computePalate(hist);
    const secLabel = { appearance: "Appearance", nose: "Nose", palate: "Palate", conclusions: "Conclusions" };

    const trendChip = p.prev
      ? (p.trend >= 0 ? `<span class="ribbon">▲ +${p.trend}% vs your previous run</span>`
                      : `<span class="ribbon">▼ ${p.trend}% vs your previous run</span>`)
      : `<span class="ribbon">${hist.length} tasting${hist.length === 1 ? "" : "s"} in</span>`;

    const bars = Object.keys(secLabel).filter((k) => p.secAvg[k] != null).map((k) => {
      const v = p.secAvg[k];
      return `<div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:.84rem">
          <span>${secLabel[k]}</span><span class="muted" style="font-weight:800">${v}%</span></div>
        <div class="progress" style="margin-top:4px"><span style="width:${Math.max(4, v)}%"></span></div>
      </div>`;
    }).join("");

    const caughtHtml = p.caught.length
      ? p.caught.map((x) => `<span class="tag hit">✓ ${esc(x)}</span>`).join("")
      : `<span class="muted" style="font-size:.84rem">A few more tastings and your strengths will surface.</span>`;
    const missedHtml = p.missed.length
      ? p.missed.map((x) => `<span class="tag missed">${esc(x)}</span>`).join("")
      : `<span class="muted" style="font-size:.84rem">Nothing consistently slipping past — nice.</span>`;

    const bestHtml = p.best ? `<div class="row" data-hist="${esc(p.best.id)}">
      <div class="row-emoji">${p.best.award.icon}</div>
      <div class="row-body"><div class="row-title">${esc(p.best.wine.producer)} ${esc(p.best.wine.name)}</div>
      <div class="row-sub">Your best read · ${p.best.totalPct}%</div></div><div class="row-go">›</div></div>` : "";

    return `<div class="topbar"><h1>Your Palate</h1></div>
      <div class="card center">
        <div class="eyebrow">Palate match · average</div>
        <div class="serif" style="font-size:3rem;line-height:1;margin-top:2px">${p.overall}%</div>
        <div style="margin-top:8px">${trendChip}</div>
        <p class="muted" style="font-size:.9rem;margin-top:12px;font-style:italic">${esc(palateRead(p))}</p>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">Sharpen up</div>
        <div class="spacer"></div>
        <button class="btn btn-gold" data-act="review">🔁 Review · ${srsDue().length} due</button>
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-act="flashcards">🎴 Flashcards · grapes · regions · theory</button>
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-act="drill">🎯 Drill blind spots</button>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-act="examsetup">🎓 Timed exam simulation</button>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">Sense by sense</div>
        ${bars || '<p class="muted" style="font-size:.84rem;margin-top:8px">Building…</p>'}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">You reliably catch</div>
        <div style="margin-top:8px">${caughtHtml}</div>
        <div class="divider"></div>
        <div class="eyebrow">Often slips past you</div>
        <div style="margin-top:8px">${missedHtml}</div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">Your range</div>
        <div style="display:flex;justify-content:space-around;margin-top:10px">
          <div class="center"><div class="serif" style="font-size:1.6rem">${p.n}</div><div class="muted" style="font-size:.72rem">tastings</div></div>
          <div class="center"><div class="serif" style="font-size:1.6rem">${p.grapes}</div><div class="muted" style="font-size:.72rem">grapes</div></div>
          <div class="center"><div class="serif" style="font-size:1.6rem">${p.countries}</div><div class="muted" style="font-size:.72rem">countries</div></div>
          <div class="center"><div class="serif" style="font-size:1.6rem">${p.types.length}</div><div class="muted" style="font-size:.72rem">styles</div></div>
        </div>
      </div>
      ${bestHtml ? `<div class="eyebrow" style="margin:20px 2px 10px">Your best read</div><div class="row-list">${bestHtml}</div>` : ""}
      <div class="spacer"></div>`;
  }

  // ---- study: flashcards + weakness drill ----
  function shuffled(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // shared flashcard engine across grape + region + theory decks
  const isRegion = (c) => !!(c && c.region);
  const isTheory = (c) => !!(c && c.q);
  function studyDeck() { return state.deck === "regions" ? REGIONS : state.deck === "theory" ? THEORY : GRAPES; }
  function cardFace(c, reveal) {
    const tags = (c.markers || c.grapes || []).map((m) => `<span class="tag you">${esc(m)}</span>`).join(" ");
    if (isTheory(c)) {
      return reveal
        ? `<div class="eyebrow" style="color:var(--wine)">${esc(c.category)}</div>
           <div class="fc-tellq">${esc(c.q)}</div>
           <div class="fc-ans">${esc(c.a)}</div>`
        : `<div class="eyebrow" style="color:var(--ink-mute)">${esc(c.category)}</div>
           <div class="fc-tellq" style="margin-top:14px">${esc(c.q)}</div>
           <div class="fc-tell" style="margin-top:18px">Tap to reveal →</div>`;
    }
    if (isRegion(c)) {
      return reveal
        ? `<div class="fc-grape">${esc(c.region)}</div>
           <div><span class="pill">${esc(c.country)}</span></div>
           <div class="fc-struct" style="margin-top:10px">${esc(c.area)}</div>
           <div class="fc-struct">${esc(c.style)}</div>
           <div style="margin-top:12px">${tags}</div>
           <div class="fc-regions">📜 ${esc(c.fact)}</div>
           <div class="fc-tell">"${esc(c.tell)}"</div>`
        : `<div class="eyebrow" style="color:var(--ink-mute)">Name the region</div>
           <div class="fc-struct" style="margin-top:16px">${esc(c.country)} · ${esc(c.area)}</div>
           <div style="margin-top:12px">${tags}</div>
           <div class="fc-struct" style="margin-top:10px">${esc(c.style)}</div>
           <div class="fc-tell" style="margin-top:18px">Tap to reveal →</div>`;
    }
    return reveal
      ? `<div class="fc-grape">${esc(c.grape)}</div>
         <div><span class="pill ${c.color === "red" ? "red" : "white"}">${esc(c.color)}</span></div>
         <div class="fc-struct" style="margin-top:10px">${esc(c.structure)}</div>
         <div style="margin-top:12px">${tags}</div>
         <div class="fc-regions">📍 ${esc(c.regions.join(" · "))}</div>
         <div class="fc-tell">"${esc(c.tell)}"</div>`
      : `<div class="eyebrow" style="color:var(--ink-mute)">Name the grape</div>
         <div class="fc-struct" style="margin-top:16px">${esc(c.structure)}</div>
         <div style="margin-top:14px">${tags}</div>
         <div class="fc-tell" style="margin-top:18px">Tap to reveal →</div>`;
  }
  function initFlashcards() { state.cardOrder = shuffled(studyDeck().length); state.cardIdx = 0; state.cardFlipped = false; }

  function viewFlashcards() {
    const deck = studyDeck();
    if (!deck.length) return `${topbar("Flashcards", "")}<div class="empty"><div class="e-ic">🎴</div><p>No cards loaded.</p></div>`;
    if (!state.cardOrder || state.cardOrder.length !== deck.length) initFlashcards();
    const c = deck[state.cardOrder[state.cardIdx]];
    const quiz = state.quizMode, shown = !quiz || state.cardFlipped;
    const what = state.deck === "regions" ? "region" : "grape";
    const sub = quiz
      ? (state.deck === "theory" ? "Quiz · recall the answer" : `Quiz · name the ${what}`)
      : (state.deck === "theory" ? "Theory essentials" : "Browse the classics");
    const tab = (id, label) => `<button class="choice ${state.deck === id ? "selected" : ""}" data-deck="${id}">${label}</button>`;
    return `${topbar("Flashcards", sub)}
      <div class="choices" style="justify-content:center;margin-bottom:8px">${tab("grapes", "Grapes")}${tab("regions", "Regions")}${tab("theory", "Theory")}</div>
      <div class="fc-count muted">${state.cardIdx + 1} / ${deck.length}</div>
      <div class="card flashcard" data-act="flip">${cardFace(c, shown)}</div>
      <div class="spacer"></div>
      <div class="btn-row">
        <button class="btn btn-ghost" data-act="fc-quiz">${quiz ? "Browse mode" : "Quiz me"}</button>
        <button class="btn btn-ghost" data-act="fc-shuffle">🔀 Shuffle</button>
      </div>
      <div class="spacer"></div>
      <div class="btn-row">
        <button class="btn btn-ghost" data-act="fc-prev">‹ Prev</button>
        <button class="btn btn-gold" data-act="fc-next">Next ›</button>
      </div>
      <div class="spacer"></div>`;
  }

  function drillBlindSpots() {
    const p = computePalate(loadHistory());
    const misses = p.missed || [];
    if (!misses.length) { toast("Taste a few more first — no clear blind spots yet"); return; }
    const target = misses[0];
    const cands = DATA.wines.filter((w) => (w.flavorNotes || []).includes(target));
    const pool = cands.length ? cands : DATA.wines;
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!w) { toast("No wines to drill"); return; }
    state.restaurantId = (w.restaurantIds || [])[0] || null;
    toast("🎯 Hunt for your blind spot: " + target);
    startTasting(w.id, "study");
  }

  // ---- spaced repetition (Leitner) across grape + region flashcards ----
  function srsLoad() { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } }
  function srsSave(m) { try { localStorage.setItem(SKEY, JSON.stringify(m)); } catch (e) {} }
  function allCards() {
    return GRAPES.map((c) => ({ deck: "grapes", name: c.grape }))
      .concat(REGIONS.map((c) => ({ deck: "regions", name: c.region })))
      .concat(THEORY.map((c) => ({ deck: "theory", name: c.q })));
  }
  const srsKey = (deck, name) => deck.charAt(0) + ":" + name;
  function srsDue() {
    const m = srsLoad(); const now = Date.now();
    return allCards().filter((it) => {
      const st = m[srsKey(it.deck, it.name)];
      return !st || !st.due || new Date(st.due).getTime() <= now;
    });
  }
  function srsGrade(deck, name, got) {
    const m = srsLoad(); const k = srsKey(deck, name);
    const st = m[k] || { box: 0, reps: 0, lapses: 0 };
    st.box = got ? Math.min(5, (st.box || 0) + 1) : 1;
    if (!got) st.lapses = (st.lapses || 0) + 1;
    st.reps = (st.reps || 0) + 1;
    st.due = new Date(Date.now() + (SRS_DAYS[st.box] || 1) * 86400000).toISOString();
    m[k] = st; srsSave(m);
  }
  function reviewCardFor(item) {
    const deck = item.deck === "regions" ? REGIONS : item.deck === "theory" ? THEORY : GRAPES;
    return deck.find((c) => (c.grape || c.region || c.q) === item.name);
  }
  function startReview() {
    const due = srsDue();
    if (!due.length) { toast("All caught up — nothing due 🎉"); return; }
    const q = due.slice();
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    state.review = { queue: q.slice(0, 20), idx: 0, got: 0, missed: 0 };
    state.cardFlipped = false;
    go("review");
  }

  function viewReview() {
    const rv = state.review;
    if (!rv) { goTab("palate"); return ""; }
    if (rv.idx >= rv.queue.length) {
      return `${topbar("Review complete", "")}
        <div class="card center">
          <div class="glass-mark" style="font-size:2.2rem">🎉</div>
          <h2 class="section-title">Nice work</h2>
          <p class="muted">You reviewed ${rv.queue.length} card${rv.queue.length === 1 ? "" : "s"} — ${rv.got} solid, ${rv.missed} to revisit.</p>
          <p class="muted" style="font-size:.84rem;margin-top:10px">Missed cards come back tomorrow; the ones you nailed return further out. That spacing is what makes it stick.</p>
        </div>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-act="review-done">Done</button>
        <div class="spacer"></div>`;
    }
    const c = reviewCardFor(rv.queue[rv.idx]);
    const flipped = state.cardFlipped;
    const controls = flipped
      ? `<div class="btn-row"><button class="btn btn-ghost" data-act="srs-missed">Missed ✗</button><button class="btn btn-gold" data-act="srs-got">Got it ✓</button></div>`
      : `<button class="btn btn-primary" data-act="flip">Reveal</button>`;
    return `${topbar("Review", "Spaced repetition · due today")}
      <div class="fc-count muted">${rv.idx + 1} / ${rv.queue.length} due</div>
      <div class="card flashcard" data-act="flip">${cardFace(c, flipped)}</div>
      <div class="spacer"></div>
      ${controls}
      <div class="spacer"></div>`;
  }

  // ---- timed exam simulation (difficulty tiers + flight + countdown) ----
  const TIER_APPROACHABLE = new Set(["Cabernet Sauvignon", "Chardonnay", "Pinot Noir", "Sauvignon Blanc", "Merlot", "Malbec", "Riesling", "Syrah", "Shiraz", "Syrah/Shiraz"]);
  const TIER_ADVANCED = new Set(["Cortese", "Glera", "Corvina", "Rondinella", "Brachetto", "Barbera", "Gewürztraminer", "Grüner Veltliner", "Albariño", "Chenin Blanc"]);
  function tierOf(wine) {
    const g = (wine.grapes || [])[0] || "";
    if (TIER_APPROACHABLE.has(g)) return "approachable";
    if (TIER_ADVANCED.has(g)) return "advanced";
    return "classic";
  }
  function winesByTier(tier) {
    return tier === "all" ? DATA.wines.slice() : DATA.wines.filter((w) => tierOf(w) === tier);
  }
  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return "⏱ " + m + ":" + String(s).padStart(2, "0");
  }

  function startExam(tier, n, mins) {
    const pool = winesByTier(tier);
    if (!pool.length) { toast("No wines in that tier"); return; }
    const order = shuffled(pool.length).slice(0, Math.min(n, pool.length)).map((i) => pool[i].id);
    state.exam = { wineIds: order, idx: 0, results: [], mins };
    startExamWine();
  }
  function startExamWine() {
    const id = state.exam.wineIds[state.exam.idx];
    const w = wineById(id);
    state.mode = "study";
    state.wineId = id;
    state.restaurantId = (w.restaurantIds || [])[0] || null;
    state.stepIndex = 0; state.guesses = {}; state.showAllNotes = false;
    state.tasteStart = Date.now();
    state.exam.deadline = Date.now() + state.exam.mins * 60 * 1000;
    clearProgress();
    go("tasting");
    startExamTimer();
  }
  function startExamTimer() {
    if (examTick) clearInterval(examTick);
    updateExamTimer();
    examTick = setInterval(updateExamTimer, 1000);
  }
  function updateExamTimer() {
    if (!state.exam || screen() !== "tasting") { clearInterval(examTick); examTick = null; return; }
    const rem = Math.max(0, Math.round((state.exam.deadline - Date.now()) / 1000));
    const el = document.getElementById("exam-timer");
    if (el) { el.textContent = fmtTime(rem); el.classList.toggle("low", rem <= 30); }
    if (rem <= 0) { clearInterval(examTick); examTick = null; finishExamWine(true); }
  }
  function finishExamWine(timedOut) {
    if (examTick) { clearInterval(examTick); examTick = null; }
    const wine = wineById(state.wineId);
    const score = scoreTasting(wine, state.guesses);
    const award = REWARDS.awardFor(score.totalPct);
    const ribbons = REWARDS.ribbonsFor(score);
    const rest = restById(state.restaurantId);
    const rec = {
      id: "x" + (loadHistory().length + 1) + "_" + wine.id + "_" + score.totalPct + "_" + Math.floor(performance.now()),
      dateISO: new Date().toISOString(), mode: "study", exam: true,
      restaurantId: state.restaurantId, restaurantName: rest ? rest.name : "",
      wine: JSON.parse(JSON.stringify(wine)), guesses: state.guesses, score, totalPct: score.totalPct,
      attempt: loadHistory().filter((r) => r.wine && r.wine.id === wine.id).length + 1,
      durationSec: state.tasteStart ? Math.round((Date.now() - state.tasteStart) / 1000) : null,
      award: { name: award.name, icon: award.icon, line: award.line },
      ribbons: ribbons.map((r) => ({ name: r.name, icon: r.icon })), notes: "",
    };
    const h = loadHistory(); h.push(rec); saveHistory(h);
    const dkeys = ["grapeGuess", "regionGuess", "climateGuess", "ageGuess", "countryGuess"];
    state.exam.results.push({
      wineId: wine.id, name: wine.producer + " " + wine.name, totalPct: score.totalPct, timedOut: !!timedOut,
      calls: score.detail.filter((d) => dkeys.includes(d.key)).map((d) => ({ key: d.key, pct: d.pct })),
    });
    state.lastResultId = rec.id;
    if (timedOut) toast("⏱ Time! Here's the wine.");
    replace("reveal");
  }

  function viewExamSetup() {
    const p = state.examPrefs;
    const chip = (act, val, label, cur) =>
      `<button class="choice ${cur === val ? "selected" : ""}" data-${act}="${val}">${label}</button>`;
    const tierPool = (t) => winesByTier(t).length;
    return `${topbar("Timed exam", "Blind flight — like the real thing")}
      <div class="card">
        <div class="eyebrow">Difficulty</div>
        <p class="muted" style="font-size:.82rem;margin:8px 0 10px">Which grapes are in play?</p>
        <div class="choices">
          ${chip("etier", "all", "Mixed", p.tier)}
          ${chip("etier", "approachable", "Approachable", p.tier)}
          ${chip("etier", "classic", "Classic", p.tier)}
          ${chip("etier", "advanced", "Advanced", p.tier)}
        </div>
        <div class="muted" style="font-size:.76rem;margin-top:8px">${tierPool(p.tier)} wines available in this tier</div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">Flight size</div>
        <div class="choices" style="margin-top:10px">
          ${chip("en", "1", "1 wine", String(p.n))}
          ${chip("en", "3", "3 wines", String(p.n))}
          ${chip("en", "5", "5 wines", String(p.n))}
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">Time per wine</div>
        <div class="choices" style="margin-top:10px">
          ${chip("emins", "3", "3 min", String(p.mins))}
          ${chip("emins", "5", "5 min", String(p.mins))}
          ${chip("emins", "8", "8 min", String(p.mins))}
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-act="exam-begin">🎓 Begin exam</button>
      <p class="muted center" style="font-size:.78rem;margin-top:12px">Blind. The clock runs per wine. You get a full deduction report at the end.</p>
      <div class="spacer"></div>`;
  }

  function viewExamReport() {
    const ex = state.exam;
    if (!ex || !ex.results.length) { goTab("palate"); return ""; }
    const res = ex.results;
    const avg = Math.round(res.reduce((a, b) => a + b.totalPct, 0) / res.length);
    const dkeys = ["grapeGuess", "regionGuess", "climateGuess", "ageGuess", "countryGuess"];
    const labels = { grapeGuess: "Grape", regionGuess: "Region", climateGuess: "Climate", ageGuess: "Age", countryGuess: "Country" };
    const callTotals = {}; dkeys.forEach((k) => callTotals[k] = { hit: 0, n: 0 });
    res.forEach((r) => r.calls.forEach((c) => { callTotals[c.key].n++; if (c.pct >= 100) callTotals[c.key].hit++; }));
    const grade = avg >= 85 ? "Exam-ready 🎓" : avg >= 70 ? "Strong showing" : avg >= 55 ? "Developing" : "Keep drilling";

    const wineRows = res.map((r, i) => {
      const marks = r.calls.map((c) => (c.pct >= 100 ? "✓" : c.pct > 0 ? "≈" : "✗")).join(" ");
      return `<div class="reveal-field">
        <div class="rf-top"><div class="rf-label">${i + 1}. ${esc(r.name)}</div><div class="rf-score ${r.totalPct >= 75 ? "good" : r.totalPct >= 50 ? "partial" : "miss"}">${r.totalPct}%</div></div>
        <div class="rf-line">Deduction: ${marks}${r.timedOut ? ' · <span class="tag wrong">timed out</span>' : ""}</div>
      </div>`;
    }).join("");
    const callRows = dkeys.map((k) => {
      const t = callTotals[k]; if (!t.n) return "";
      const pct = Math.round((t.hit / t.n) * 100);
      return `<div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:.84rem"><span>${labels[k]}</span><span class="muted" style="font-weight:800">${t.hit}/${t.n}</span></div>
        <div class="progress" style="margin-top:4px"><span style="width:${Math.max(4, pct)}%"></span></div>
      </div>`;
    }).join("");

    return `<div class="topbar"><h1>Exam results</h1></div>
      <div class="card center">
        <div class="eyebrow">Flight score · ${res.length} wine${res.length === 1 ? "" : "s"}</div>
        <div class="serif" style="font-size:3rem;line-height:1;margin-top:2px">${avg}%</div>
        <div style="margin-top:8px"><span class="ribbon">${grade}</span></div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">Your deduction calls</div>
        ${callRows}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="eyebrow">Wine by wine</div>
        ${wineRows}
      </div>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-act="exam-restart">🎓 New exam</button>
      <div class="spacer"></div>
      <button class="btn btn-ghost" data-act="exam-done">Done</button>
      <div class="spacer"></div>`;
  }

  // ---- rewards ----
  function viewRewards() {
    const hist = loadHistory();
    const count = hist.length;
    const { current } = REWARDS.levelFor(count);

    const ladder = REWARDS.LEVELS.filter((l) => l.at > 0).map((l) => {
      const reached = count >= l.at;
      const isCur = l.name === current.name;
      return `<div class="rung ${reached ? "reached" : "locked"} ${isCur ? "current" : ""}">
        <div class="r-ic">${l.icon}</div>
        <div style="flex:1">
          <div class="r-name">${esc(l.name)}</div>
          <div class="r-at">${reached ? "Unlocked" : "Taste " + l.at + " wines"}</div>
        </div>
        ${isCur ? '<span class="pill">You</span>' : reached ? "✓" : "🔒"}
      </div>`;
    }).join("");

    const badges = REWARDS.BADGES.map((b) => {
      const p = b.progress(hist);
      const earned = p.have >= p.need;
      return `<div class="badge ${earned ? "earned" : ""}">
        <div class="b-ic">${b.icon}</div>
        <div class="b-name">${esc(b.name)}</div>
        <div class="b-hint">${esc(b.hint)}</div>
        <div class="b-prog">${earned ? "Earned ✓" : Math.min(p.have, p.need) + " / " + p.need}</div>
      </div>`;
    }).join("");

    return `<div class="topbar"><h1>Rewards</h1></div>
      <div class="eyebrow" style="margin:6px 2px 10px">Your tier ladder</div>
      <div class="ladder">${ladder}</div>
      <div class="eyebrow" style="margin:24px 2px 10px">Collector badges</div>
      <div class="badge-grid">${badges}</div>
      <div class="spacer"></div>`;
  }

  // ---------------- capture: photos + voice (IndexedDB blob store) ----------------
  const IDB = (function () {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        let r;
        try { r = indexedDB.open("wtc_media", 1); } catch (e) { return rej(e); }
        r.onupgradeneeded = () => r.result.createObjectStore("media");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return dbp;
    }
    async function put(key, blob) {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction("media", "readwrite");
        tx.objectStore("media").put(blob, key);
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      });
    }
    async function get(key) {
      const db = await open();
      return new Promise((res) => {
        const tx = db.transaction("media", "readonly");
        const rq = tx.objectStore("media").get(key);
        rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null);
      });
    }
    return { put, get };
  })();

  // downscale a captured photo so the cellar stays light
  function processPhoto(file, cb) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1100; const w = img.width, h = img.height;
      const scale = Math.min(1, max / Math.max(w, h));
      const cw = Math.round(w * scale), ch = Math.round(h * scale);
      const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
      cv.toBlob((b) => { URL.revokeObjectURL(url); cb(b); }, "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  // voice memo: record audio + (where supported) live-transcribe into the note
  let _voice = { mr: null, chunks: [], id: null, stream: null, recog: null };
  function voiceRecording() { return _voice.mr && _voice.mr.state === "recording"; }
  async function startVoice(id, btn) {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast("Recording not supported here"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      _voice = { mr, chunks: [], id, stream, recog: null };
      mr.ondataavailable = (e) => { if (e.data && e.data.size) _voice.chunks.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(_voice.chunks, { type: mr.mimeType || "audio/webm" });
        try { await IDB.put("voice_" + id, blob); } catch (e) {}
        if (_voice.stream) _voice.stream.getTracks().forEach((t) => t.stop());
        const h = loadHistory(); const rec = h.find((x) => x.id === id);
        if (rec) {
          rec.hasVoice = true;
          const ta = document.querySelector("textarea.notes");
          if (ta) rec.notes = ta.value;
          saveHistory(h);
        }
        _voice = { mr: null, chunks: [], id: null, stream: null, recog: null };
        toast("Voice note saved 🎙️"); render();
      };
      mr.start();
      if (btn) { btn.innerHTML = '⏹ <span class="cap-label">Stop</span>'; btn.classList.add("recording"); }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const recog = new SR();
        recog.continuous = true; recog.interimResults = true; recog.lang = "en-US";
        const ta = document.querySelector("textarea.notes"); const base = ta ? ta.value.trim() : "";
        recog.onresult = (e) => {
          let txt = ""; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
          if (ta) ta.value = (base ? base + " " : "") + txt;
        };
        try { recog.start(); _voice.recog = recog; } catch (e) {}
        toast("Recording… speak your note, then tap stop");
      } else {
        toast("Recording… tap stop when done");
      }
    } catch (e) { toast("Microphone permission needed"); }
  }
  function stopVoice() {
    if (_voice.recog) { try { _voice.recog.stop(); } catch (e) {} }
    if (_voice.mr && _voice.mr.state !== "inactive") { try { _voice.mr.stop(); } catch (e) {} }
  }

  // ---------------- sharing ----------------
  async function shareRecord(rec) {
    const w = rec.wine;
    const text = `🍷 I tasted the ${w.producer} ${w.name} and scored ${rec.totalPct}% — "${rec.award.name}" on Wine Tasting Companion!`;
    let file = null;
    try { file = await makeScoreImage(rec); } catch (e) {}
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: "My wine tasting" });
        return;
      }
      if (navigator.share) { await navigator.share({ text, title: "My wine tasting" }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast("Scorecard copied to clipboard"); }
    catch (e) { toast("Sharing not supported here"); }
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url; a.download = "tasting-scorecard.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  }

  function makeScoreImage(rec) {
    return new Promise((resolve) => {
      const W = 1080, H = 1350;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const x = cv.getContext("2d");
      const grad = x.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#3c2817"); grad.addColorStop(0.5, "#2c1d10"); grad.addColorStop(1, "#1e130a");
      x.fillStyle = grad; x.fillRect(0, 0, W, H);
      x.strokeStyle = "rgba(120,31,48,0.16)"; x.lineWidth = 16;
      x.beginPath(); x.arc(180, 250, 96, 0, Math.PI * 2); x.stroke();
      x.fillStyle = "rgba(205,164,89,0.6)";
      x.font = "700 30px Mulish, sans-serif"; x.textAlign = "center";
      x.fillText("WINE TASTING COMPANION", W / 2, 110);
      x.font = "700 70px Georgia, serif"; x.fillStyle = "#f0e1c2";
      wrap(x, rec.wine.producer + " " + rec.wine.name, W / 2, 240, 880, 78);
      x.font = "400 36px Mulish, sans-serif"; x.fillStyle = "#b89c72";
      x.fillText(w_meta_plain(rec.wine) + " · " + rec.wine.country, W / 2, 430);
      const cx = W / 2, cy = 720, r = 200;
      x.lineWidth = 32;
      x.strokeStyle = "rgba(255,255,255,0.08)";
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
      const g2 = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g2.addColorStop(0, "#9c2c43"); g2.addColorStop(1, "#cda459");
      x.strokeStyle = g2; x.lineCap = "round";
      x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (rec.totalPct / 100)); x.stroke();
      x.fillStyle = "#f0e1c2"; x.font = "700 140px Georgia, serif";
      x.fillText(rec.totalPct + "%", cx, cy + 50);
      x.font = "100px serif"; x.fillText(rec.award.icon, W / 2, 1060);
      x.font = "700 66px Georgia, serif"; x.fillStyle = "#cda459";
      x.fillText(rec.award.name, W / 2, 1140);
      x.font = "400 34px Mulish, sans-serif"; x.fillStyle = "#d8c3b6";
      x.fillText(rec.award.line, W / 2, 1195);
      x.font = "400 28px Mulish, sans-serif"; x.fillStyle = "#9c8460";
      x.fillText("Guess the wine. Score your palate.", W / 2, 1290);
      cv.toBlob((b) => resolve(new File([b], "scorecard.png", { type: "image/png" })), "image/png");
    });
  }
  function w_meta_plain(w) { return `${w.vintage ? w.vintage + " · " : ""}${(w.grapes || []).join(", ")}`; }
  function wrap(ctx, text, cx, y, maxW, lh) {
    const words = String(text).split(" "); let line = ""; const lines = [];
    words.forEach((wd) => {
      const test = line ? line + " " + wd : wd;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = wd; }
      else line = test;
    });
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, cx, y + i * lh));
  }

  // ---------------- event binding ----------------
  function bind(s) {
    const r = root();
    r.querySelectorAll("[data-act='back']").forEach((b) => b.onclick = back);
    r.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => goTab(b.dataset.tab));
    r.querySelectorAll("[data-hist]").forEach((row) =>
      row.onclick = () => { state.historyDetailId = row.dataset.hist; go("historyDetail"); });

    if (s === "onboarding") {
      const done = r.querySelector("[data-act='onboard-done']");
      if (done) done.onclick = () => { try { localStorage.setItem(OKEY, "1"); } catch (e) {} goTab("home"); };
    }

    if (s === "mode") {
      const solo = r.querySelector("[data-act='mode-solo']");
      if (solo) solo.onclick = () => { state.mode = "solo"; go("restaurants"); };
      const study = r.querySelector("[data-act='mode-study']");
      if (study) study.onclick = () => startStudy();
      const grp = r.querySelector("[data-act='mode-group']");
      if (grp) grp.onclick = () => toast("Live group play is coming next 🍷 For now, gather round one phone!");
    }

    if (s === "home") {
      const start = r.querySelector("[data-act='start']");
      if (start) start.onclick = () => {
        if (!DATA.restaurants.length) { toast("Wine list still loading"); return; }
        go("mode");
      };
      const howto = r.querySelector("[data-act='howto']");
      if (howto) howto.onclick = () => go("onboarding");
      const ss = r.querySelector("[data-act='startstudy']");
      if (ss) ss.onclick = () => startStudy();
      const res = r.querySelector("[data-act='resume-progress']");
      if (res) res.onclick = () => {
        const prog = loadProgress();
        if (!prog || !wineById(prog.wineId)) { toast("That tasting expired"); clearProgress(); render(); return; }
        state.mode = prog.mode || "solo";
        state.wineId = prog.wineId; state.restaurantId = prog.restaurantId;
        state.stepIndex = prog.stepIndex || 0; state.guesses = prog.guesses || {};
        state.showAllNotes = false; state.tasteStart = Date.now(); go("tasting");
      };
      const disc = r.querySelector("[data-act='discard-progress']");
      if (disc) disc.onclick = () => { clearProgress(); render(); };
      r.querySelectorAll("[data-suggest]").forEach((row) => row.onclick = () => {
        state.restaurantId = row.dataset.rest || null;
        startTasting(row.dataset.suggest);
      });
    }

    if (s === "restaurants") {
      r.querySelectorAll("[data-rest]").forEach((row) =>
        row.onclick = () => { state.restaurantId = row.dataset.rest; go("winelist"); });
    }

    if (s === "winelist") {
      r.querySelectorAll("[data-wine]").forEach((row) =>
        row.onclick = () => startTasting(row.dataset.wine));
    }

    if (s === "tasting") {
      r.querySelectorAll("[data-choice]").forEach((btn) => btn.onclick = () => onChoice(btn));
      r.querySelectorAll("[data-skip]").forEach((btn) => btn.onclick = () => {
        delete state.guesses[btn.dataset.skip]; persistProgress(); render();
      });
      const tg = r.querySelector("[data-act='toggle-notes']");
      if (tg) tg.onclick = () => { state.showAllNotes = !state.showAllNotes; render(); };
      const next = r.querySelector("[data-act='next']");
      if (next) next.onclick = onNext;
    }

    if (s === "reveal" || s === "historyDetail") bindReveal(r);

    if (s === "palate") {
      const fc = r.querySelector("[data-act='flashcards']");
      if (fc) fc.onclick = () => { state.deck = "grapes"; initFlashcards(); state.quizMode = false; go("flashcards"); };
      const rc = r.querySelector("[data-act='regioncards']");
      if (rc) rc.onclick = () => { state.deck = "regions"; initFlashcards(); state.quizMode = false; go("flashcards"); };
      const dr = r.querySelector("[data-act='drill']");
      if (dr) dr.onclick = () => drillBlindSpots();
      const ex = r.querySelector("[data-act='examsetup']");
      if (ex) ex.onclick = () => go("examsetup");
      const rvw = r.querySelector("[data-act='review']");
      if (rvw) rvw.onclick = () => startReview();
    }

    if (s === "review") {
      const card = r.querySelector("[data-act='flip']");
      if (card) card.onclick = () => { state.cardFlipped = !state.cardFlipped; render(); };
      const got = r.querySelector("[data-act='srs-got']");
      if (got) got.onclick = () => {
        const it = state.review.queue[state.review.idx];
        srsGrade(it.deck, it.name, true);
        state.review.got++; state.review.idx++; state.cardFlipped = false; render();
      };
      const miss = r.querySelector("[data-act='srs-missed']");
      if (miss) miss.onclick = () => {
        const it = state.review.queue[state.review.idx];
        srsGrade(it.deck, it.name, false);
        state.review.missed++; state.review.idx++; state.cardFlipped = false; render();
      };
      const done = r.querySelector("[data-act='review-done']");
      if (done) done.onclick = () => { state.review = null; goTab("palate"); };
    }

    if (s === "flashcards") {
      r.querySelectorAll("[data-deck]").forEach((b) => b.onclick = () => { state.deck = b.dataset.deck; initFlashcards(); render(); });
      const card = r.querySelector("[data-act='flip']");
      if (card) card.onclick = () => { state.cardFlipped = !state.cardFlipped; render(); };
      const q = r.querySelector("[data-act='fc-quiz']");
      if (q) q.onclick = () => { state.quizMode = !state.quizMode; state.cardFlipped = false; render(); };
      const sh = r.querySelector("[data-act='fc-shuffle']");
      if (sh) sh.onclick = () => { initFlashcards(); render(); };
      const N = studyDeck().length;
      const pv = r.querySelector("[data-act='fc-prev']");
      if (pv) pv.onclick = () => { state.cardIdx = (state.cardIdx - 1 + N) % N; state.cardFlipped = false; render(); };
      const nx = r.querySelector("[data-act='fc-next']");
      if (nx) nx.onclick = () => { state.cardIdx = (state.cardIdx + 1) % N; state.cardFlipped = false; render(); };
    }

    if (s === "examsetup") {
      r.querySelectorAll("[data-etier]").forEach((b) => b.onclick = () => { state.examPrefs.tier = b.dataset.etier; render(); });
      r.querySelectorAll("[data-en]").forEach((b) => b.onclick = () => { state.examPrefs.n = parseInt(b.dataset.en, 10); render(); });
      r.querySelectorAll("[data-emins]").forEach((b) => b.onclick = () => { state.examPrefs.mins = parseInt(b.dataset.emins, 10); render(); });
      const begin = r.querySelector("[data-act='exam-begin']");
      if (begin) begin.onclick = () => startExam(state.examPrefs.tier, state.examPrefs.n, state.examPrefs.mins);
    }

    if (s === "examreport") {
      const rs = r.querySelector("[data-act='exam-restart']");
      if (rs) rs.onclick = () => { state.exam = null; go("examsetup"); };
      const dn = r.querySelector("[data-act='exam-done']");
      if (dn) dn.onclick = () => { state.exam = null; goTab("palate"); };
    }
  }

  function bindReveal(r) {
    const ring = r.querySelector(".ring-progress");
    if (ring) requestAnimationFrame(() =>
      requestAnimationFrame(() => { ring.style.strokeDashoffset = ring.dataset.target; }));

    const sh = r.querySelector("[data-act='share']");
    if (sh) sh.onclick = () => {
      const rec = loadHistory().find((x) => x.id === sh.dataset.id);
      if (rec) shareRecord(rec);
    };
    const sv = r.querySelector("[data-act='savenote']");
    if (sv) sv.onclick = () => {
      const ta = r.querySelector("textarea.notes");
      const h = loadHistory();
      const rec = h.find((x) => x.id === sv.dataset.id);
      if (rec) { rec.notes = ta.value; saveHistory(h); toast("Note saved to your cellar 🍷"); }
    };
    const ta2 = r.querySelector("[data-act='tasteanother']");
    if (ta2) ta2.onclick = () => goTab("home");
    const sa = r.querySelector("[data-act='studyagain']");
    if (sa) sa.onclick = () => startStudy();
    const en = r.querySelector("[data-act='exam-next']");
    if (en) en.onclick = () => { state.exam.idx++; startExamWine(); };
    const ef = r.querySelector("[data-act='exam-finish']");
    if (ef) ef.onclick = () => go("examreport");
    const gh = r.querySelector("[data-act='gohome']");
    if (gh) gh.onclick = () => goTab("home");
    const rt = r.querySelector("[data-act='retaste']");
    if (rt) rt.onclick = () => { state.restaurantId = rt.dataset.rest; startTasting(rt.dataset.wine); };

    // ---- capture: load existing media, wire photo + voice ----
    r.querySelectorAll("[data-photo]").forEach(async (img) => {
      const b = await IDB.get("photo_" + img.dataset.photo);
      if (b) img.src = URL.createObjectURL(b);
    });
    r.querySelectorAll("[data-voice]").forEach(async (au) => {
      const b = await IDB.get("voice_" + au.dataset.voice);
      if (b) au.src = URL.createObjectURL(b);
    });
    const ap = r.querySelector("[data-act='addphoto']");
    const pin = r.querySelector("[data-photoinput]");
    if (ap && pin) ap.onclick = () => pin.click();
    if (pin) pin.onchange = () => {
      const f = pin.files && pin.files[0]; if (!f) return;
      processPhoto(f, async (blob) => {
        if (!blob) { toast("Couldn't read that photo"); return; }
        try { await IDB.put("photo_" + pin.dataset.photoinput, blob); }
        catch (e) { toast("Storage full — couldn't save photo"); return; }
        const h = loadHistory(); const rec = h.find((x) => x.id === pin.dataset.photoinput);
        if (rec) { rec.hasPhoto = true; const ta = r.querySelector("textarea.notes"); if (ta) rec.notes = ta.value; saveHistory(h); }
        toast("Photo added 📷"); render();
      });
    };
    const rv = r.querySelector("[data-act='recvoice']");
    if (rv) rv.onclick = () => { if (voiceRecording()) stopVoice(); else startVoice(rv.dataset.id, rv); };
  }

  function onChoice(btn) {
    const key = btn.dataset.choice;
    const val = btn.dataset.val;
    const multi = btn.dataset.multi === "1";
    if (multi) {
      const cur = Array.isArray(state.guesses[key]) ? state.guesses[key].slice() : [];
      const i = cur.indexOf(val);
      if (i >= 0) cur.splice(i, 1); else cur.push(val);
      state.guesses[key] = cur;
      btn.classList.toggle("selected");
    } else {
      state.guesses[key] = val;
      const siblings = btn.parentElement.querySelectorAll("[data-choice='" + cssEscape(key) + "']");
      siblings.forEach((sib) => sib.classList.remove("selected"));
      btn.classList.add("selected");
    }
    persistProgress();
  }
  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

  function onNext() {
    const wine = wineById(state.wineId);
    const sections = askableSections(wine);
    if (state.stepIndex < sections.length - 1) {
      state.stepIndex++; if (!state.exam) persistProgress(); render(); window.scrollTo(0, 0);
    } else if (state.exam) {
      finishExamWine(false);
    } else {
      finishTasting();
    }
  }

  // ---------------- boot ----------------
  document.addEventListener("DOMContentLoaded", () => {
    if (!SCHEMA || !REWARDS) {
      root().innerHTML = "<div class='empty'><div class='e-ic'>⚠️</div><p>App data failed to load.</p></div>";
      return;
    }
    if (!localStorage.getItem(OKEY)) state.stack = ["onboarding"];
    render();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  });

  window.WTC = { state, render, scoreTasting, computePalate, suggestNext, makeScoreImage };
})();
