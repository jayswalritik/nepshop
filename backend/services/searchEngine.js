/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Search Engine  (backend/services/searchEngine.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic, modular, CATALOG-DRIVEN search pipeline.
 *
 * This version fixes two root-cause bugs found in testing:
 *
 *   BUG 1 — Over-aggressive spell-correction destroyed valid words
 *     ("shoes"→"short", "watch"→"catch", "under"→"rider", "2000"→"200").
 *     Fixes: (a) fuzzy targets are built from NAME + CATEGORY only, never
 *     description prose; (b) distance tightened to 1 for short words, 2 only
 *     for long (>=7) words; (c) stopwords, config words (colors / budget /
 *     premium / purpose / synonyms) and pure numbers are never corrected;
 *     (d) a token that already appears in the catalog (as a whole word OR a
 *     substring of a catalog word) is left alone.
 *
 *   BUG 2 — Semantic search never saw the products it was meant to rescue
 *     The old code did `pool = termMatches` (literal matches only) BEFORE
 *     applying semantic scores, so a laptop whose NAME lacks "laptop"
 *     (MacBook, Zenbook…) was dropped before semantics could surface it.
 *     Fix: the search pool is now the UNION of literal matches and strong
 *     semantic matches, so meaning-based results are included while literal
 *     matches still rank first.
 *
 * Everything else about the catalog-driven philosophy is unchanged: category
 * and vocabulary are derived from live product data, not static maps.
 * searchConfig.js still supplies only linguistic facts (synonyms, colors,
 * budget/premium keywords, weights).
 *
 * EXPORTS
 *   buildCatalogVocabulary(candidates) → name/category vocabulary (freq map)
 *   parseQuery(rawQuery, config, vocabulary) → structured intent object
 *   runSearch(candidates, rawQuery, config, options) → { results, understanding }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { scoreProduct } = require('./recommendationEngine');

// Optional English dictionary — used ONLY to avoid "correcting" a valid English
// word into a nearby catalog word (e.g. "read"→"red", "hike"→"nike",
// "gamer"→"games"). Real typos ("lapto", "waterbotle", "samsng") aren't in the
// dictionary, so they still get corrected. If the package isn't installed,
// spell-correction still runs — just without this safety net.
//   npm install an-array-of-english-words
let ENGLISH_WORDS = null;
try {
  ENGLISH_WORDS = new Set(require('an-array-of-english-words'));
} catch (e) {
  ENGLISH_WORDS = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// effectivePrice — price the customer actually pays (after % discount).
// ─────────────────────────────────────────────────────────────────────────────
const effectivePrice = (product) => {
  const base = product.price || 0;
  const discount = product.discount || 0;
  if (discount > 0) return Math.round(base - (base * discount / 100));
  return base;
};

// ─────────────────────────────────────────────────────────────────────────────
// normalizeText
// ─────────────────────────────────────────────────────────────────────────────
const normalizeText = (text) =>
  (text || '').toLowerCase().trim().replace(/\s+/g, ' ');

// ─────────────────────────────────────────────────────────────────────────────
// stemCandidates — [Task: search-relevance] light, GENERAL inflectional-suffix
// stripping (plurals, past tense) — never a per-word list. Returns the word
// itself plus any stemmed variant(s), so callers can compare candidate sets
// instead of raw strings. Deliberately conservative:
//   • words under 5 chars are returned unchanged (too short to safely strip
//     anything without mangling unrelated short words — "gas"/"bed"/"red").
//   • "-es" is only stripped after s/x/z/ch/sh (box*es*, watch*es*) — a bare
//     "-s" after other letters is stripped by the plain rule below instead.
//   • "-ies" -> "-y" ("categor*ies*" -> "category").
//   • a trailing "s" is stripped UNLESS the word ends "ss" (so "glass"/
//     "class" are never touched by the plain rule; genuine "-ses"/"-ses"
//     plurals like "glasses" are still caught by the -es rule above).
//   • "-ed" is ambiguous in English (silent-e verbs drop the e before -ed,
//     regular verbs don't), so BOTH candidates are added: "phon*ed*" ->
//     "phone" (drop just the "d") AND "jump*ed*" -> "jump" (drop "ed").
// This is symmetric — the same function stems both the QUERY term and each
// PRODUCT word, so "phones" (query) ~ "phone" (product) and "phoned"
// (query) ~ "phone" (product) match in either direction without any
// phone-specific code.
// ─────────────────────────────────────────────────────────────────────────────
const stemCandidates = (word) => {
  const candidates = new Set([word]);
  if (word.length < 5) return [...candidates];

  if (/[^aeiou]ies$/.test(word)) {
    candidates.add(word.slice(0, -3) + 'y');
  } else if (/([sxz]|[cs]h)es$/.test(word)) {
    candidates.add(word.slice(0, -2));
  } else if (word.endsWith('s') && !word.endsWith('ss')) {
    candidates.add(word.slice(0, -1));
  }

  if (word.endsWith('ed')) {
    candidates.add(word.slice(0, -1)); // silent-e verbs: "phoned" -> "phone"
    candidates.add(word.slice(0, -2)); // regular verbs: "jumped" -> "jump"
  }

  return [...candidates];
};

// ─────────────────────────────────────────────────────────────────────────────
// wordMatch
// ─────────────────────────────────────────────────────────────────────────────
// Whole-word (with light plural tolerance) matching — replaces raw substring
// `.includes()`. A term matches a haystack if any WORD in the haystack equals
// the term, or begins with it by at most 2 extra letters (so "headphone" still
// matches "headphones", but "ring" no longer matches inside "touring" and
// "charge" no longer matches inside "rechargeable") — OR if the term's and
// the word's stemCandidates (above) overlap, catching the reverse direction
// (a longer/inflected QUERY term matching a shorter/base PRODUCT word, e.g.
// "phones"/"phoned" matching "phone") that the prefix-tolerance rule alone
// can't reach.
// ─────────────────────────────────────────────────────────────────────────────
const wordMatch = (haystack, term) => {
  if (!term) return false;

  // A multi-word term ("air conditioner") needs the WHOLE PHRASE present,
  // not just one of its words independently — otherwise a generic word that
  // happens to be part of the phrase ("air") would strong-match completely
  // unrelated products using it in another sense ("Nike Air Jordan"). Phrase-
  // boundary match, same technique already used by extractPurpose/
  // matchesKeyword below for phrase keywords.
  if (term.includes(' ')) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
  }

  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  const termStems = stemCandidates(term);
  for (const w of words) {
    if (w === term) return true;
    // Prefix/plural tolerance (+2 extra letters) only makes sense once the
    // term is long enough that 2 letters is a small fraction of it — for a
    // 2-char term it would swallow unrelated words that merely start with
    // the same 2 letters ("ac" ~ "Acer", "tv" ~ "TVs"). Short terms require
    // an exact whole-word match instead.
    if (term.length >= 3 && w.startsWith(term) && (w.length - term.length) <= 2) return true;
    // [Task: search-relevance] General stemming match (see stemCandidates).
    if (termStems.length > 1 || w.length >= 5) {
      const wordStems = stemCandidates(w);
      if (termStems.some(ts => wordStems.includes(ts))) return true;
    }
  }
  return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// levenshteinDistance — standard edit distance.
// ─────────────────────────────────────────────────────────────────────────────
const levenshteinDistance = (a, b) => {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
};

// ─────────────────────────────────────────────────────────────────────────────
// STOPWORDS — generic English filler; never product terms or fuzzy targets.
// ─────────────────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'for', 'with', 'and', 'or',
  'in', 'on', 'at', 'to', 'of', 'i', 'me', 'my', 'need', 'want', 'looking',
  'find', 'show', 'buy', 'get', 'good', 'best', 'nice', 'please', 'some',
  'any', 'this', 'that', 'under', 'below', 'above', 'over', 'within', 'upto',
  'up', 'less', 'than', 'max', 'budget', 'rs', 'rupees', 'price',
  // extra generic words that show up in natural-language queries and must
  // never be "corrected" into a random product word:
  'something', 'thing', 'things', 'stuff', 'keep', 'make', 'help', 'use',
  'using', 'about', 'from', 'into', 'your', 'you', 'can', 'will', 'would',
  'like', 'me', 'so', 'it', 'its',
]);

// ─────────────────────────────────────────────────────────────────────────────
// buildCatalogVocabulary
// ─────────────────────────────────────────────────────────────────────────────
// Builds the spell-correction target vocabulary from live product data — but
// from NAME + CATEGORY ONLY (not description). Product nouns live in names and
// categories; descriptions are prose full of words like "check", "catch",
// "rider", "bold" that made terrible correction targets in the old version.
// Restricting to name+category is the single biggest precision fix.
//
// Returns Map<word, productCount>; frequency is used as a fuzzy-match
// tie-breaker (a word in many products is a more likely intended correction).
// ─────────────────────────────────────────────────────────────────────────────
const buildCatalogVocabulary = (candidates) => {
  const freq = new Map();

  for (const product of candidates) {
    const text = normalizeText(`${product.name} ${product.category}`); // name + category only
    const words = text.split(/\s+/).filter(Boolean);
    const uniqueWords = new Set(words);
    for (const w of uniqueWords) {
      // Fine to skip <3-char words here: this vocabulary only feeds
      // fuzzyCorrectToken, which already refuses targets under 4 chars, so a
      // short word could never be picked as a correction target anyway.
      // Literal product-term matching (wordMatch) reads product text
      // directly and doesn't go through this map, so short terms like "pc"/
      // "tv" still match real product names/categories fine.
      if (w.length < 3) continue;
      if (STOPWORDS.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }

  return freq;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildProtectedWords
// ─────────────────────────────────────────────────────────────────────────────
// Words that must NEVER be fuzzy-corrected because they're valid query
// vocabulary the system already understands: stopwords plus every config word
// (colors, budget keywords, premium keywords, purpose keywords, synonyms).
// This is why "cheap" no longer becomes "check" and "black" stays "black".
// ─────────────────────────────────────────────────────────────────────────────
const buildProtectedWords = (config) => {
  const s = new Set(STOPWORDS);
  const add = (w) => { if (w) w.split(/\s+/).forEach(x => s.add(x)); };

  (config.colors || []).forEach(add);
  Object.keys(config.budgetKeywords || {}).forEach(add);
  (config.premiumKeywords || []).forEach(add);
  Object.values(config.purposeHints || {}).forEach(h => (h.keywords || []).forEach(add));
  (config.synonymGroups || []).forEach(g => g.forEach(add));

  return s;
};

// ─────────────────────────────────────────────────────────────────────────────
// fuzzyCorrectToken
// ─────────────────────────────────────────────────────────────────────────────
// Conservative typo correction against the name/category vocabulary.
// Guards (all added to stop valid words being mangled):
//   • skip tokens < 4 chars
//   • skip tokens that ARE a catalog word, or a substring of one (already valid)
//   • distance budget: 1 for tokens < 7 chars, 2 for >= 7 chars
//   • length difference must also be within that budget
//   • ties broken by higher catalog frequency (more "real" word wins)
// ─────────────────────────────────────────────────────────────────────────────
const fuzzyCorrectToken = (token, vocabularyFreq, options = {}) => {
  // Minimum length 5: at 4 chars, edit-distance-1 collisions between ordinary
  // English words and product names are rampant ("hike"→"nike", "read"→"red",
  // "cold"→"gold"). Requiring 5+ chars eliminates that whole class of damage
  // while still catching real product-noun typos ("botle"→"bottle",
  // "aptop"→"laptop"), which are almost always longer.
  if (token.length < 5) return null;
  if (vocabularyFreq.has(token)) return null;                 // already an exact catalog word

  const maxDistance = token.length >= 7 ? 2 : 1; // tight: no distance-2 on short words

  let best = null;
  let bestDist = Infinity;
  let bestFreq = 0;

  for (const [word, freq] of vocabularyFreq.entries()) {
    if (word.length < 4) continue; // never correct toward a very short word ("red", "gum")
    if (Math.abs(word.length - token.length) > maxDistance) continue;

    // Adjacent transposition ("lapotp"→"laptop") counts as ONE edit — plain
    // Levenshtein scores it 2, which put common swap-typos out of budget.
    let dist = levenshteinDistance(token, word);
    if (dist === 2 && word.length === token.length) {
      let i = 0;
      while (i < token.length && token[i] === word[i]) i++;
      if (i < token.length - 1 &&
          token[i] === word[i + 1] && token[i + 1] === word[i] &&
          token.slice(i + 2) === word.slice(i + 2)) {
        dist = 1;
      }
    }
    if (dist === 0 || dist > maxDistance) continue;

    if (dist < bestDist || (dist === bestDist && freq > bestFreq)) {
      bestDist = dist;
      best = word;
      bestFreq = freq;
    }
  }

  if (!best) return null;

  // [Task: search-relevance] a valid English word is normally left alone —
  // not a typo (e.g. "read" must never become "red"). Moved to AFTER the
  // match search (rather than an early bailout on the input token) so it can
  // be bypassed in ONE narrow case: the best match is a curated SYNONYM-GROUP
  // word (options.synonymWords — a small, deliberately-chosen set of product-
  // concept canonical terms, not the whole catalog). A near-miss against one
  // of those is much more likely to be an intentional shopping typo than an
  // incidental English-word collision — e.g. "mobie" is itself, surprisingly,
  // a recognized dictionary word, which would otherwise permanently block it
  // from ever correcting to "mobile" no matter how the catalog/synonyms are
  // configured. Every OTHER English word (not a synonym-group match) keeps
  // the original protection unchanged.
  const bypassGuard = options.synonymWords && options.synonymWords.has(best);
  if (!bypassGuard && ENGLISH_WORDS && ENGLISH_WORDS.has(token)) return null;

  return best;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildSynonymVocabulary — [Task: search-relevance] every word across every
// synonymGroups entry, as a Map<word, freq> in the same shape
// buildCatalogVocabulary produces, so fuzzyCorrectToken can correct a typo
// TOWARD a synonym-group word even when no product's name/category literally
// contains it (e.g. "monile"/"mobie" -> "mobile", even though the catalog
// only ever spells it "iPhone"/"Galaxy"). Frequency is a flat 1 for every
// word — there's no real "popularity" signal for a linguistic-only entry;
// it's only used as a last-resort tie-breaker in fuzzyCorrectToken.
// ─────────────────────────────────────────────────────────────────────────────
const buildSynonymVocabulary = (synonymGroups) => {
  const freq = new Map();
  for (const group of (synonymGroups || [])) {
    for (const phrase of group) {
      for (const w of phrase.split(/\s+/)) {
        if (w.length < 3) continue;
        freq.set(w, Math.max(freq.get(w) || 0, 1));
      }
    }
  }
  return freq;
};

// ─────────────────────────────────────────────────────────────────────────────
// spellCorrect
// ─────────────────────────────────────────────────────────────────────────────
//   1. Brand-name overrides (exact, curated) from config.
//   2. Conservative fuzzy correction — skipping protected words and numbers.
// ─────────────────────────────────────────────────────────────────────────────
const spellCorrect = (normalized, config, catalogVocabulary) => {
  const made = [];
  let corrected = normalized;

  // 1) Brand overrides
  const overrides = config.spellCorrections || {};
  const entries = Object.entries(overrides).sort((a, b) => b[0].length - a[0].length);
  for (const [wrong, right] of entries) {
    if (corrected.includes(wrong)) {
      corrected = corrected.split(wrong).join(right);
      if (wrong !== right) made.push({ from: wrong, to: right });
    }
  }

  // 2) Conservative fuzzy correction
  // [Task: search-relevance] correction target set = catalog vocabulary
  // (name/category text) UNION synonym-group canonical words — see
  // buildSynonymVocabulary. fuzzyCorrectToken itself is unchanged; only the
  // vocabulary it searches within grows.
  const synonymVocab = buildSynonymVocabulary(config.synonymGroups);
  const vocab = new Map(catalogVocabulary || new Map());
  for (const [w, f] of synonymVocab) {
    vocab.set(w, Math.max(vocab.get(w) || 0, f));
  }
  const protectedWords = buildProtectedWords(config);
  const tokens = corrected.split(' ');

  const fixedTokens = tokens.map(token => {
    if (!token) return token;
    if (protectedWords.has(token)) return token;   // valid query vocabulary
    if (/^\d[\d,]*$/.test(token))   return token;   // pure numbers (budget, sizes)
    const fix = fuzzyCorrectToken(token, vocab, { synonymWords: synonymVocab });
    if (fix) {
      made.push({ from: token, to: fix });
      return fix;
    }
    return token;
  });

  corrected = fixedTokens.join(' ');
  return { corrected, corrections: made };
};

// ─────────────────────────────────────────────────────────────────────────────
// expandSynonyms — config-driven (linguistic), unchanged.
// ─────────────────────────────────────────────────────────────────────────────
const expandSynonyms = (tokens, synonymGroups) => {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const group of synonymGroups) {
      if (group.includes(token)) {
        group.forEach(t => expanded.add(t));
        break;
      }
    }
  }
  return [...expanded];
};

// ─────────────────────────────────────────────────────────────────────────────
// expandAbbreviations — config-driven (linguistic), ONE-DIRECTIONAL: each
// abbreviation token is REPLACED by its full phrase (kept as a single
// element even when multi-word — see wordMatch's phrase-boundary handling),
// never appended alongside the original short form. Replacing (not
// appending) avoids two problems appending would cause: (a) the short
// form's own literal-match quirks ("ac" still floating around as its own
// 2-char term), and (b) an expansion that happens to also be a purpose-hint
// keyword (e.g. "camera" is both cam's expansion AND a photography purpose
// keyword) confusing parseQuery's purpose-word-stripping step, which only
// keeps a purpose word in the literal-match gate when stripping it would
// otherwise empty the set — a second surviving term (the short form) would
// wrongly let it be stripped.
//
// Returns the replaced token list (used for BOTH literal-match expansion via
// expandSynonyms below AND the embedding/rescue query string — see
// parseQuery) plus which abbreviations actually fired, so the caller can
// tell whether the query changed at all.
// ─────────────────────────────────────────────────────────────────────────────
const expandAbbreviations = (tokens, abbreviations) => {
  const applied = []; // [{ from, to }] — only abbreviations that actually fired
  const replacedTokens = tokens.map(token => {
    const full = abbreviations[token];
    if (full) {
      applied.push({ from: token, to: full });
      return full;
    }
    return token;
  });
  return { replacedTokens, applied };
};

// ─────────────────────────────────────────────────────────────────────────────
// extractBudget — parses a price ceiling. Runs on ORIGINAL text (numbers and
// words like "under" must not have been touched by spell-correction).
// ─────────────────────────────────────────────────────────────────────────────
const extractBudget = (text) => {
  const kNorm = text.replace(/(\d+(\.\d+)?)\s*k\b/gi, (_, n) => String(parseFloat(n) * 1000));

  const patterns = [
    /(?:under|below|less\s+than|upto|up\s+to|within|max(?:imum)?|budget\s+of|rs\.?\s*)[\s:]*(\d[\d,]+)/i,
    /(\d[\d,]+)\s*(?:rs\.?|rupees?|budget|max)/i,
    /(?:budget|price)[\s:]+(?:rs\.?\s*)?(\d[\d,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = kNorm.match(pattern);
    if (match) {
      const raw = match[1].replace(/,/g, '');
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0 && n < 10_000_000) return n;
    }
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// extractColor
// ─────────────────────────────────────────────────────────────────────────────
const extractColor = (text, colorList) => {
  const tokens = text.split(/\s+/);
  return tokens.find(t => colorList.includes(t)) || null;
};

// ─────────────────────────────────────────────────────────────────────────────
// extractPurpose — whole-word / phrase-boundary matching.
// ─────────────────────────────────────────────────────────────────────────────
const extractPurpose = (text, purposeHints) => {
  const wordSet = new Set(text.split(/\s+/).filter(Boolean));
  const matches = (kw) => {
    if (kw.includes(' ')) {
      const re = new RegExp(`(^|\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      return re.test(text);
    }
    return wordSet.has(kw);
  };
  for (const [purpose, hint] of Object.entries(purposeHints)) {
    if (hint.keywords.some(matches)) return purpose;
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// extractProductTerms — meaningful product nouns (post stopword/color/number).
//
// A 2-char token the user actually TYPED ("pc", "tv", "ac") is a real product
// term and must survive (1-char tokens still don't). But a 2-char token that
// only appears because SYNONYM EXPANSION pulled in its group siblings must
// keep the old >=3 floor — otherwise querying "laptop" would quietly gain
// "pc" as an extra product term too (they share a synonym group), matching
// stray products a plain "laptop" search never used to and breaking today's
// results. So the floor is 2 for tokens present in the raw query, 3 for
// tokens that only exist because of expansion.
// ─────────────────────────────────────────────────────────────────────────────
const extractProductTerms = (tokens, expandedTokens, colorList) => {
  const rawTokenSet = new Set(tokens);
  const meaningful = expandedTokens.filter(t => {
    const minLength = rawTokenSet.has(t) ? 2 : 3;
    return t.length >= minLength &&
      !STOPWORDS.has(t) &&
      !colorList.includes(t) &&
      !/^\d+$/.test(t);
  });
  return meaningful;
};

// ─────────────────────────────────────────────────────────────────────────────
// parseQuery
// ─────────────────────────────────────────────────────────────────────────────
const parseQuery = (rawQuery, config, catalogVocabulary) => {
  const raw        = rawQuery || '';
  const normalized = normalizeText(raw);

  const { corrected, corrections: spellingFixes } =
    spellCorrect(normalized, config, catalogVocabulary);

  const tokens = corrected.split(/\s+/).filter(Boolean);

  // Abbreviation expansion runs BEFORE synonym expansion (a replaced word
  // could in principle also be caught by a synonym group), and — critically —
  // on `tokens`, which is already spell-corrected. Tracks which abbreviations
  // actually fired so callers can tell whether the query changed at all.
  const { replacedTokens, applied: abbreviationsApplied } =
    expandAbbreviations(tokens, config.abbreviations || {});
  const expandedTokens = expandSynonyms(replacedTokens, config.synonymGroups || []);

  // The single canonical query STRING for every stage that leaves this
  // parser: the main semantic embedding, the LLM rescue's understandQuery
  // call, and (transitively, since it's the rescue's own input) whatever the
  // rescue re-embeds. Spell-corrected THEN abbreviation-expanded —
  // `replacedTokens` is built from `tokens` (post spell-correction), so this
  // is always both, in that order, never just one.
  //
  // This used to fall back to the untouched RAW text whenever no
  // abbreviation fired, which silently discarded spell-correction for
  // everything downstream of the parser: "laptopp" corrected fine for
  // literal matching (intent.corrected = "laptop", shown correctly in the
  // UI's correction banner), but got EMBEDDED as "laptopp" — compressing its
  // semantic scores enough to fail the semCut corroboration gate for weak
  // (description-only) matches and silently drop real laptops. Always using
  // replacedTokens fixes this: when nothing was corrected or expanded,
  // replacedTokens is element-wise identical to the original tokens, so
  // untouched queries embed exactly as before (byte-for-byte unchanged).
  const expandedQuery = replacedTokens.join(' ');

  // Budget is parsed from the ORIGINAL text so a number like "2000" or a word
  // like "under" can never have been altered by spell-correction.
  const budget       = extractBudget(normalized);
  const color        = extractColor(corrected, config.colors || []);
  const purpose      = extractPurpose(corrected, config.purposeHints || {});
  const productTerms = extractProductTerms(tokens, expandedTokens, config.colors || []);

  // ── coreProductTerms (intent-refinement) ─────────────────────────────────────
  // Purpose keywords describe a USE-CASE ("gaming", "office", "running", "gift"),
  // not the product itself. They should BOOST relevance but must not, on their own,
  // pull in a product of the wrong kind (e.g. a "gaming" T-shirt for "gaming laptop").
  // So the literal-match GATE uses productTerms with purpose words removed — UNLESS
  // that would empty the set (the query was ONLY a purpose word, e.g. "gaming"), in
  // which case we keep them so the query still matches something.
  const purposeWords = new Set();
  for (const hint of Object.values(config.purposeHints || {})) {
    (hint.keywords || []).forEach(k => k.split(/\s+/).forEach(w => purposeWords.add(w)));
  }
  const strippedTerms = productTerms.filter(t => !purposeWords.has(t));
  const coreProductTerms = strippedTerms.length > 0 ? strippedTerms : productTerms;

  const tokenSet = new Set(tokens);
  const matchesKeyword = (kw) => {
    if (kw.includes(' ')) {
      const re = new RegExp(`(^|\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      return re.test(corrected);
    }
    return tokenSet.has(kw);
  };

  const isBudgetQuery  = !budget && Object.keys(config.budgetKeywords || {})
    .some(matchesKeyword);
  const isPremiumQuery = (config.premiumKeywords || [])
    .some(matchesKeyword);

  return {
    raw, normalized, corrected, spellingFixes,
    tokens, expandedTokens, expandedQuery, abbreviationsApplied,
    budget, color, purpose, productTerms, coreProductTerms,
    isBudgetQuery, isPremiumQuery,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// groupTermsBySynonym — partitions gate terms into "concept buckets".
// ─────────────────────────────────────────────────────────────────────────────
// Terms that are mutual synonyms of ONE word (members of the same
// config.synonymGroups entry) collapse into a single bucket — a product only
// ever needs to match ANY ONE phrasing to genuinely BE that thing (e.g.
// "shoes" expands to shoe/shoes/sneaker/sneakers/footwear: still one concept,
// one bucket). A term with no group membership — including a multi-word
// ATOMIC phrase from abbreviation expansion ("air conditioner"), which is
// never itself registered as a synonym-group member — is its own singleton
// bucket, because it represents an INDEPENDENT concept the query named on its
// own (e.g. a directly-typed "air conditioner" tokenizes to ["air",
// "conditioner"], neither of which shares a synonym group with the other:
// 2 buckets).
//
// This distinction is what partitionMatches below uses to demote a PARTIAL
// match without breaking every synonym-expanded single-concept query: a gate
// with only ONE bucket (however many literal terms it contains) can never
// trigger demotion — the same "mathematically unreachable" guarantee the
// single-TERM case had, generalized to single-BUCKET.
// ─────────────────────────────────────────────────────────────────────────────
const groupTermsBySynonym = (terms, synonymGroups) => {
  const buckets = [];
  const assigned = new Set();

  for (const term of terms) {
    if (assigned.has(term)) continue;
    const group = (synonymGroups || []).find(g => g.includes(term));
    const bucket = group ? terms.filter(t => group.includes(t)) : [term];
    bucket.forEach(t => assigned.add(t));
    buckets.push(bucket);
  }

  return buckets;
};

// ─────────────────────────────────────────────────────────────────────────────
// partitionMatches
// ─────────────────────────────────────────────────────────────────────────────
// Splits the pool by WHERE a product term was found, with PARTIAL-MATCH
// DEMOTION for multi-BUCKET gates (see groupTermsBySynonym just above):
//   • strong = the product's name/category wordMatches at least one term from
//     EVERY bucket (for a single-bucket gate — including an ordinary
//     single-term gate — this is just "matches that concept", via any of its
//     synonym phrasings: today's exact behavior). The product IS this thing,
//     always trusted, no corroboration.
//   • weak   = description-only match, OR — only possible when there are 2+
//     INDEPENDENT buckets — a name/category match on a PROPER SUBSET of the
//     buckets. A single shared word is not enough evidence the product IS
//     the multi-concept thing searched for (e.g. "air" alone in "Nike Air
//     Jordan" for the query "air conditioner" — bucket ["air"] matched,
//     bucket ["conditioner"] didn't), so a partial match is demoted into the
//     weak pool and must clear the SAME semantic corroboration (semCut) as a
//     bare description mention — no new/different threshold.
//     For a single-bucket gate this branch is mathematically unreachable
//     (a product can match at most all 1 bucket, never a "proper subset" of
//     1), so single-concept queries — including every synonym-expanded one
//     ("shoes", "pc", "gaming laptop under 200000") — are byte-identical to
//     before by construction, not just single literal-term ones.
// Returns { strong, weak, all }. `strong` alone is used for category
// derivation (deriveCategoryFromMatches), so demoting a partial match also
// means it no longer dilutes category dominance.
// ─────────────────────────────────────────────────────────────────────────────
const partitionMatches = (pool, productTerms, synonymGroups = []) => {
  if (!productTerms || productTerms.length === 0) {
    return { strong: [], weak: [], all: pool };
  }

  const buckets = groupTermsBySynonym(productTerms, synonymGroups);

  const strong = [];
  const weak = [];

  for (const p of pool) {
    const name     = normalizeText(p.name);
    const category = normalizeText(p.category);
    const desc     = normalizeText(p.description || '');

    const matchesBucket = (bucket) => bucket.some(t => wordMatch(name, t) || wordMatch(category, t));
    const matchedBucketCount = buckets.filter(matchesBucket).length;
    const inDesc = productTerms.some(t => wordMatch(desc, t));

    if (matchedBucketCount === buckets.length) {
      strong.push(p);
    } else if (matchedBucketCount > 0 || inDesc) {
      weak.push(p);
    }
  }

  return { strong, weak, all: [...strong, ...weak] };
};

// Backwards-compatible export: array of literal matches (strong preferred).
const findMatchingCandidates = (pool, productTerms) => {
  if (!productTerms || productTerms.length === 0) return pool;
  const { strong, weak } = partitionMatches(pool, productTerms);
  return strong.length > 0 ? [...strong, ...weak] : weak;
};

// ─────────────────────────────────────────────────────────────────────────────
// deriveCategoryFromMatches — most common category among real matches.
// ─────────────────────────────────────────────────────────────────────────────
const deriveCategoryFromMatches = (matchedProducts) => {
  if (!matchedProducts.length) return { category: null, categoryCounts: {} };

  const counts = {};
  for (const p of matchedProducts) {
    counts[p.category] = (counts[p.category] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topCategory, topCount] = sorted[0];

  const total = matchedProducts.length;
  const isDominant = topCount / total >= 0.6;

  return { category: isDominant ? topCategory : null, categoryCounts: counts };
};

// ─────────────────────────────────────────────────────────────────────────────
// textMatchScore
// ─────────────────────────────────────────────────────────────────────────────
const textMatchScore = (product, intent, config) => {
  const terms = intent.productTerms && intent.productTerms.length
    ? intent.productTerms
    : intent.expandedTokens;
  const fw = config.fieldWeights || { name: 1.0, category: 0.8, description: 0.4 };

  if (!terms.length) return 0;

  const productName     = normalizeText(product.name);
  const productCategory = normalizeText(product.category);
  const productDesc     = normalizeText(product.description || '');

  let totalScore = 0;
  let maxScore   = 0;

  for (const token of terms) {
    maxScore += fw.name + fw.category + fw.description;
    if (wordMatch(productName, token))     totalScore += fw.name;
    if (wordMatch(productCategory, token)) totalScore += fw.category;
    if (wordMatch(productDesc, token))     totalScore += fw.description;
  }

  return maxScore > 0 ? totalScore / maxScore : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// budgetScore / colorScore
// ─────────────────────────────────────────────────────────────────────────────
const budgetScore = (product, intent, config) => {
  if (!intent.budget) return 0.5;
  const price = effectivePrice(product);
  const tol   = config.budgetOvershootTolerance || 0.1;

  if (price <= intent.budget)             return 1.0;
  if (price <= intent.budget * (1 + tol)) return 0.5;
  if (price <= intent.budget * 1.5)       return 0.2;
  return 0;
};

const colorScore = (product, intent) => {
  if (!intent.color) return 0;
  const haystack = normalizeText(`${product.name} ${product.description || ''}`);
  return wordMatch(haystack, intent.color) ? 1.0 : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// scoreSearchResult
// ─────────────────────────────────────────────────────────────────────────────
const scoreSearchResult = (product, intent, config) => {
  const sw = config.searchWeights || {};

  const tMatch = textMatchScore(product, intent, config) * (sw.textMatch || 50);
  const bMatch = budgetScore(product, intent, config)    * (sw.budgetMatch || 25);
  const cMatch = colorScore(product, intent)             * (sw.colorMatch || 15);

  const searchBonus = tMatch + bMatch + cMatch;
  const finalScore  = (product._score || 0) + searchBonus;

  return {
    ...product,
    _score: Math.round(finalScore),
    // [Task: search-relevance] unrounded score, sort-only (never displayed) —
    // two items whose ROUNDED _score happens to coincide can still have a
    // real, if small, relevance difference that rounding would otherwise
    // hide, wrongly treating them as an exact tie for the _qualityRaw
    // tiebreaker (step 11) to decide instead. Sorting on the exact value
    // first means quality only ever tiebreaks a GENUINE tie.
    _scoreExact: finalScore,
    _searchParts: {
      base:      product._score || 0,
      textMatch: Math.round(tMatch),
      budget:    Math.round(bMatch),
      color:     Math.round(cMatch),
      semantic:  product._searchSemantic || 0,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// buildSearchReason
// ─────────────────────────────────────────────────────────────────────────────
const buildSearchReason = (product, intent, rank) => {
  if (rank > 4) return null;

  const parts  = product._searchParts || {};
  const bParts = product._scoreParts  || {};

  // If this product surfaced mainly through meaning (semantic) rather than a
  // literal word match, say so — it reads well in a demo.
  if ((parts.semantic || 0) > 0 && (parts.textMatch || 0) === 0) {
    return 'Related to your search';
  }

  const searchSignals = [
    { val: parts.textMatch || 0, label: () => {
        if (intent.purpose) return `Matches "${intent.purpose}" use case`;
        if (intent.color)   return `Found in ${intent.color}`;
        return 'Matches your search';
    }},
    { val: parts.budget || 0, label: () =>
        intent.budget ? `Within Rs ${intent.budget.toLocaleString()} budget` : 'Good value'
    },
    { val: parts.color || 0, label: () => `Available in ${intent.color}` },
  ];

  const topSearch = searchSignals.sort((a, b) => b.val - a.val)[0];

  const baseTotal   = Object.values(bParts).reduce((a, b) => a + b, 0);
  const searchTotal = (parts.textMatch || 0) + (parts.budget || 0) + (parts.color || 0);

  if (searchTotal > 0 && (searchTotal >= baseTotal * 0.3 || rank <= 2)) {
    return topSearch.label();
  }

  if (bParts.rating > 10) return product.rating >= 4.5 ? 'Highly rated' : 'Well rated';
  if (bParts.popularity > 10) return 'Popular choice';
  if (bParts.recency > 5) return 'New arrival';
  return 'Matches your search';
};

// ─────────────────────────────────────────────────────────────────────────────
// buildUnderstanding
// ─────────────────────────────────────────────────────────────────────────────
const buildUnderstanding = (intent, derivedCategory) => {
  const points = [];

  if (intent.spellingFixes.length) {
    const fixes = intent.spellingFixes.map(f => `"${f.from}" → "${f.to}"`).join(', ');
    points.push({ icon: '✏️', text: `Corrected spelling: ${fixes}` });
  }
  if (derivedCategory) {
    points.push({ icon: '📂', text: `Category: ${derivedCategory}` });
  }
  if (intent.budget) {
    points.push({ icon: '💰', text: `Budget: up to Rs ${intent.budget.toLocaleString()}` });
  }
  if (intent.color) {
    points.push({ icon: '🎨', text: `Color: ${intent.color}` });
  }
  if (intent.purpose) {
    points.push({ icon: '🎯', text: `Purpose: ${intent.purpose}` });
  }
  if (intent.isBudgetQuery && !intent.budget) {
    points.push({ icon: '💸', text: 'Showing budget-friendly options' });
  }
  if (intent.isPremiumQuery) {
    points.push({ icon: '⭐', text: 'Showing top-rated and premium options' });
  }

  if (!points.length) return null;

  return {
    query:          intent.corrected,
    originalQuery:  intent.raw,
    wasSpellFixed:  intent.spellingFixes.length > 0,
    points,
    chips: [
      derivedCategory && { type: 'category', label: derivedCategory, value: derivedCategory },
      intent.budget    && { type: 'budget',   label: `Under Rs ${intent.budget.toLocaleString()}`, value: intent.budget },
      intent.color     && { type: 'color',    label: intent.color,   value: intent.color },
      intent.purpose   && { type: 'purpose',  label: intent.purpose, value: intent.purpose },
    ].filter(Boolean),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// applyBudgetFilter
// ─────────────────────────────────────────────────────────────────────────────
const applyBudgetFilter = (pool, budget, tolerance = 0.1, allowFallback = true) => {
  if (!budget) return { pool, wasFiltered: false };

  const ceiling = budget * (1 + tolerance);
  const filtered = pool.filter(p => effectivePrice(p) <= ceiling);

  if (filtered.length > 0) return { pool: filtered, wasFiltered: true };
  if (!allowFallback)      return { pool: filtered, wasFiltered: true }; // honest zero
  return { pool, wasFiltered: false };
};

// ─────────────────────────────────────────────────────────────────────────────
// runSearch  (main entry point)
// ─────────────────────────────────────────────────────────────────────────────
const runSearch = (candidates, rawQuery, config, options = {}) => {
  const {
    limit = config.defaultLimit || 20,
    semanticScores = null,
    intentOverride = null,
    catalogVocabulary = null,
  } = options;

  const vocabulary = catalogVocabulary || buildCatalogVocabulary(candidates);

  // 1. Parse intent
  const baseIntent = parseQuery(rawQuery, config, vocabulary);
  const intent = intentOverride ? { ...baseIntent, ...intentOverride } : baseIntent;

  // 2. Active, in-stock only
  const activePool = candidates.filter(p => p.isActive !== false && p.stock > 0);

  // Use coreProductTerms (purpose words stripped, unless that empties them) as
  // the literal-match gate, so a use-case word can't solely pull in a wrong-kind
  // product. Falls back to productTerms when only purpose words were present.
  const gateTerms = intent.coreProductTerms && intent.coreProductTerms.length
    ? intent.coreProductTerms
    : intent.productTerms;
  const hasProductTerms = gateTerms.length > 0;

  // 3. Literal matches: strong = name/category (the product IS this thing —
  // always trusted), weak = description-only or a partial multi-concept
  // match (kept below, once corroborated). synonymGroups lets partitionMatches
  // tell "independent concepts" (demotable) apart from "one concept, several
  // synonym phrasings" (never demoted) — see groupTermsBySynonym.
  const { strong, weak } = partitionMatches(activePool, gateTerms, config.synonymGroups || []);
  const strongIds = new Set(strong.map(p => p._id?.toString()));

  // 4. Semantic matches — RELATIVE (adaptive) cutoff.
  // Consider the whole active pool (not just literal matches). Different
  // categories score on different scales (a "laptop" tops ~0.61, "clothes"
  // ~0.55, "toy" ~0.67), so a single absolute threshold either drops real
  // matches in weak categories or lets noise in for strong ones. Instead we
  // read EACH query's own distribution: the genuinely-relevant items cluster
  // near the top score, then there's a gap, then noise. So we keep a product
  // only if it is BOTH:
  //   (a) above a low absolute FLOOR (semanticFloor) — this preserves honest
  //       zero-results for queries with no real match ("diamond ring"), and
  //   (b) within a MARGIN of THIS query's top semantic score (semanticTopMargin)
  //       — this finds the gap wherever it sits, per query, per category.
  // This is category-general and future-proof: it adapts to whatever products
  // exist, with no per-category tuning.
  const semFloor  = config.semanticFloor      != null ? config.semanticFloor      : 0.45;
  const semMargin = config.semanticTopMargin  != null ? config.semanticTopMargin  : 0.09;

  // Highest semantic score for THIS query across the active pool.
  let topSem = 0;
  if (semanticScores) {
    for (const p of activePool) {
      const s = semanticScores[p._id?.toString()] || 0;
      if (s > topSem) topSem = s;
    }
  }
  // A product is "semantically relevant" if it clears the floor AND is within
  // the margin of this query's best match.
  //
  // [Task: search-relevance] semanticFloorDelta near-miss relax. semanticFloor
  // itself is NEVER lowered — semCutFloor is a small, fixed shave off the
  // floor used ONLY for this admission check, so a genuine near-tie sibling
  // of the top score (e.g. "iPhone 16" at 0.4939 vs a 0.50 floor for "phone")
  // isn't excluded by a few thousandths while still comfortably above true
  // noise. Still gated by the SAME relative margin as before — this never
  // widens the window beyond topSem - semMargin, it only softens the
  // absolute floor side of the max(). See searchConfig.js for the derivation.
  //
  // [Task: search-tuning] ANCHOR-GATED. The branch-vs-main comparison
  // (docs/search-branch-comparison.md) showed the un-gated version above
  // relaxing the floor for EVERY query, not just ones with a literal anchor —
  // letting near-floor noise into genuinely answerless queries ("guitar",
  // "kayak", "asdfghjkl": nothing in the catalog matches at all) and
  // attribute-only queries ("red bag": color-only matches with no product-
  // noun anchor). The delta is now applied only when the query already has
  // SOME literal evidence of relevance (strong or weak match) — a real
  // anchored near-miss sibling (iPhone next to the weak-matched Galaxy A55
  // for "phone") still gets the relaxed floor; a query with zero literal
  // matches at all gets the strict, unrelaxed floor, same as before this
  // feature existed. `strong`/`weak` are already computed above (step 3),
  // so this never manufactures results out of nothing for an answerless
  // query — it only widens the window for a query the engine already has
  // real textual evidence about.
  const hasLiteralAnchor = strong.length > 0 || weak.length > 0;
  const semFloorDelta = config.semanticFloorDelta != null ? config.semanticFloorDelta : 0;
  const semCutFloor = hasLiteralAnchor ? (semFloor - semFloorDelta) : semFloor;
  const semCut = Math.max(semCutFloor, topSem - semMargin);

  // A weak (description-only) match is corroborated only if it ALSO clears
  // the same semantic relevance bar — a bare description mention isn't
  // enough evidence the product IS the thing searched for (an accessory's
  // "compatible with laptops" note produces the identical weak match as a
  // real laptop's own description). Strong (name/category) matches need no
  // such corroboration — the product genuinely IS that thing by name. Only
  // applied when semantic scores are actually available; otherwise there's
  // no signal to corroborate with, so weak matches pass through unchanged.
  const corroboratedWeak = (hasProductTerms && semanticScores)
    ? weak.filter(p => (semanticScores[p._id?.toString()] || 0) >= semCut)
    : weak;
  const literalMatches = hasProductTerms ? [...strong, ...corroboratedWeak] : [];

  const semanticOnly = [];
  if (semanticScores && hasProductTerms) {
    const litIds = new Set(literalMatches.map(p => p._id?.toString()));
    for (const p of activePool) {
      const id = p._id?.toString();
      if (litIds.has(id)) continue;
      if ((semanticScores[id] || 0) >= semCut) semanticOnly.push(p);
    }
  }

  // 5. Build the working pool
  let pool;
  if (hasProductTerms) {
    pool = [...literalMatches, ...semanticOnly]; // may be empty → honest zero result
  } else {
    pool = activePool; // browse-style query (budget/color/premium only)
  }

  // 6. Category from STRONG literal matches only (keeps the signal clean)
  const { category: derivedCategory } = deriveCategoryFromMatches(hasProductTerms ? strong : []);

  // 6b. [Task: search-multicategory] Same-category tightening REMOVED as a
  // blanket pool filter — replaced below with a narrower cut. A genuine
  // STRONG (name/category) match in the minority category is a real product
  // the user searched for, not noise (e.g. "apple" → mostly Electronics by
  // count, but the literal Groceries "Apple" match is the actual fruit the
  // user typed — it must survive, just ranked below Electronics via
  // recSignals/categoryMatch, step 8 below). derivedCategory is still
  // computed above and still feeds the categoryMatch score boost and the
  // understanding/interpretedAs display either way.
  //
  // [Task: search-multicategory refinement] Semantic-only off-category cut.
  // A LITERAL match (strong OR weak — the item is in `literalMatches`) has
  // real textual evidence it's what the user meant, even off-category, and
  // must survive regardless of derivedCategory. But an item that entered the
  // pool ONLY via `semanticOnly` (step 4 above) — zero literal match, purely
  // "its embedding happens to sit near this query's cluster" — has no such
  // evidence. E.g. "iphone": an apple-FRUIT fixture can score deceptively
  // high semantic similarity to "iphone" (shared brand word "apple" in
  // embedding space) despite matching not one word of "iphone" literally.
  // Once a dominant category exists to judge it against, that's exactly the
  // noise worth cutting — contrast "apple": the Groceries "Apple" survives
  // there because it's a STRONG literal match, not semantic-only. No
  // dominant category (derivedCategory null) means there's nothing to judge
  // "off-category" against, so nothing is cut here either way.
  // Reuses the semanticOnly classification already computed in step 4 — no
  // re-run of word matching. semanticOnly is itself the marker; the id Set
  // below is just a cheap membership check, not a new per-item flag.
  if (derivedCategory) {
    const semanticOnlyIds = new Set(semanticOnly.map(p => p._id?.toString()));
    pool = pool.filter(p => p.category === derivedCategory || !semanticOnlyIds.has(p._id?.toString()));
  }

  // 7. Budget filter (no fallback once the user named a product term)
  const tolerance = config.budgetOvershootTolerance || 0.1;
  const { pool: budgetFilteredPool } =
    applyBudgetFilter(pool, intent.budget, tolerance, !hasProductTerms);
  pool = budgetFilteredPool;

  // 8. Base score via recommendation-engine signals
  const recSignals = {
    category:      derivedCategory || null,
    anchorPrice:   intent.budget   || null,
    favCategories: [],
  };
  const basedPool = pool.map(p => scoreProduct(p, recSignals));

  // 8b. [Task: search-relevance] De-weight quality signals (rating/
  // popularity/recency) for SEARCH ranking specifically. Relevance (text/
  // semantic/category) must dominate; quality may only tiebreak. This reads
  // the _scoreParts scoreProduct already returned and adjusts the COPY used
  // for search scoring only — recommendationEngine.js and
  // recommendationConfig.js are never touched, so scoreProduct's own output
  // (and every recommendation-carousel caller of it) is byte-for-byte
  // unaffected. See searchConfig.js's qualitySignalScale for the derivation.
  // Live-verified against the actual catalog: even a heavy 0.1 scale still
  // let rated junk (Huawei Matebook, "Apple" the fruit, Baseball Ball,
  // Durango/Charger SXT RWD) outrank the two real (zero-rating) phones on
  // "phones"/"mobile"/"mobiles" — the relevance gap between them and the
  // phones is only a few points, comfortably inside even a heavily-scaled
  // quality edge. Per the approved plan's escalation path, qualitySignalScale
  // is 0 (quality contributes NOTHING to the additive _score); _qualityRaw is
  // still tracked on every item so quality can act as a PURE tiebreaker — see
  // the final sort in step 11 — used only when two items are already tied on
  // every relevance signal, never to override a real relevance gap.
  const qScale = config.qualitySignalScale != null ? config.qualitySignalScale : 1;
  const qualityAdjustedPool = basedPool.map(p => {
    const parts = p._scoreParts || {};
    const rawQuality = (parts.rating || 0) + (parts.popularity || 0) + (parts.recency || 0);
    const delta = (rawQuality * qScale) - rawQuality;
    return { ...p, _score: (p._score || 0) + delta, _qualityRaw: rawQuality };
  });

  // 9. (Phase 2) Blend semantic similarity into the score for everything in pool
  let withSemantic = qualityAdjustedPool;
  if (semanticScores) {
    withSemantic = qualityAdjustedPool.map(p => {
      const sim = semanticScores[p._id?.toString()] || 0;
      const semScore = sim * (config.searchWeights?.semantic || 40);
      return { ...p, _score: (p._score || 0) + semScore, _searchSemantic: Math.round(semScore) };
    });
  }

  // 10. Search scoring (text/budget/color on top of base+semantic)
  const scored = withSemantic.map(p => scoreSearchResult(p, intent, config));

  // 11. Sort, reasons, limit
  // [Task: search-relevance] Sort on the UNROUNDED score first (_scoreExact)
  // so a rounding coincidence (two items whose displayed _score happens to
  // match) never gets mistaken for a genuine tie. _qualityRaw (rating/
  // popularity/recency, unscaled) is a pure TIEBREAKER — only consulted when
  // two items are ACTUALLY relevance-identical. It can never move a less-
  // relevant item ahead of a more-relevant one.
  scored.sort((a, b) => (b._scoreExact - a._scoreExact) || ((b._qualityRaw || 0) - (a._qualityRaw || 0)));
  const withReasons = scored.map((p, i) => ({ ...p, _reason: buildSearchReason(p, intent, i + 1) }));
  const results    = withReasons.slice(0, limit);
  const totalFound = scored.length;

  // How many of the RETURNED results have a real name/category anchor — i.e.
  // does this response have anything trustworthy to calibrate against, or is
  // it semantic-only noise-risk territory (see resultFilter.js, which uses
  // this to decide whether an LLM relevance pass is warranted). null (not 0)
  // for browse-style queries (no product term at all, e.g. budget/color-only)
  // — `strong` is ALWAYS empty when hasProductTerms is false (partitionMatches
  // short-circuits), so a numeric 0 there would be misread as "semantic-only,
  // needs judging" when really there's no product concept to judge against.
  const strongMatchCount = hasProductTerms
    ? results.filter(p => strongIds.has(p._id?.toString())).length
    : null;

  const understanding = buildUnderstanding(intent, derivedCategory);

  return {
    results,
    understanding,
    intent: { ...intent, category: derivedCategory },
    totalFound,
    isZeroResult: results.length === 0,
    strongMatchCount,
  };
};

module.exports = {
  buildCatalogVocabulary,
  parseQuery,
  findMatchingCandidates,
  partitionMatches,
  groupTermsBySynonym,
  deriveCategoryFromMatches,
  scoreSearchResult,
  buildSearchReason,
  buildUnderstanding,
  runSearch,
  applyBudgetFilter,
  normalizeText,
  spellCorrect,
  expandSynonyms,
  expandAbbreviations,
  extractBudget,
  extractColor,
  extractProductTerms,
  stemCandidates,
  buildSynonymVocabulary,
  fuzzyCorrectToken,
};