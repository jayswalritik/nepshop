# Search Relevance Overhaul — Diagnosis & Proposal

**Branch**: `feature/search-relevance` (confirmed via `git branch --show-current`)
**Status**: DIAGNOSE + PROPOSE ONLY. No implementation in this session. All evidence below comes from live, read-only runs against the real catalog (DNS-override pattern, no writes, no backfill/loop scripts).

---

## Phase 1 — Diagnosis (with evidence)

### 1. Admission cutoff — CONFIRMED, with a precise mechanism

Real cosine similarities (`computeSemanticScores`, `semanticSearchService.js:142-168`) measured against the live catalog, compared to `semCut = max(semanticFloor, topSem − semanticTopMargin)` (`searchEngine.js:845-858`, config values `searchConfig.js:140,146,152`: floor=0.50, margin=0.09):

| Query | topSem | semCut | iPhone 16 cosine | Result |
|---|---|---|---|---|
| "phone" | 0.5602 (Galaxy A55) | **0.5000** (floor wins: 0.5602−0.09=0.4702 < floor) | **0.4939** | **FAILS** cut by 0.0061 |
| "phones" | 0.5850 (Galaxy A55) | 0.5000 | 0.4939 region N/A — under the RAW `"phones"` embedding, iPhone re-embeds differently and *does* clear the cut (see live run below) | admitted |

**Confirmed**: iPhone genuinely fails the semantic floor for bare "phone" — not a bug in the arithmetic, a real near-miss (0.4939 vs 0.50 floor). Crucially, `topSem − margin = 0.4702` is *below* iPhone's score (0.4939) — iPhone already clears the **relative margin** test, it only fails the **absolute floor**. This is the precise, narrow mechanism: a genuine near-tie sibling of the top scorer, killed by the floor, not the margin.

For "mobie" the picture is different and important: **iPhone's raw cosine for the literal string "mobie" isn't in the top 12 at all** — the actual #1 scorer for raw "mobie" is `Gigabyte Aorus Men Tshirt` (0.5301, pure embedding noise on an uncorrected typo). None of the phones clear even the 0.45 pre-filter threshold for the garbled token. Yet a live full-pipeline run of `searchProducts('mobie', ...)` **does** surface both phones — because the **LLM zero-result rescue** (`queryUnderstanding.js`, triggered via `nepShopSearchAdapter.js:213` `shouldAskLLM`) reinterprets "mobie" → `["phone","mobile","cellphone","device"]` and reruns. So "mobie"'s observed behavior is **not** an admission-cutoff issue at all — it's masked entirely by the LLM rescue, which is itself nondeterministic (see item 5).

### 2. Ranking composition — CONFIRMED, with exact numbers

Live `searchProducts()` runs (this session, real Groq calls) show the `_scoreParts` (recommendation base, `recommendationEngine.js:75-115`) and `_searchParts` (search-specific, `searchEngine.js:671-692`) breakdown. Example from a "phones" run where the LLM filter *did* correctly drop the junk:

```
#1 iPhone 16   score=54  _scoreParts={category:0,price:10,seller:0,rating:0,popularity:0,recency:10}  _searchParts={base:41.8,textMatch:0,budget:13,color:0,semantic:22}
#2 Galaxy A55  score=53  _scoreParts={category:0,price:10,seller:0,rating:0,popularity:0,recency:7}   _searchParts={base:40.4,textMatch:0,budget:13,color:0,semantic:23}
```

But this only happened because the LLM veto fired and dropped 6 junk items that session. Reconstructing the **pre-filter** raw pool composition from the semantic-only diagnostic (`computeSemanticScores` + `deriveCategoryFromMatches`, since `strong=[]` for "phones" → `derivedCategory=null` → **the existing semantic-only-cut never engages at all**, see item 4):

| Item | cosine | semantic pts (×40) | rating | ratingScore (×15/5) | numReviews | popularityScore |
|---|---|---|---|---|---|---|
| Galaxy A55 | 0.5850 | 23.4 | 0 | **0** | 0 | **0** |
| Huawei Matebook X Pro | 0.5060 | 20.2 | 4.98 | **14.9** | 0 | 0 |
| Apple (fruit) | 0.5166 | 20.7 | 4.19 | **12.6** | 0 | 0 |
| Apple Airpods | 0.5105 | 20.4 | 4.15 | **12.5** | 0 | 0 |
| Baseball Ball | 0.5161 | 20.6 | 2.57 | **7.7** | 0 | 0 |

**Confirmed exactly**: `numReviews=0` for every single sampled product (real and junk alike) — `popularityScore` (`recommendationEngine.js:52-55`, `log(numReviews+1)`) is **0 across the board**, not the discriminator. The discriminator is purely **`rating`** — junk items happen to carry seeded ratings (2.57–4.98) while the two real phones both show `rating=0`. The junk items' semantic scores are all *lower* than the phones' (20.2–20.7 vs 23.4), a real but small (~3-point) relevance gap — comfortably overturned by a 7.7–14.9-point rating edge under current weights. **Confirmed**: category-blind rating points are what lift junk above unreviewed phones, exactly as suspected.

For "mobiles", `Charger SXT RWD` clears semCut at **0.5003** — barely above the 0.50 floor, and *below* both phones' own cosine scores (A55 0.5197, matches the observation of a live run). Its `rating=2.58` → `ratingScore≈7.7` vs phones' 0 is enough to flip the order despite Charger's own weaker semantic relevance. **Confirmed**: "charger" semantic collision (a real, near-floor cosine tie) + rating points, exactly as suspected, with real numbers.

### 3. Typo & plural handling — root cause found, deeper than expected

Traced the full chain (`parseQuery`, `searchEngine.js:422-479`):
- `spellCorrect` (`searchEngine.js:262-295`): step 1 is a fixed `spellCorrections` dict (`searchConfig.js:49-68`, brand names only — no "mobie"/"monile" entries). Step 2 is `fuzzyCorrectToken` (`searchEngine.js:212-254`) against `buildCatalogVocabulary` (`searchEngine.js:157-178`, **name + category text only, never description**).
- **Measured directly against the live catalog**: `vocab.has('phone') === false`, `vocab.has('mobile') === false`. Only `vocab.has('iphone') === true` (freq 1). **No product's name or category field contains the standalone word "phone" or "mobile" anywhere in the catalog** — products are named "Apple iPhone 16 (128GB)" / "Samsung Galaxy A55", categorized generically "Electronics", never "Mobile"/"Phone". So `fuzzyCorrectToken` structurally **cannot** correct "mobie"/"monile" toward "mobile" or "phone" — the correction target simply doesn't exist in its search space, independent of any synonym-group fix.
- Plurals: confirmed via `grep` — **no stemming exists anywhere in the file**. The only plural-adjacent logic is `wordMatch`'s forward prefix tolerance (`searchEngine.js:78-103`, comment at 72, tolerance logic at 95-100): a **query** term may match a **longer** product word by up to 2 extra letters (`"headphone"` matches `"headphones"`). This only works in the query→product direction. It cannot help `"phones"` match `"iPhone"` (not a prefix relationship — "phone" is a **suffix** of "iphone", never handled) nor `"phones"` match `"phone"` in a *product's own text* unless that exact product text contains the word "phone" somewhere.
- `synonymGroups` (`searchConfig.js:18`): `['mobile', 'phone', 'smartphone', 'cellphone']` — **missing plural forms**, inconsistent with every other group in the same file: `['tablet', 'tablets', 'ipad']` (line 20), `['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear']` (line 23), `['headphone', 'headphones', ...]` (line 21), `['trouser', 'trousers']` (line 26) all explicitly list both forms. This is a clear, isolated omission, not a structural gap.
- **Net effect measured live**: `parseQuery('phones', ...)` → `productTerms: ["phones"]`, un-expanded (no group contains the literal token "phones"). `partitionMatches` against the whole catalog → `strong=0, weak=0`. Same for "mobiles". Both queries produce **zero literal matches of any kind** and fall through entirely to semantic-only admission — which is *why* `derivedCategory` ends up `null` for both (see item 4) and neither the category boost nor the semantic-only-cut can help them.

### 4. N-category ambiguity — confirmed to generalize correctly; not a bug

- `deriveCategoryFromMatches` (`searchEngine.js:603-618`): builds a plain frequency map over however many distinct categories appear in `matchedProducts`, picks the single most frequent (`sorted[0]`), and requires `topCount/total >= 0.6`. This is **N-category-general by construction** — nothing in the algorithm assumes exactly 2 categories; a 3rd, 4th, or 5th category is just another key in the same frequency map. A genuinely 3-way-even split (e.g., 34/33/33) correctly yields `category: null` (no dominant), same as a 2-way 50/50 split would.
- The semantic-only-cut (`searchEngine.js:921-924`, from the prior `feature/search-multicategory` work, present on this branch): `pool.filter(p => p.category === derivedCategory || !semanticOnlyIds.has(...))` treats **every** non-derived category identically — it doesn't special-case "the other one," so a 3rd/4th/5th category's semantic-only stragglers are cut exactly the same way a 2nd category's would be.
- **No hard 2-category assumption found anywhere** in this logic path. The actual reason "phones"/"mobiles" don't benefit from this machinery isn't a defect in `deriveCategoryFromMatches` — it's that they never reach it with *any* matches at all (item 3's root cause: `strong=[]`), so `derivedCategory` is `null` and the entire category-aware machinery (boost + cut) sits idle. This is a consequence of item 3, not an independent bug.

### 5. Current guard state — CONFIRMED, and reproduced live

Confirmed by direct file read: `backend/services/resultFilter.js` currently has **no** `TINY_POOL_MAX` skip and **no** top-scorer protection — it is the original pre-guard version (single-item pools still fully judged, no `filterProtectMargin`). `nepShopSearchAdapter.js` and `searchConfig.js` are likewise at main-branch state (no tiny-pool log line, no `filterProtectMargin` knob). This matches the brief exactly — the branch containing those guards was deleted.

**Live reproduction this session** (real Groq calls, not simulated):
- `"phone"` → raw pool of 2 (Galaxy A55 admitted via weak literal + semantic, Galaxy Tab admitted via semantic-only). `[search:filter] main fired kept=1 dropped=1` — **the LLM vetoed one of only two candidates**, leaving a single result. This is the exact nondeterministic-veto failure mode the deleted guards were built to prevent, reproduced live, right now, on this branch.
- `"phones"` → raw pool of 8 (2 real phones + 6 junk). `[search:filter] main fired kept=2 dropped=6` — this particular run, the LLM *correctly* judged and dropped all 6 junk items, leaving both phones on top. This demonstrates the filter **can** work correctly, but its reliability is not guaranteed — the underlying pool composition (junk admitted at all) is the deeper issue, and an unlucky run could easily have kept the junk and dropped a phone instead (as it did for the "phone" query in the very same diagnostic session).
- `"mobiles"` → similar: this run correctly dropped `Charger SXT RWD`, but its earlier standalone semantic score (0.5003) shows it clears admission on its own merits; a different LLM judgment call could keep it.

---

## Phase 2 — Proposals (priority order)

### Proposal 1 — Re-instate the LLM result-filter guards (tiny-pool skip + top-scorer protection)

**Not made redundant by the other fixes — argued explicitly**: even after fixing admission/ranking (Proposals 2-4 below), the LLM veto step still runs on the surviving anchor-less pool and is still nondeterministic Groq output. This session's own live run reproduced the guard's exact failure mode (Galaxy Tab nondeterministically vetoed from a legitimate 2-item pool) *independent of* the ranking/admission bugs. The guards address a different failure surface (LLM reliability) than the ranking/admission fixes (deterministic scoring), and both are needed.

- **Files/functions**: `backend/services/resultFilter.js` (`filterResults`) — restore `TINY_POOL_MAX = 3` early-return before any LLM call, and top-scorer protection that excludes items within `filterProtectMargin` of the pool's top `_searchSemantic` from the LLM prompt entirely (not "ask then ignore" — structural exclusion, as previously validated). `backend/services/nepShopSearchAdapter.js` (`applyResultFilter`) — restore the `skipped tiny pool n=X` log special-case.
- **Config knob (search-owned)**: `searchConfig.js` → `filterProtectMargin: 4` (same reasoning as before: `semanticTopMargin(0.09) × searchWeights.semantic(40) = 3.6`, rounded up for headroom).
- **Expected effect**: `"phone"` — Galaxy A55 (top scorer) and Galaxy Tab (near-tie, within margin) both protected from veto, survive every run deterministically; only genuine weak-tail noise remains vetoable. `"mobiles"`/`"phones"` — same protection for the two real phones once they're admitted into the pool by Proposals 2-4.
- **Risk to green suites**: none expected — this is a restoration of previously-validated, previously-green work (was at `searchFilterGuard.test.js` 4/4, `testSearchPrecision.js` 54/54 before deletion).
- **Tests**: restore `backend/tests/searchFilterGuard.test.js` (the 4 tests: tiny-pool skip, top-2 protection survives an aggressive mocked veto, weak-tail vetoed, no-score item vetoable) — same content as previously validated, not new design.

### Proposal 2 — Fix plural/typo normalization (deterministic, general)

- **Files/functions**:
  - `searchConfig.js` — add plural forms to the phone synonym group, matching every other group's existing convention: `['mobile', 'mobiles', 'phone', 'phones', 'smartphone', 'smartphones', 'cellphone', 'cellphones']` (line 18).
  - `searchEngine.js` — **general** (not phone-specific) fix, two parts:
    1. A light, deterministic plural-stripping normalization applied to each token *before* synonym-group lookup and vocabulary lookup: if a token ends in `s`/`es` and its stem (minus suffix) is itself a synonym-group member or catalog-vocabulary word, treat the plural as that stem for matching purposes. This is a general suffix rule (not a word list) — `"phones"→"phone"`, `"watches"→"watch"`, `"boxes"→"box"` all fall out of the same rule, no per-word entries.
    2. Broaden `fuzzyCorrectToken`'s correction-target vocabulary (`searchEngine.js:212`) from *catalog name+category text only* to *catalog vocabulary ∪ synonym-group canonical words*, so "mobie"/"monile" have a real target ("mobile") to correct toward even though no product literally contains that word. This is the deeper fix — without it, no amount of synonym-group editing fixes the *typo* case, only the *plural* case.
- **Vocabulary/edit-distance rules**: unchanged existing rules (`searchEngine.js:212-254`) — min length 5, distance budget 1 (<7 chars) / 2 (≥7 chars), adjacent-transposition-as-1-edit, frequency tie-break — only the *target set* being corrected against grows (catalog words ∪ synonym words), not the algorithm.
- **Expected effect**: `"phones"`/`"mobiles"` get real literal (weak, via A55's description) matches once "phone"/"mobile" is in the gate-term set → `strong` may still be 0 (A55 is description-only) but `weak>0` establishes a genuine anchor, which feeds Proposal 4's floor relaxation and enables `derivedCategory` reasoning. `"mobie"`/`"monile"` correct deterministically to "mobile" without depending on the LLM rescue's nondeterminism at all.
- **Risk to green suites**: LOW for the synonym-group addition (pure config addition, additive). MODERATE for the vocabulary-broadening and plural-stripping — touches `fuzzyCorrectToken`/`parseQuery`, used by every query in `testSearchPrecision.js`; must re-run all 54 assertions (particularly the byte-identical baselines: `laptop`, `pc`, `shoes`, `watch`, `shampoo`) since a broadened correction vocabulary could, in principle, start "correcting" a previously-untouched token.
- **Tests**: extend `searchMultiCategory.test.js` or a new `backend/tests/searchNormalization.test.js` (in-memory fixtures, no DB) — assert `parseQuery('phones', ...).productTerms` includes `'phone'`/`'mobile'` after expansion; assert `fuzzyCorrectToken('mobie', vocabWithSynonyms)` returns `'mobile'`; assert an unrelated valid plural word ("boxes") isn't wrongly merged into an unrelated singular; assert existing typo-correction tests (already in `testSearchPrecision.js`) still pass byte-identical.

### Proposal 3 — De-weight quality signals inside the search path (relevance must dominate)

- **Files/functions**: `searchEngine.js`, `runSearch` — insert a new step immediately after `basedPool = pool.map(p => scoreProduct(p, recSignals))` (current step 8) that rescales *only* the `rating`/`popularity`/`recency` components of `p._scoreParts` by a new factor, adjusting `_score` by the delta. **Does not touch `recommendationEngine.js` or `recommendationConfig.js`** — `scoreProduct`'s shared weights (used by recommendation carousels) are called and returned exactly as today; this is a search-local post-processing step that reads the already-computed `_scoreParts` and adjusts the copy used for search ranking only.
- **Config knob (search-owned)**: `searchConfig.js` → `qualitySignalScale: 0.25`. Reasoning from Phase 1 evidence: quality's combined ceiling is `rating(15)+popularity(15)+recency(10)=40`; scaled by 0.25 the ceiling drops to 10 — below the smallest realistic single relevance signal (a weak textMatch ~9, or a modest semantic contribution ~20). This means quality can nudge a near-tie (its intended "tiebreak" role) but a ~10-point max can't overturn the ~3-13-point relevance gaps measured in Phase 1 item 2 between real phones and the junk items that currently beat them. `category` and `price` (also from `scoreProduct`) are deliberately **not** scaled — they're relevance-adjacent (category match, budget proximity), not "quality" in the brief's sense.
- **Expected effect**: `"phones"` — Matebook's current ~15-point rating edge shrinks to ~3.75, no longer enough to overcome its ~3-point semantic deficit vs the phones; similarly for Apple-fruit/Airpods/Baseball-Ball. `"mobiles"` — Charger's ~7.7-point rating edge shrinks to ~1.9, insufficient to overcome its own weaker semantic score vs either phone.
- **Risk to green suites**: MODERATE-HIGH — this changes `_score` ordering for **every** search query that has any rated products in its pool, not just the four failing ones. `testSearchPrecision.js`'s byte-identical baselines (`laptop`, `pc`, `shoes`, `watch`, `shampoo`) are the highest-risk targets and must be re-verified in full; `searchMultiCategory.test.js`'s category-boost-ranks-above-minority assertions should be unaffected (they use identical rating/numReviews/createdAt across fixtures by design, so a uniform scale-down doesn't change relative order there) but must still be re-run.
- **Tests**: extend `searchMultiCategory.test.js` (or a new `searchQualitySignalScale.test.js`) — in-memory fixtures: an item with high rating/low semantic score vs an item with zero rating/higher semantic score, assert the higher-semantic item ranks first under the new scale; assert calling `scoreProduct` directly (bypassing `runSearch`) still returns the *unscaled* value, proving the shared recommendation path is untouched.

### Proposal 4 — Relax the semantic admission floor for near-tie siblings of an anchored top score

- **Files/functions**: `searchEngine.js`, `runSearch` step 4 (~lines 845-858) — when at least one literal match already exists (`strong.length > 0 || weak.length > 0`, both computed *before* `semCut` and thus available without circularity — `corroboratedWeak` cannot be used as the gate since it's itself computed *using* `semCut`), skip the absolute-floor clamp and use `semCut = topSem − semanticTopMargin` alone (no `Math.max` against `semanticFloor`). When no literal match exists at all, behavior is **byte-identical to today** (floor still applies in full).
- **Config knob (search-owned)**: no new number required — reuses the existing `semanticFloor`/`semanticTopMargin`. Optionally add a boolean toggle `semanticFloorAnchoredRelaxation: true` in `searchConfig.js` purely so this specific behavior can be switched off independently if it regresses `testSearchPrecision.js`, without touching code.
- **New expected pool for "phone"**: currently `{Galaxy A55 (weak+semantic), Galaxy Tab (semantic-only)}`. With the anchor present (`weak=[A55]`, so the gate fires), `semCut` drops to `topSem − margin = 0.4702` (no floor clamp) — **iPhone (0.4939) now clears it** and enters as `semanticOnly`. New pool: `{Galaxy A55, Galaxy Tab, iPhone 16}` — the near-tie sibling recovered without touching the floor for any unrelated, anchor-less query.
- **Junk-flooding mitigation — the actual mechanism**: the relaxation is bounded three ways — (1) gated strictly on a real literal match already existing (never fires for a pure-noise anchor-less query, e.g. "diamond ring" per the config's own measured example, so that protection is untouched); (2) still bounded by the *same* `semanticTopMargin` (0.09) — nothing outside that window is ever admitted, relaxed or not; (3) once `derivedCategory` is non-null (which a literal anchor usually establishes), the existing semantic-only-cut (Phase 1 item 4) still trims any off-category admissions from this wider pool. So the relaxation only ever widens the pool *within an already-narrow, already-anchored, already-category-filtered band*.
- **Risk to green suites**: MODERATE-HIGH — `semCut` is used by both the `semanticOnly` admission (`searchEngine.js:873-881`) *and* `corroboratedWeak`'s corroboration gate (`searchEngine.js:868-870`), which several `testSearchPrecision.js` assertions depend on directly (`"lipstick shade"`, `"cricket ball"`, `"football helmet"` partial-match-demotion cases; the `[ResultFilter]` anchor-less-pool tests, since more items clearing admission could change which pools are "anchor-less" at all). This is the riskiest proposal in the set and should be implemented and verified in isolation before combining with Proposals 2-3.
- **Tests**: new `backend/tests/searchSemanticAdmission.test.js` — in-memory fixtures + mocked `semanticScores`: (a) with a weak literal anchor present, an item just below the floor but within margin of top is admitted; (b) with no literal anchor at all, the floor still excludes the same item (regression guard, byte-identical to current behavior); (c) an item outside the margin window is excluded regardless of anchor presence.

### Proposal 5 — N-category ambiguity: no code change

Per Phase 1 item 4, `deriveCategoryFromMatches` and the semantic-only-cut already generalize correctly to any number of categories — confirmed with file:line evidence, no hard 2-category assumption found. **No proposal here beyond Proposal 2**, which is the actual upstream fix (establishing literal matches so `deriveCategoryFromMatches` has something to work with at all for plural queries).

---

## Contradictions found between this brief and the code

1. The brief's example "Dodge Charger" doesn't exist as a literal product name — the real product is `"Charger SXT RWD"` (category Automotive). The underlying phenomenon (a Charger-named item outranking phones on "mobiles") is real and confirmed; only the exact product name in the brief was imprecise. Noted, not blocking.
2. Otherwise no contradictions — item 5's premise (guards deleted, main-branch state) was independently verified via direct file reads and matches exactly.

---

## Terminal summary of evidence (recap)

- **Admission cutoff**: iPhone genuinely fails `"phone"`'s semantic floor by 0.0061 (0.4939 vs 0.50) while already clearing the relative margin (0.4702) — a precise near-miss, not a broad failure. "mobie" bypasses this mechanism entirely via the (nondeterministic) LLM rescue.
- **Ranking**: `numReviews=0` for every sampled product — popularity is a non-factor; `rating` alone (0 for both real phones, 2.57–4.98 for the junk that beats them) is the entire quality-signal discriminator, worth 7.7–14.9 points against a mere ~3-point semantic deficit.
- **Typos/plurals**: "phone"/"mobile" don't exist anywhere in the catalog's own name/category text (`vocab.has('phone')===false`), so typo correction has no target regardless of synonym-group fixes; plurals fail separately because the phone synonym group (unlike every other group in the file) omits plural forms, and there is no stemming anywhere in the pipeline.
- **N-category logic**: confirmed already general-by-construction; not the cause of anything observed.
- **Guards**: confirmed absent (main-branch state); their exact prior failure mode was reproduced live this session (a legitimate 2-item phone pool lost one member to a single nondeterministic Groq veto).

## Proposal list (priority order)
1. Re-instate LLM filter guards (tiny-pool skip + top-scorer protection) — lowest risk, previously validated, addresses nondeterminism independent of the other fixes.
2. Fix plural/typo normalization (synonym-group plurals + broadened fuzzy-correction vocabulary + general suffix stemming) — root cause of 3 of 4 symptoms.
3. De-weight quality signals in the search path only (`qualitySignalScale: 0.25`, search-owned, recommendation weights untouched) — directly fixes the ranking symptom.
4. Relax the semantic floor for anchored near-ties — fixes the bare "phone" admission gap specifically; highest risk, recommend isolating and verifying independently.
5. N-category ambiguity — no change; confirmed already correct.

Awaiting approval before any implementation.
