/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Search Config  (backend/services/searchConfig.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Holds ONLY genuinely LINGUISTIC facts — things no database could ever tell
 * you on its own, because they're about how people talk, not what's in stock:
 *   • Synonyms          — "mobile" and "phone" are the same concept; the
 *                          catalog has no way to know that two different
 *                          words mean the same thing.
 *   • Colors             — a fixed, genuinely finite list of real-world colors.
 *   • Budget/premium keywords — "cheap", "premium" signal price intent.
 *   • Purpose hints      — "for programming" implies certain product traits.
 *   • Scoring weights    — how much each signal contributes to ranking.
 *
 * WHAT IS DELIBERATELY *NOT* HERE ANYMORE
 *   There used to be a `categoryMap` (word → category) and a long list of
 *   common-noun spell corrections (e.g. "labtop" → "laptop") here. Both were
 *   removed because they made the search CATALOG-BLIND: a typo or product
 *   word that wasn't manually added to this file could never be found or
 *   corrected, no matter how good the algorithm was — even if a real,
 *   correctly-spelled product existed in the database. Category resolution
 *   and spell-correction vocabulary are now both derived LIVE from whatever
 *   products actually exist (see searchEngine.js: buildCatalogVocabulary,
 *   deriveCategoryFromMatches). This means a brand-new product — added by a
 *   teacher in a live demo, with a name nobody anticipated — is immediately
 *   searchable and typo-correctable with zero changes to this file.
 *
 * The generic searchEngine.js reads this for linguistic facts only; all
 * inventory facts come from the live database via the adapter. To reuse the
 * engine for another project: write a new searchConfig.js (linguistic facts
 * for your domain/language) and a new adapter — searchEngine.js is unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 */

module.exports = {

  // ── Synonym groups ──────────────────────────────────────────────────────────
  // ONLY genuinely unambiguous synonyms belong here. A synonym is safe only if
  // every word in the group means the SAME thing in all common contexts.
  //
  // Deliberately REMOVED (and why) — these caused real bugs because one word
  // had two unrelated meanings, so expanding the query pulled in wrong products:
  //   • laptop↔notebook  — "notebook" is also paper stationery → "laptop"
  //                         search wrongly matched paper notebooks
  //   • tablet↔tab        — "tab" is a substring of many unrelated words
  //   • shirt↔top         — "top" matches "laptop", "tabletop", etc.
  //   • camera↔cam        — "cam" is too short / substring-prone
  //   • laptop↔pc         — "pc" is a substring-prone 2-letter token
  //   • cycle↔bike        — kept cycle/bicycle, dropped "bike" (ambiguous with
  //                         motorbike/automotive)
  // The proper resolution of meaning-level ambiguity ("laptop" vs paper
  // "notebook") is Phase 2 semantic embeddings; until then we simply don't
  // assert risky synonym equivalences that we can't disambiguate by rules.
  synonymGroups: [
    ['mobile', 'phone', 'smartphone', 'cellphone'],
    ['headphone', 'headphones', 'earphone', 'earphones', 'earbud', 'earbuds', 'headset'],
    ['fridge', 'refrigerator'],
    ['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear'],
    ['tshirt', 't-shirt'],
    ['trouser', 'trousers'],
    ['charger', 'adapter', 'adaptor'],
    ['smartwatch', 'wristwatch'],
    ['backpack', 'handbag'],
    ['power bank', 'powerbank'],
    ['bicycle', 'cycle'],
    ['waterproof', 'water resistant', 'water-resistant'],
  ],

  // ── Spell corrections (brand-name overrides only) ───────────────────────────
  // Exact overrides for BRAND names specifically — brand spelling shouldn't
  // be left to fuzzy matching, because a brand name isn't a generic English
  // word the catalog vocabulary would naturally contain at high frequency,
  // and getting it wrong (matching "appel" to some unrelated catalog word)
  // would be worse than not correcting it at all. This list is short and
  // genuinely brand-specific — it is NOT where product-noun typos go
  // anymore; those are handled generally by the catalog-derived fuzzy
  // matcher in searchEngine.js, which works on ANY product word automatically.
  spellCorrections: {
    'samsng':   'samsung',
    'samsnug':  'samsung',
    'sasmung':  'samsung',
    'smasung':  'samsung',
    'appel':    'apple',
    'aple':     'apple',
    'iphoen':   'iphone',
    'iphne':    'iphone',
    'xiaomii':  'xiaomi',
    'raalme':   'realme',
    'onplus':   'oneplus',
    'one plus': 'oneplus',
    'nikey':    'nike',
    'nkie':     'nike',
    'addidas':  'adidas',
    'adiddas':  'adidas',
    'soney':    'sony',
    'philps':   'philips',
  },

  // ── Colors ─────────────────────────────────────────────────────────────────
  // A genuinely finite, real-world list — colors don't grow because a new
  // product is added, so this is safe to keep as a static list.
  colors: [
    'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple',
    'pink', 'grey', 'gray', 'brown', 'gold', 'silver', 'navy', 'maroon',
    'beige', 'cream', 'cyan', 'magenta', 'violet', 'indigo', 'teal',
  ],

  // ── Budget / price intent keywords ─────────────────────────────────────────
  budgetKeywords: {
    cheap:       0.15,
    budget:      0.25,
    affordable:  0.30,
    sasto:       0.25,   // Nepali for "cheap"
    low:         0.20,
    inexpensive: 0.25,
  },

  // ── Quality intent keywords ────────────────────────────────────────────────
  premiumKeywords: ['best', 'premium', 'top', 'high end', 'high-end', 'expensive', 'luxury', 'professional', 'pro'],

  // ── Purpose / use-case intent → search hints ───────────────────────────────
  // Linguistic mappings from "what the user is trying to do" to relevant
  // query traits. These describe USER INTENT vocabulary, not product
  // inventory, so they stay config-driven.
  purposeHints: {
    'gaming':      { keywords: ['gaming', 'game', 'pubg', 'fps'] },
    'programming': { keywords: ['programming', 'coding', 'developer', 'ram', 'processor'] },
    'photography': { keywords: ['camera', 'photo', 'dslr', 'mirrorless', 'lens'] },
    'walking':     { keywords: ['walking', 'comfortable', 'cushion', 'sole'] },
    'running':     { keywords: ['running', 'jogging', 'sport', 'athletic'] },
    'office':      { keywords: ['office', 'work', 'productivity', 'business'] },
    'student':     { keywords: ['student', 'study', 'school', 'college', 'class'] },
    'trekking':    { keywords: ['trek', 'hiking', 'outdoor', 'trail'] },
    'gift':        { keywords: ['gift', 'present', 'surprise'] },
    'cooking':     { keywords: ['cook', 'kitchen', 'recipe', 'chef'] },
    'baby':        { keywords: ['baby', 'infant', 'toddler', 'newborn'] },
    'durability':  { keywords: ['waterproof', 'water resistant', 'shockproof', 'rugged', 'durable'] },
    'wireless':    { keywords: ['wireless', 'bluetooth', 'cordless'] },
  },

  // ── Scoring weights for the search ranking pipeline ─────────────────────────
  searchWeights: {
    textMatch:   50,   // name/description/category contains query terms  (Phase 1)
    budgetMatch: 25,   // price is within the extracted budget             (Phase 1)
    colorMatch:  15,   // product name/desc mentions the color             (Phase 1)
    semantic:    40,   // cosine similarity to query embedding             (Phase 2)
    intentMatch: 20,   // Gemini-extracted intent fields match             (Phase 3)
  },

  // ── Text search: how much each field contributes to textMatch score ─────────
  fieldWeights: {
    name:        1.0,
    category:    0.8,
    description: 0.4,
  },

  // ── Budget tolerance ────────────────────────────────────────────────────────
  budgetOvershootTolerance: 0.10,

  // ── Semantic search thresholds (Phase 2 — calibrated for bge-small-en-v1.5) ──
  // BGE compresses cosine scores into a high band. Measured behaviour:
  //   • query WITH a real match  → top scores ~0.60–0.66 (laptop, water bottle)
  //   • query with NO real match → everything plateaus ~0.47 (diamond ring, and
  //     "something to read" since blank notebooks aren't really reading material)
  // So the honest dividing line sits ABOVE that ~0.47 noise plateau.
  //
  // semanticThreshold — floor for a product to count as related, and the bar for
  // semantic rescue when a query had NO literal match. 0.52 keeps the water
  // bottle (0.635) while giving honest zero-results for diamond-ring-type noise.
  semanticThreshold: 0.52,

  // semanticRescueThreshold — higher bar to ADD a meaning-only match when literal
  // matches already exist. 0.58 pulls in all five laptops (incl. Asus at 0.608,
  // with "laptop" removed from its text) while excluding the notebook (0.557).
  semanticRescueThreshold: 0.58,

  // ── Result limits ───────────────────────────────────────────────────────────
  defaultLimit:    20,
  maxLimit:        40,
  zeroResultLimit: 8,
};