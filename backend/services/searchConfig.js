/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Search Config  (backend/services/searchConfig.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Holds ONLY genuinely LINGUISTIC facts — things no database could ever tell
 * you on its own, because they're about how people talk, not what's in stock.
 * The generic searchEngine.js reads this for linguistic facts only; all
 * inventory facts come from the live database via the adapter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

module.exports = {

  // ── Synonym groups ──────────────────────────────────────────────────────────
  // ONLY genuinely unambiguous synonyms. Each word in a group must mean the SAME
  // thing in all common contexts.
  synonymGroups: [
    ['mobile', 'phone', 'smartphone', 'cellphone'],
    ['pc', 'computer', 'computers', 'laptop', 'laptops', 'desktop'],
    ['tablet', 'tablets', 'ipad'],
    ['headphone', 'headphones', 'earphone', 'earphones', 'earbud', 'earbuds', 'headset'],
    ['fridge', 'refrigerator'],
    ['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear'],
    ['clothes', 'clothing', 'apparel', 'garments', 'outfit', 'wear'],
    ['tshirt', 't-shirt'],
    ['trouser', 'trousers'],
    ['charger', 'adapter', 'adaptor'],
    ['smartwatch', 'wristwatch'],
    ['backpack', 'handbag'],
    ['power bank', 'powerbank'],
    ['bicycle', 'cycle'],
    ['waterproof', 'water resistant', 'water-resistant'],
  ],

  // ── Abbreviation expansion (linguistic facts only) ──────────────────────────
  // ENGLISH-LANGUAGE equivalences only — an abbreviation standing for its full
  // phrase, never a product/category mapping (that lives in the catalog, not
  // here). Unlike synonymGroups (a symmetric set of interchangeable words),
  // each entry here is ONE-DIRECTIONAL: "ac" expands to "air conditioner", but
  // searching "air conditioner" does not rewrite itself back to "ac".
  abbreviations: {
    pc:  'computer',
    tv:  'television',
    ac:  'air conditioner',
    cam: 'camera',
  },

  // ── Spell corrections (brand-name overrides only) ───────────────────────────
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
    textMatch:   50,
    budgetMatch: 25,
    colorMatch:  15,
    semantic:    40,
    intentMatch: 20,
  },

  // ── Text search: field contribution to textMatch score ──────────────────────
  fieldWeights: {
    name:        1.0,
    category:    0.8,
    description: 0.4,
  },

  // ── Budget tolerance ────────────────────────────────────────────────────────
  budgetOvershootTolerance: 0.10,

  // ── Semantic search: RELATIVE (adaptive) cutoff (bge-small-en-v1.5) ──────────
  // Different categories score on different scales — a query's top match is
  // ~0.61 for "laptops", ~0.67 for "toys", ~0.77 for "home decor", but only
  // ~0.54 for "clothes"/"skincare". No single ABSOLUTE threshold fits all: set
  // it high and real clothing/beauty get dropped; set it low and strong queries
  // pull in noise. So searchEngine.js uses a RELATIVE cutoff computed per query
  // (see runSearch step 4): keep a product only if it is BOTH above the FLOOR
  // and within the MARGIN of THIS query's top score. This is category-general
  // and future-proof — it adapts to whatever products exist, no per-category
  // tuning. All three numbers were measured with scripts/testSemantic.js.

  // semanticThreshold — pre-filter the adapter applies when BUILDING the score
  // map (computeSemanticScores). Kept LOW so the engine's relative cutoff can
  // see the full distribution. Not the real cutoff — the floor/margin below are.
  semanticThreshold: 0.45,

  // semanticFloor — the absolute minimum for a meaning-only match. This is the
  // line that separates a weak-but-REAL category (skincare tops 0.537) from a
  // query with NO real answer (diamond ring / "something to read" top 0.468).
  // 0.50 sits between them: real weak categories show, true noise → honest zero.
  semanticFloor: 0.50,

  // semanticTopMargin — keep products within this of THIS query's top semantic
  // score. Finds the gap between real matches and noise wherever it sits, per
  // query. 0.09 keeps all 7 laptops for "laptops" (top 0.613 → cut 0.523) while
  // dropping the study lamp (0.512) and notebook (0.498).
  semanticTopMargin: 0.09,

  // ── Result limits ───────────────────────────────────────────────────────────
  defaultLimit:    20,
  maxLimit:        40,
  zeroResultLimit: 8,
};