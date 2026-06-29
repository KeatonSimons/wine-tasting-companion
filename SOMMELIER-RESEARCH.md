# Sommelier Certification & Training — Research Brief
### Foundation for turning Wine Tasting Companion into a credible exam study tool

**Prepared by:** Claude (for Keaton & Amy) · **Date:** 2026-06-28
**Sources:** Court of Master Sommeliers Americas, WSET, Society of Wine Educators,
GuildSomm, and practitioner sources (all linked inline).

> **Confidence note.** This synthesizes a multi-source research pass weighted to
> **official primary sources**. The automated cross-verification step was hit by
> temporary API rate-limiting, so it could not auto-confirm each figure. The
> structural facts below are corroborated by domain knowledge and cited to primary
> pages/PDFs — but **reconfirm exact numbers (pass marks, fees, question counts)
> against the live official pages before using them in any marketing.**

---

## 1. The certification ladders

### Court of Master Sommeliers, Americas (CMS-A) — the classic "sommelier" path
Four levels, in order: **Introductory → Certified → Advanced → Master Sommelier
Diploma.** Three exam pillars recur and get harder each level: **Theory**, **Blind
(Deductive) Tasting**, and **Practical Service.** [CMS-A Exams](https://www.mastersommeliers.org/certification/exams/)

- **Introductory Sommelier** — 2-day course + exam, theory-leaning. Entry level.
- **Certified Sommelier** — three scored sections:
  - **Tasting:** double-blind of **4 wines (2 white, 2 red)** using the Deductive
    Tasting Method grid;
  - **Theory:** ~**45 questions** (multiple-choice, short answer, matching);
  - **Service:** centered on **sparkling-wine service** + beverage/food-pairing Q&A.
- **Advanced Sommelier** — three separately-graded portions (**Theory, Tasting,
  Practical/Service**). Theory is a **~115-question, 60-minute** written exam at a
  Pearson VUE center, **pass ≥ 60%**; you must **pass Theory first**, and **pass
  all three within the same calendar year** or restart. Tasting is **6 wines blind
  in 25 minutes**. [CMS-A Advanced "What to Expect"](https://www.mastersommeliers.org/wp-content/uploads/2023/12/CMS-A-WHAT-TO-EXPECT-at-the-Advanced-Sommelier-Theory-Exam_0.pdf)
- **Master Sommelier Diploma** — oral Theory, Tasting (6 wines/25 min), Service.
  **Brutal:** in **2025 only 1 of 23** qualified candidates passed; most take
  multiple attempts over years. [MS Theory Resource Guide](https://www.mastersommeliers.org/wp-content/uploads/2025/01/Master-Sommelier-Diploma-Theory-Exam-Resource-Guide.pdf)

### WSET — academic wine qualifications, Levels 1–4 (Diploma)
- **Level 4 Diploma in Wines** = six mandatory units, weighted: **D1 Wine
  Production 20%, D2 Wine Business 10%, D3 Wines of the World 50%, D4 Sparkling 5%,
  D5 Fortified 5%, D6 Independent Research Assignment 10%** (D1/D2 studied first).
  - **Grading bands:** 75%+ Distinction · 65–74% Merit · 55–64% Pass · 45–54% Fail ·
    <45% Fail Unclassified. **D3 needs ≥55% in *both* theory and tasting; D4/D5 ≥45%
    in both.**
  - **D3** (the big one) is a two-day exam: **3h20 theory + 3-hour blind tasting of
    12 wines.** Entry requires **WSET Level 3**; the Diploma's total qualification
    time is ~**500 hours**. [WSET L4 spec PDF](https://www.wsetglobal.com/media/7084/wset_l4wines_specification_en_may2019.pdf) · [WSET L4 page](https://www.wsetglobal.com/qualifications/wset-level-4-diploma-in-wines)

### Society of Wine Educators (SWE)
- **Certified Specialist of Wine (CSW):** **100 multiple-choice questions, 1 hour,
  pass ≥ 75%**, all drawn from the CSW Study Guide. Broad theory: taste physiology,
  wine chemistry, faults, viti/enology, labels/laws/regions, service, food pairing.
  [SWE CSW](https://societyofwineeducators.org/education-certifications/certified-specialist-of-wine/) (CWE adds tasting + a viva.)

---

## 2. The blind-tasting frameworks (the heart of the app)

### CMS Deductive Tasting Method (DTM) — *deduce the wine from a fixed grid*
Separate **White** and **Red** grids; candidates **must fill every line ("DO NOT
leave any blank lines")**. Sections on the official Certified grid (CMS-A 1-2025):
**COLOR (Sight) → FRUIT → NON-FRUIT → STRUCTURE → CONCLUSION.**
[CMS-A Certified DTM Grid PDF](https://www.mastersommeliers.org/wp-content/uploads/2023/12/CMS-A-Certified-Sommelier-Deductive-Tasting-Grid.pdf)

- **STRUCTURE** is forced onto a **4-step scale** for acidity, alcohol, (and tannin
  on reds): **"Low–Medium−" · "Medium" · "Medium+" · "High."** Sweetness =
  **Dry / Off-Dry.**
- **CONCLUSION** requires deducing, from a **closed examinable list**: **Primary
  Grape Variety · Climate (Cool / Moderate / Warm) · Country of Origin · Age Range**
  — *plus* listing **six candidate grapes with reasoning.**
- **Examinable "probable varieties"** (Advanced/Master): **10 whites** — Albariño,
  Chardonnay, Chenin Blanc, Gewürztraminer, Grüner Veltliner, Pinot Gris, Riesling,
  Sauvignon Blanc (& blends), Torrontés, Viognier; **14 reds** — Cabernet Sauvignon
  (& blends), Cabernet Franc, Carménère, Corvina (blends), Gamay, Grenache, Malbec,
  Merlot, Nebbiolo, Pinot Noir, Sangiovese, Syrah, Tempranillo, Zinfandel.

### WSET Systematic Approach to Tasting (SAT) — *describe systematically, then judge*
[WSET SAT](https://www.wsetglobal.com/knowledge-centre/wset-systematic-approach-to-tasting-sat) — assess defined fields:
- **Appearance:** intensity (pale–medium–deep), colour.
- **Nose:** intensity (light→pronounced); aroma characteristics (primary / secondary
  / tertiary).
- **Palate:** sweetness (dry→sweet), acidity, tannin, alcohol, body, flavour
  intensity, finish.
- **Conclusions:** a **Quality assessment** (poor → acceptable → good → very good →
  outstanding, *with reasons*) and a **readiness/ageing** judgment (drink now / can
  age, *with reasons*); at Diploma you also call grape/origin.

**The key distinction for our product:** CMS = *deduce the wine* (grape, origin,
age, climate) from a rigid grid; WSET = *systematic description + a quality &
ageing verdict.* Our app already blends both (palate grid + deduction calls), so
we're on the right track — we just need to align the **scales and conclusion calls**
to the real grids and offer **both modes.**

---

## 3. Theory scope (what they must *know*)
At the higher levels theory spans: viticulture & vinification; **every major wine
region and its laws** (France, Italy, Spain, Germany, Austria, Portugal, USA, plus
the New World); sparkling, fortified, sweet & aromatized wines; **and beyond wine —
beer, sake (classification + polishing ratios), and spirits/cocktails** (distillation,
base ingredients, aging laws, aperitifs/digestifs). High-yield: French & Italian
appellation law and grape↔region mapping. [Advanced "What to Expect"](https://www.mastersommeliers.org/wp-content/uploads/2023/12/CMS-A-WHAT-TO-EXPECT-at-the-Advanced-Sommelier-Theory-Exam_0.pdf) · [GuildSomm study wiki](https://www.guildsomm.com/learn/study/w/study-wiki)

---

## 4. How candidates actually train (and pass vs. fail)
- **Drill the deductive grid to automaticity** — repeat the grid so structure calls
  are reflexive under time pressure. [Tim Gaiser, MS — grid technique](https://timgaiser.com/blog/catch-and-release-using-the-deductive-tasting-grid/)
- **Calibration / benchmark tasting** — taste *known* examples of each examinable
  grape repeatedly to build a reliable reference memory for structure and markers.
- **Flashcards + spaced repetition** for the enormous theory load.
- **Study groups, maps, and GuildSomm** (study wiki + podcasts on blind-tasting
  method) are the dominant prep ecosystem. [GuildSomm blind-tasting methods](https://www.guildsomm.com/public_content/features/podcasts/b/guild_podcasts/posts/study-methods-to-improve-your-blind-tasting-ability)
- **What separates a pass from a fail (tasting):** completing the grid with discipline
  (not jumping to "the answer"), **calibrated structure calls** (acid / tannin /
  alcohol), and broad enough theory to make the right final deduction. Freezing,
  mis-calibrating structure, and thin theory are the classic killers. [Certified advice](https://timgaiser.com/wine-blog/advice-for-students-taking-the-certified-sommelier-examination-2025/)

---

## 5. What this means for our app (and the market)
**Direct competitor:** **Cork Dork** ([corkdork.io](https://www.corkdork.io/)) — a CMS/WSET study app with
**2,500+ flashcards, spaced repetition, 40+ maps**, interactive content, **tiered by
exam level** (L1 = CMS Intro + WSET 2/3; L2 = CMS Certified + WSET 3+). It proves the
market and the segmentation model — and shows the bar to clear.

**Where we already stand (strong foundation):** blind deductive mode, grape
flashcards (browse + quiz), weakness-targeted drills, a palate profile that tracks
improvement, and a timed exam simulation with difficulty tiers.

**Upgrades to make it genuinely exam-grade & sellable (prioritized):**
1. **Align the tasting grid to the real CMS DTM** — adopt the **4-step structure
   scale** (Low–Medium− / Medium / Medium+ / High) for acidity/alcohol/tannin, add a
   **Climate (Cool/Moderate/Warm)** call, and frame conclusions exactly as CMS does.
2. **Use the official examinable grape lists** (10 white / 14 red) for the grape call
   and the flashcard deck — instantly credible to any CMS candidate.
3. **Add a WSET SAT mode** with a **Quality** (poor→outstanding) and **ageing**
   verdict — covers the other big exam track.
4. **Theory flashcard decks + spaced repetition** (regions, appellation laws,
   grape↔region, sake/spirits) — the biggest study lever beyond tasting.
5. **Calibration mode** — "taste the benchmark": serve known examples of one grape so
   the user builds reference memory (mirrors how real candidates calibrate).
6. **Maps** and **level-tiered content** (Intro / Certified / Advanced; WSET 2/3/4).
7. **Track to a target exam** — pick CMS Certified or WSET L3, and the app shapes the
   grid, grape list, and theory to that syllabus.

> **Ground truth still wins:** when Amy sends screenshots of her actual practice
> chart, that becomes the canonical grid — this research tells us the surrounding
> structure (scales, examinable grapes, conclusion calls) to match it to.

---

### Source list
- CMS-A Exams — https://www.mastersommeliers.org/certification/exams/
- CMS-A Certified Deductive Tasting Grid (PDF) — https://www.mastersommeliers.org/wp-content/uploads/2023/12/CMS-A-Certified-Sommelier-Deductive-Tasting-Grid.pdf
- CMS-A Advanced "What to Expect" (PDF) — https://www.mastersommeliers.org/wp-content/uploads/2023/12/CMS-A-WHAT-TO-EXPECT-at-the-Advanced-Sommelier-Theory-Exam_0.pdf
- CMS Master Sommelier Diploma Theory Resource Guide (PDF) — https://www.mastersommeliers.org/wp-content/uploads/2025/01/Master-Sommelier-Diploma-Theory-Exam-Resource-Guide.pdf
- WSET Level 4 Diploma spec (PDF) — https://www.wsetglobal.com/media/7084/wset_l4wines_specification_en_may2019.pdf
- WSET Level 4 Diploma page — https://www.wsetglobal.com/qualifications/wset-level-4-diploma-in-wines
- WSET Systematic Approach to Tasting — https://www.wsetglobal.com/knowledge-centre/wset-systematic-approach-to-tasting-sat
- Society of Wine Educators — CSW — https://societyofwineeducators.org/education-certifications/certified-specialist-of-wine/
- GuildSomm study wiki — https://www.guildsomm.com/learn/study/w/study-wiki
- GuildSomm — Preparing for Deductive Tasting Exams (PDF) — https://www.guildsomm.com/cfs-file/__key/communityserver-components-userfiles/00-00-00-66-84/preparing-for-deductive-tasting-exams-at-high-levels.pdf
- Tim Gaiser MS — Deductive grid technique — https://timgaiser.com/blog/catch-and-release-using-the-deductive-tasting-grid/
- Cork Dork (competitor) — https://www.corkdork.io/
