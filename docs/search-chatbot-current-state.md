# Search System & Chatbot — Current State Report

**Repo**: `D:\NepShop` (backend/ + frontend/ + mobile/)
**Branch investigated**: `feature/notifications` (current checkout at time of investigation)
**Method**: Read-only code inspection. Every claim below is backed by a `file:line` citation. No files were modified as part of this investigation except this report.

> **Top-line contradiction to flag up front**: the investigation brief assumed a Python microservice might be in the search path. **No such microservice exists.** There is no subprocess call, no local Python process, and no `.py`/`python` reference anywhere in `backend/`. Embeddings are computed **in-process, in Node**, via `@huggingface/transformers`. See Part A §1/§2 for detail.

---

## Part A — Search System

### A.0 Correction to assumptions

- **No Python microservice.** Confirmed via full grep of `backend/` for `python`/`.py`/subprocess calls — zero hits related to search.
- **No Algolia.** `algoliasearch`/`algolia` — zero hits anywhere in the repo (excluding `node_modules`).
- **No `SearchHistory` DB model.** Despite a `feature/search-history` branch existing in git history, on this branch "recent searches" is implemented as **client-only, session-scoped React state** — never persisted server-side. See A.6.
- **Stale comment in code**: `backend/models/Product.js:110` describes the embedding field as "all-MiniLM-L6-v2" — this is **incorrect on the current branch**. The actual model, per `backend/services/embeddingService.js:18` and `backend/services/searchConfig.js:126`, is **`Xenova/bge-small-en-v1.5`** (BGE-small, 384-dim), not MiniLM.

### A.1 End-to-end flow

**Web**
1. `frontend/src/pages/customer/Dashboard.jsx` — `SearchBox` component captures keystrokes; `handleSearchChange` (~line 161) updates `searchQuery` state; `handleSearchCommit`/history-pick (lines 187, 196) bump `searchCommitNonce` on Enter or history click.
2. `Dashboard.jsx:310` renders `<SearchPage initialQuery={searchQuery} searchCommitNonce={searchCommitNonce} .../>`.
3. `frontend/src/pages/customer/SearchPage.jsx:259-315` — debounce effect (700ms, immediate on explicit commit) calls `runSearch` (`SearchPage.jsx:209,227`).
4. `runSearch` → `API.get('/search?q=...&limit=20', {signal})` via `frontend/src/utils/api.js:9-11` (`baseURL` = `VITE_API_URL` or `http://localhost:5000/api`).
5. Backend route: `backend/routes/searchRoutes.js:12` → `GET /api/search` → `search()` in `backend/controllers/searchController.js:21`.
6. Controller calls `searchProducts(rawQuery, {limit})` — `backend/services/nepShopSearchAdapter.js:120`.
7. Adapter pipeline: fetch/cache candidates (`getAllSearchCandidates`, `nepShopSearchAdapter.js:50`) → parse intent + compute semantic scores (`semanticSearchService.js:142`) → `runSearch` (`searchEngine.js:798`) → optional LLM result-filter (`resultFilter.js`) and LLM query-rescue (`queryUnderstanding.js`) on zero/weak results → zero-result trending rescue.
8. Response shape (`searchController.js:27-47`): `{success, query, totalFound, count, understanding, interpretedAs, intent, products, isZeroResult, rescue}`.
9. `SearchPage.jsx:232-237` sets state from response; renders `SearchProductCard` grid (line 83) and `UnderstandingCard` (line 26).

**Mobile**
1. `mobile/app/(customer)/search.js` — dedicated full-screen search route (not embedded in a dashboard tab), entered via a button on `mobile/app/(customer)/home.js`. `TextInput` at line 246; `handleChangeText` (line 143) mirrors web's debounce/length gate (`MIN_CHARS=2`, `DEBOUNCE_MS=700`, lines 31-32).
2. `runSearch` (line 86) → `API.get('/search?q=...&limit=20', {signal})` via `mobile/src/utils/api.js` — a hand-rolled `fetch` wrapper (no axios). `API_BASE_URL = 'https://nepshop-i10t.onrender.com/api'` hardcoded (`mobile/src/utils/api.js:8`), with a commented-out LAN-IP swap for local dev (lines 11-14).
3. Same backend endpoint/controller/adapter as web — comment at `search.js:24-30` explicitly states it mirrors web against the same endpoint; confirmed line-for-line equivalent handling of `data.products/rescue/understanding/intent/interpretedAs`.
4. Rendering via `mobile/src/components/ProductCard.js` plus local `SearchListHeader`/`SearchListEmpty` components (`search.js:324,384`).

### A.2 Search mechanism(s) — single hybrid pipeline, not a branch between engines

- **Literal/lexical**: custom whole-word matcher `wordMatch` (`backend/services/searchEngine.js:78-103`) over `name`/`category`/`description` — **not** Mongo `$text` and **not** `$regex` (regex-based search is a *different, separate* endpoint — see A.4). Includes spell-correction (`spellCorrect`, line 262), synonym/abbreviation expansion (lines 300-343), fuzzy Levenshtein correction (lines 108-254).
- **Semantic/embedding**: `backend/services/semanticSearchService.js`. Two scoring paths tried in order: MongoDB Atlas `$vectorSearch` aggregation (`semanticSearchService.js:100-120`, primary, ANN index `product_embedding_index`) → in-Node brute-force cosine similarity fallback (`bruteForceScores`, lines 123-135; `cosineSimilarity`, lines 39-49) if Atlas errors.
- **LLM query-rescue** (`queryUnderstanding.js`, "Phase 3"): fires only when literal+semantic found nothing / no product terms detected; asks Groq/Ollama for generic product nouns, re-runs the pipeline.
- **LLM result-filter** (`resultFilter.js`, "Phase 4"): fires only when the ranked pool has zero "strong" (name/category) matches; the LLM may only veto candidates from the already-ranked pool, never add new ones.
- **No Algolia** (confirmed absent, A.0).

Branching/merge logic lives in `searchEngine.js:runSearch` (lines 798-963):
- Literal matches attempted first → `strong`/`weak` buckets (`partitionMatches`, line 828).
- Semantic scores merge via an adaptive cutoff `semCut = max(semanticFloor, topSem - semanticTopMargin)` (lines 845-858) — corroborates weak literal matches and adds semantic-only items.
- LLM rescue trigger: `shouldAskLLM = noProductTerms || searchResult.isZeroResult` (`nepShopSearchAdapter.js:213`).
- LLM result-filter trigger: `strongMatchCount === 0` (`nepShopSearchAdapter.js:75-105`).
- Text and semantic scores blend additively into one `_score` per product (`scoreSearchResult`, `searchEngine.js:671-692`; semantic blend at `searchEngine.js:922-930`), then a single final sort (line 936).

### A.3 Embeddings — generation, storage, refresh, similarity

- **Model**: `Xenova/bge-small-en-v1.5`, 384-dim (`embeddingService.js:18`), via in-process `@huggingface/transformers`. (See A.0 re: stale MiniLM comment.)
- **Generation on write**:
  - `createProduct` (`backend/controllers/productController.js:32-40,52`): `embedDocument(buildProductText({name, description, category}))`, failure is non-fatal (product saves without a vector).
  - `updateProduct` (`productController.js:261-266`): re-embeds from updated text on every update, same non-fatal handling.
  - `buildProductText` joins `name`. `category`. `description` (`embeddingService.js:121-125`).
- **Storage**: `embedding` field directly on the Product Mongoose schema, `type:[Number]`, `select:false` (hidden by default, opt-in via `.select('+embedding')`) — `backend/models/Product.js:113-117`.
- **Refresh**: no scheduled/cron job — embeddings only regenerate on product create/update. Manual bulk backfill available: `backend/scripts/backfillEmbeddings.js` (re-embeds every product, run manually). Dev/QA scripts also present: `backend/scripts/checkEmbeddings.js`, `testSemantic.js`, `testEmbedding.js`.
- **Query-time embedding**: `embedQuery()` adds a BGE-specific query prefix (`embeddingService.js:19,106-108`); document embedding uses no prefix — intentional asymmetric embedding per BGE's design.
- **Similarity function**: cosine similarity in both paths — Atlas `$vectorSearch` score is remapped from Atlas's `(1+cosine)/2` back to raw cosine (`semanticSearchService.js:116`); the in-Node fallback computes cosine explicitly (`semanticSearchService.js:39-49`).
- **Ranking integration**: semantic score × `config.searchWeights.semantic` (40, `searchConfig.js:112`) is added into the running `_score`, then blended with `textMatchScore`/`budgetScore`/`colorScore` (`scoreSearchResult`, `searchEngine.js:671-692`) before the final sort (`searchEngine.js:936`).

### A.4 Filters vs. search — two separate code paths

**Smart search endpoint (`/api/search`)** has no explicit filter query params — only `q` and `limit` (`searchRoutes.js:12`, `searchController.js:22-23`). "Filters" (budget/color/category/purpose) are extracted from the natural-language query text itself (`extractBudget`, `extractColor`, `extractPurpose` — `searchEngine.js:349-393`) and applied **in-memory, after the Mongo fetch**:
- Category tightening to the dominant derived category — `searchEngine.js:904-906` (post pooling, pre-scoring).
- Budget filter — `applyBudgetFilter` (`searchEngine.js:784-793`, invoked at 910-912), in-memory `.filter()` over `effectivePrice(p)`, with a fallback-to-unfiltered rule if the filter would zero out an otherwise non-empty pool and no product term was named.
- **No sort-order concept** in smart search — results are always sorted by computed `_score` descending (`searchEngine.js:936`). The only client-side "filter" is exclusionary chip removal, done entirely in the browser/app (`SearchPage.jsx:350-359`; `search.js:222-231` on mobile) — it hides already-fetched results, never re-queries the backend.

**Separate browse/filter endpoint (`GET /api/products`)** — `productController.js:getAllProducts` (lines 106-138), powers `frontend/src/pages/customer/ProductsPage.jsx` (the "Shop" tab; comment at line 8 states "category filter + sort + grid + pagination, nothing else", explicitly no search relevance). Here filters are real Mongo query-stage operations:
- `category` → `query.category = category` (line 117)
- `minPrice`/`maxPrice` → `query.price.$gte`/`$lte` (lines 118-122)
- `sort` → mapped to a Mongo `.sort()` object (`sortMap`, lines 125-131: `newest`, `price_asc`, `price_desc`, `top_rated`)
- Even this endpoint's own `search` param (lines 107, 111-116) is plain Mongo `$regex` on `name`/`category` — no relevance scoring, no embeddings, entirely separate implementation from `searchController.js`.

**Net answer**: filters run *before* ranking only in the `/api/products` DB-query sense (cheap Mongo-side filter, then a flat sort). In the smart-search pipeline, filters are applied *after* the literal+semantic candidate pool is built but *before* final scoring — an in-memory JS post-filter over an already-fetched, 60s-cached catalog, never a Mongo query condition.

### A.5 Mobile vs. web parity

Confirmed identical: same endpoint, same params (`q`, `limit=20`), same response shape consumed, same debounce/commit semantics (700ms debounce, 2-char minimum, explicit-commit bypass, `AbortController`-based staleness guarding). `search.js:24-30` explicitly documents that it mirrors web against the same endpoint. Differences: mobile hits a hardcoded production URL rather than an env var (`mobile/src/utils/api.js:8`), and mobile has no in-navbar live search — it's a dedicated full-screen route.

### A.6 Observability / "search history"

- **Logging**: extensive `console.log`/`console.warn` instrumentation in `nepShopSearchAdapter.js` — `[search:timing]` (line 129, 300-316, breaking down fetch/embed/vector/run/filter/rescue/trending ms and cache HIT/MISS), `[search:filter]` (lines 77,81,91,103), `[search:rescue]` (lines 217,224,279,281,284). **Console-only** — no persisted analytics store, no DB writes for search events.
- **No `SearchHistory` model** exists in `backend/models/`. What the `feature/search-history` branch name suggests is, on this branch, implemented purely as **client-side, session-only, non-persisted** state: `Dashboard.jsx` — `searchHistory` state (line 126), populated by `rememberSearch` (line 128), rendered in the `SearchBox` "Recent searches" dropdown (line 86), cleared via `onClearHistory` (lines 246, 299) and implicitly on page reload (plain `useState`, no `localStorage`/backend persistence).
- **Mobile has no recent-searches feature at all** — `search.js` has no history array/dropdown.

### A.7 Key files (search)

`backend/routes/searchRoutes.js` · `backend/controllers/searchController.js` · `backend/services/nepShopSearchAdapter.js` · `backend/services/searchEngine.js` · `backend/services/searchConfig.js` · `backend/services/semanticSearchService.js` · `backend/services/embeddingService.js` · `backend/services/queryUnderstanding.js` · `backend/services/resultFilter.js` · `backend/models/Product.js` · `backend/controllers/productController.js` · `backend/scripts/backfillEmbeddings.js` · `frontend/src/pages/customer/Dashboard.jsx` · `frontend/src/pages/customer/SearchPage.jsx` · `frontend/src/pages/customer/ProductsPage.jsx` · `frontend/src/utils/api.js` · `mobile/app/(customer)/search.js` · `mobile/src/utils/api.js`

---

## Part B — Chatbot

### B.1 End-to-end flow

**Frontend** — `frontend/src/components/chatbot/ChatWidget.jsx`
- Opening greeting is built client-side with no API call: `buildGreeting()` (lines 26-32).
- Every subsequent turn: `send()` (lines 161-208) calls `API.post('/chatbot/message', { message: text, context, mode })` (line 170). `context` is client-held conversation state echoed back from the previous response; `mode` is `'fast'` (rule router) or `'conversational'` (LLM router), toggled via a UI button (lines 141, 234-241).
- On `data.action.type === 'add_to_cart' | 'add_to_cart_all'`, the widget itself calls `addToCart()` from `CartContext` (lines 175-189) — the backend never mutates the cart directly, it only returns a directive for the client to act on.
- **No mobile chatbot exists.** Case-insensitive grep for "chatbot" across `mobile/` returns zero matches.

**Route** — `backend/routes/chatbotRoutes.js`
- `router.use(protect)` (line 13) — JWT auth required for the whole router.
- `router.post('/message', sendMessage)` (line 15), mounted at `/api/chatbot`.

**Controller** — `backend/controllers/chatbotController.js`
- `sendMessage` (lines 20-39), `asyncHandler`-wrapped. Validates the message is present/non-empty, caps length to 500 chars (line 29), calls `handleMessage(req.user, trimmed, context || {}, mode === 'conversational' ? 'conversational' : 'fast')` (lines 31-36), returns `{success:true, ...result}`.

**Orchestrator / router dispatch** — `backend/services/chatbot/chatbotService.js`, `handleMessage()` (lines 72-510)
- If `mode === 'conversational'`: `llmDetectIntent(message, context)` (`llmRouter.js`) is tried first (line 79); if it returns `null` for any reason, falls back to the rule-based `detectIntent()` (lines 82-86).
- `switch (intent)` (line 90) dispatches to per-intent grounded-action + template logic.

**Grounded action layer**: `orderActions.js`, `returnActions.js`, `productQA.js`, `cartActions.js`, plus shared platform services `nepShopSearchAdapter.js` (`searchProducts`) and `nepShopAdapter.js` (`getTrending`).

**LLM call** — `backend/services/chatbot/ollamaService.js`, `generate()` (lines 143-162) — invoked either by `llmRouter.js` (intent classification) or directly inside `chatbotService.js` for product Q&A phrasing.

**Response** — uniform shape from `respond()` (`chatbotService.js:513-520`): `{intent, reply, products, suggestions, context, ...extra}`.

### B.2 All intents recognized by the rule-based router

File: `backend/services/chatbot/intentRouter.js`, `detectIntent()` (lines 161-345); constants at `INTENTS` (lines 20-37). Rules are ordered; first match wins.

| # | Intent | Trigger (file:line) |
|---|---|---|
| 1 | `GREETING` | ≤4 words + `/^(hi+\|hello+\|hey+\|namaste\|good\s(morning\|afternoon\|evening\|day))[\s!,.]*$/i` — `intentRouter.js:170-174` |
| 2 | `THANKS` | ≤5 words + word-boundary match on `['thanks','thank','thx','dhanyabad']` — `intentRouter.js:178` |
| 3 | `GOODBYE` | ≤4 words + `/^(bye+\|goodbye\|see\s?(you\|ya)\|ok\s?bye)[\s!,.]*$/i` — `intentRouter.js:183` |
| 4 | `HELP` | word `help`, or "what can/do you do/help", or "how do/does you/this work" — `intentRouter.js:188-193` |
| — | `ADD_TO_CART` (pending selection reply) | context-gated on `context.pendingCartAdd` + ordinal-selector regex / "all/both/everything" / shown-product-name match — `intentRouter.js:197-202` |
| — | `ADD_TO_CART` (bare "all of them") | `/^(add\s)?(all\|both\|everything)(\sof\s(them\|these\|those))?[\s?.!]*$/i` when products shown and no pending QA — `intentRouter.js:207-213` |
| 5 | `ADD_TO_CART` | `/\b(add\|put)\b/i` AND `/\b(cart\|basket)\b/i` — `intentRouter.js:216-218` |
| 6 | `VIEW_CART` | `/\b(cart\|basket)\b/i` not already caught by add — `intentRouter.js:223-225` |
| 7 | `RETURN_REFUND` | word `return`/`refund`/`exchange`, or "money back" — `intentRouter.js:228-230` |
| 8 | `ORDER_FOLLOW_UP` (ordinal) | context-gated on shown orders + last order-related intent; ordinal regex (first/second/.../1st/2nd/"that one") — `intentRouter.js:236-241` |
| 9 | `ORDER_FOLLOW_UP` (status filter) | status word regex + which/what/any/is/are — `intentRouter.js:244-247` |
| 10 | `ORDER_TRACKING` | "where('s\|is) ... order/package/parcel/delivery", `/\btrack\b/`, "order/delivery status", "when will/does/is ... arrive/come/deliver", "my package/parcel" — `intentRouter.js:251-258` |
| 11 | `ORDER_HISTORY` | "my/recent/last/previous (recent) orders", "order history", "what did/have i buy/bought/order/ordered" — `intentRouter.js:262-267` |
| 12 | `SHOW_AGAIN` | context-gated on shown products; "previous/earlier products/items/ones/results", or "show ... them/those/these/it ... again", or trailing "again"/"go back" — `intentRouter.js:273-281` |
| 13 | `TRENDING` | word `trending`/`popular`, "best sell(ing/ers)", "what's hot/new/good" — `intentRouter.js:286-290` |
| 14 | `FOLLOW_UP` | context-gated on shown products; `FOLLOW_UP_PATTERNS` for cheapest/expensive/best_rated — `intentRouter.js:128-132,293-300` |
| 15 | `PRODUCT_QA` (bare selector) | context-gated; ordinal-selector regex, or name match while `pendingQAQuestion` set — `intentRouter.js:303-311` |
| 16 | `MULTI_QA` | context-gated on ≥2 shown products; "which" + `QA_STARTERS`, or "do/does any/one of ... has/have/come/support", or "any of these/them/those" — `intentRouter.js:314-322` |
| 17 | `PRODUCT_QA` | context-gated on shown products; `QA_STARTERS` (does/do/is/are/has/have/can/will/what/whats/what's/which/how/tell me/what about) AND (`QA_PRONOUNS` match, shown-product-name match, or last intent already `PRODUCT_QA`) — `intentRouter.js:138-139,325-335` |
| 18 (default) | `PRODUCT_SEARCH` | fallback: `cleanSearchQuery()` after stripping `SEARCH_PREFIXES`; empty → `HELP` — `intentRouter.js:89-97,340-344` |

Typo tolerance for the router's own command vocabulary (not catalog words) applied via `correctIntentTypos()` (edit-distance-1 + adjacent-swap, `intentRouter.js:45-83`).

An alternative LLM-based router (`llmRouter.js`) exists for `mode:'conversational'` — see B.4/B.6.

### B.3 Per-intent grounding: DB source → LLM exposure

| Intent | Grounded data source | To LLM? | Notes |
|---|---|---|---|
| `GREETING`/`THANKS`/`GOODBYE`/`HELP` | none | No | Template string only (`chatbotService.js:92-102`) |
| `ORDER_TRACKING` | `Order.find({customer, status:{$in:ACTIVE_STATUSES}})`/`getRecentOrders`, `.populate('deliveryAgent',...)` — `orderActions.js:23-36` | No | `templates.trackingReply()` (`chatbotService.js:105-133`) — no LLM call in this path |
| `ORDER_HISTORY` | `Order.find({customer}).sort(-createdAt).limit(5)` — `orderActions.js:30-36` | No | `templates.historyReply()` (`chatbotService.js:136-151`) |
| `RETURN_REFUND` | `Order.find` + `Shipment.find({status:['delivered','returned']})` + `Return.find` + real refund math (`computeReturnReversal`/`isShipmentFullyReturned`, `utils/returnMath.js`) — `returnActions.js:53-191` | No | `templates.returnReply()` — pure template phrasing of server-computed numbers |
| `TRENDING` | `getTrending({limit,windowDays})` (`nepShopAdapter.js`, purchase-velocity over `Order`/`Product`/`ProductView`) | No | `templates.trendingReply()` |
| `FOLLOW_UP` | none new — reduces over `context.lastProducts` (client-echoed) | No | JS `.reduce()` + template |
| `PRODUCT_QA` | `fetchProductForQA(id)` → `Product.findById` (`productQA.js:138-141`); `answerFromDescription()` extraction (literal keyword pass then BGE semantic pass) | **Yes** — `answerProductQuestion(product, question)`, full product doc as prompt payload (`ollamaService.js:178-194`) | Falls back to `templates.qaReply`/`qaMissReply` (extracted sentences only) if LLM returns null — `chatbotService.js:329-337` |
| `MULTI_QA` | `fetchProductsForQA(ids)` + per-product `answerFromDescription()`; only matched excerpts kept | **Yes, matched excerpts only** — `answerMultiProductQuestion()` (`ollamaService.js:242-254`); unmatched products' text never reaches the LLM | Zero-match case → `templates.multiQaMissReply()`, no LLM call (`chatbotService.js:366-370`) |
| `ADD_TO_CART` | `resolveCartTarget`/`searchProducts` then `fetchProductForQA` re-check of live stock — `chatbotService.js:409-457` | No | Template confirmation; cart mutation happens client-side via returned `action` directive |
| `PRODUCT_SEARCH` (default) | `searchProducts()` → `nepShopSearchAdapter.js` (full search pipeline from Part A, including its own internal LLM query-rescue) | Indirectly, via search's own rescue mechanism — not the chat-reply phrasing itself | `templates.searchReply()`/`searchSuggestions()` — chat reply text is template-only |
| `SHOW_AGAIN` | none — replays `context.lastProducts` | No | |
| `VIEW_CART` | `Cart.findOne({customer}).populate('items.product',...)` — `cartActions.js:9-21` | No | `templates.cartViewReply()` |
| `ORDER_FOLLOW_UP` | filters/re-resolves `context.lastOrders` | No | JS + template (`chatbotService.js:204-232`) |

### B.4 LLM chain: Groq → Ollama → templates

All in `backend/services/chatbot/ollamaService.js`. File comment states the cascade explicitly: *"Chain: Groq → Ollama → templates"* (line 28).

- **Groq**: `https://api.groq.com/openai/v1/chat/completions` (line 29), model `process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'` (line 30), key `process.env.GROQ_API_KEY` (line 31). Params: `temperature:0.2, max_tokens:200` (57-58), request `timeout:8000ms` (line 62), `groqGenerate()` lines 37-78.
  - Any failure (including HTTP 429) sets `groqHealthy=false`/`groqFailedAt=Date.now()`, skipping Groq for a `GROQ_RETRY_MS=60000` cooldown before retry (lines 33-46, 68-77).
- **Ollama fallback**: attempted only when Groq returns `null` — `generate()` lines 143-162. `OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'`, `OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b'` (lines 21-22). Availability probed via `GET {OLLAMA_URL}/api/tags`, cached `RECHECK_MS=60000` (lines 80-100). Generation via `POST {OLLAMA_URL}/api/chat`, `temperature:0.2, num_predict:120, timeout:40000ms, keep_alive:'60m'` (lines 103-136). Fire-and-forget `warmUp()` runs at module load (line 223).
  - Comment documents that Ollama is effectively dead in the deployed environment: *"on Render, where 512MB can't hold the model ... Availability is checked at most once a minute"* (lines 12-15) — in production this stage degrades to `null` fast.
- **Template fallback**: if both return `null`, `generate()` returns `null` (line 161); every caller falls back to hand-written `templates.js` strings or extraction-only text — never throws.
- **Shared state across features**: the same `generate()` chain is reused by `backend/services/queryUnderstanding.js:21` (search zero-result rescue) and `backend/services/resultFilter.js:30,99` (search noise filtering) — these import the same `ollamaService.js` singleton, so the module-level Groq health/cooldown flags are **shared** between chatbot replies and search's LLM-assist features. A Groq outage from heavy search traffic can degrade chatbot LLM quality and vice versa.

### B.5 Conversation state

- **Stateless server** — explicit design comment: *"The server is STATELESS — context lives on the client and round-trips with each message, so Render cold starts / restarts never lose a conversation."* (`chatbotService.js:24-26`).
- State shape carried in `context` (client-held object): `lastIntent`, `lastOrders`, `lastProducts`, `lastQuery`, `qaFocus`, `pendingQAQuestion`, `pendingCartAdd` — set/mutated per intent throughout `handleMessage()` (e.g. lines 122-126, 239-245, 340, 448).
- Frontend: `useState` in `ChatWidget.jsx:137`, updated from `data.context` on every response (line 199). No cookie, no server session, no DB collection for chat history/messages — `messages` array is in-memory only and explicitly reset on refresh (`ChatWidget.jsx:14-15,133`).
- No chat-history DB model exists in `backend/models/`.

### B.6 "Phrasing only, never facts" — confirmed, with one caveat

- **Product QA system prompt**, quoted verbatim (`ollamaService.js:165-176`):
  > "You are NepShop's friendly shopping assistant. Answer the customer's question using the PRODUCT DATA provided. Rules:\n- Answer from what the data states OR clearly implies...\n- NEVER invent specific specs, numbers, features, or availability that are neither stated nor clearly implied. If something truly isn't covered, say it isn't mentioned in the listing.\n- 1-3 short sentences. No markdown, no lists."
- **Multi-product QA system prompt**, quoted verbatim (`ollamaService.js:231-240`):
  > "You are NepShop's friendly shopping assistant. The customer asked a question across several products. Below are the ONLY listing excerpts related to their question. Rules:\n- Answer using ONLY these excerpts...\n- NEVER add specs, numbers, or features not in the excerpts.\n- 1-3 short sentences. No markdown, no lists."
  - Structurally enforced, not just instructed: only matched excerpt sentences are placed in the prompt at all (`chatbotService.js:356-364`) — products with no textual match never reach the LLM's context.
- **Intent-router LLM prompt** (`llmRouter.js:28-54`) is classification-only. Comment: *"The LLM never touches facts here either — it only names an intent and extracts a reference from the user's own words."* (line 18-19). Its output params (`followUp`, `isSelector`, `statusFilter`) are re-validated against the raw user text before use, not trusted as-is (lines 100-142; e.g. `statusFilter` kept only "if the message actually contains that status word", lines 103-109).
- **Order/return/tracking/history/cart-view intents never call the LLM at all** (B.3) — reinforced by `templates.js` top-of-file comment: *"Templates ... turns STRUCTURED FACTS from the action layer into a human sentence. No data access happens here — templates only phrase what they're given, so they can never invent a fact."* (lines 5-7).
- **Caveat**: the QA prompt explicitly permits *"what the data states OR clearly implies"* — bounded inferential latitude (the prompt's own example: inferring nail-polish suitability from "glossy red hue for polished nails"), not strict verbatim rephrasing. So "phrasing only, never facts" is accurate with respect to invented specs/numbers, but slightly overstates the restriction on reasonable inference from listing text.

### B.7 Auth, rate limiting, error handling

- **Auth**: `router.use(protect)` (`chatbotRoutes.js:13`) requires a valid JWT (`backend/middleware/authMiddleware.js:13-37`); no role restriction — comments confirm "Any logged-in role" (`chatbotRoutes.js:12`) / "@access Logged-in users (any role)" (`chatbotController.js:18`).
- **Rate limiting**: **none found.** Grep for `rate.?limit`/`express-rate-limit` across `backend/` matches only an unrelated diagnostic script (`checkGroqQuota.js`) and Groq's own internal 60s cooldown (not a request-rate limiter). No `express-rate-limit` package usage anywhere, no custom throttle on `/api/chatbot` or globally. Only guard: message length capped to 500 chars (`chatbotController.js:29`).
- **Error handling**: LLM failures never throw — `groqGenerate`/`ollamaGenerate` both try/catch and return `null` on any error (`ollamaService.js:68-77,129-135`); `llmRouter.js` catches JSON-parse failures similarly (lines 151-154) — the bot degrades to templates/rules rather than erroring. Genuine thrown errors (bad ObjectId, DB errors) propagate through `asyncHandler` to the global `errorHandler` (`backend/middleware/errorMiddleware.js:3-45`), returning generic `{success:false, message}` JSON (stack traces only in dev). Frontend shows a generic fallback bubble on request failure (`ChatWidget.jsx:200-204`).

### B.8 Known-limitation check: order-level vs. shipment-level status — CONFIRMED

- `ORDER_TRACKING`/`ORDER_HISTORY` read **only** the `Order` collection (`Order.find(...)`, `ORDER_SELECT` field list) — `backend/services/chatbot/orderActions.js:23-36`. **Never queries `Shipment`.**
- `Order.status` (`backend/models/Order.js:68-78`) is a single top-level enum field.
- That field is a **derived aggregate over per-seller `Shipment` documents**, computed in `backend/utils/orderAggregate.js:18-28` (`deriveOrderStatus`): all-delivered → `delivered`; all-cancelled → `cancelled`; all-terminal → `returned`; otherwise the **least-advanced active shipment status wins** (sorted via `ACTIVE_STATUS_ORDER`), recomputed by `recomputeOrder()` (lines 32-49) after any shipment mutation.
- `backend/models/Shipment.js:27-53` has its own independent per-package `status` enum, `deliveryAgent`, timestamps — the platform **does** track shipment-leg granularity, the chatbot simply never reads it for tracking/history.
- **Concrete consequence**: for a multi-seller order where one package is `delivered` and another is `dispatched`, `Order.status` reports only `dispatched` (the least-advanced), and `templates.trackingReply()`/`orderStatusLine()` (`templates.js:144-182`) tells the customer the whole order "is out for delivery" without surfacing that part already arrived.
- **Contrast**: `RETURN_REFUND` grounding (`returnActions.js`) is explicitly shipment/item-level, and the code itself documents a related simplification: for multi-package orders, `matched.find()` resolves only to the *first* matching package, with no chat-side disambiguation (`returnActions.js:22-26`). So shipment granularity gaps exist in the return path too, but tracking/history never attempts shipment-level reporting at all — it's order-level by construction.

### B.9 Key files (chatbot)

`frontend/src/components/chatbot/ChatWidget.jsx` · `backend/routes/chatbotRoutes.js` · `backend/controllers/chatbotController.js` · `backend/services/chatbot/chatbotService.js` · `backend/services/chatbot/intentRouter.js` · `backend/services/chatbot/llmRouter.js` · `backend/services/chatbot/ollamaService.js` · `backend/services/chatbot/orderActions.js` · `backend/services/chatbot/returnActions.js` · `backend/services/chatbot/productQA.js` · `backend/services/chatbot/cartActions.js` · `backend/services/chatbot/templates.js` · `backend/utils/orderAggregate.js` · `backend/utils/returnMath.js` · `backend/models/Order.js` · `backend/models/Shipment.js` · `backend/middleware/authMiddleware.js` · `backend/middleware/errorMiddleware.js`

---

## Observed weaknesses / oddities

Facts only — no fixes proposed.

1. **Stale model-name comment**: `backend/models/Product.js:110` claims the embedding is generated by "all-MiniLM-L6-v2"; the code actually uses `Xenova/bge-small-en-v1.5` (`embeddingService.js:18`). Anyone reading the schema comment gets the wrong model name.
2. **No chatbot rate limiting**: `/api/chatbot/message` has no `express-rate-limit` or custom throttle of any kind — only JWT auth and a 500-char message cap (`chatbotController.js:29`). A single authenticated user can hammer the endpoint, each call potentially triggering paid Groq API usage.
3. **Shared LLM health state across unrelated features**: `ollamaService.js`'s module-level Groq cooldown/health flags are used by both the chatbot (`chatbotService.js`, direct QA calls) and search's LLM-assist paths (`queryUnderstanding.js`, `resultFilter.js`). A Groq outage or rate-limit triggered by search traffic silently degrades chatbot answer quality too, and vice versa — there's no per-feature isolation.
4. **Two independent, inconsistent "search" implementations** coexist: `/api/search` (hybrid literal+semantic+LLM engine, `searchController.js`) and `/api/products`'s own `search` param (plain Mongo `$regex` on `name`/`category`, `productController.js:107,111-116`) — same word "search" means two very different retrieval qualities depending on which screen/endpoint is used.
5. **"Search history" is documentation-only in spirit**: a `feature/search-history` branch exists in git history, but on the current branch the feature is unauthenticated, non-persisted, per-tab React state (`Dashboard.jsx:126-128`) that vanishes on refresh — there is no `SearchHistory` model, and it doesn't exist on mobile at all, so behavior is inconsistent between platforms.
6. **Embeddings can silently go stale/missing**: both `createProduct` and `updateProduct` treat embedding failures as non-fatal (`productController.js:32-40,52,261-266`) — a product can exist and be fully browsable/purchasable with no `embedding` field at all, silently opting it out of semantic search with no visible error to the seller or any retry mechanism apart from the manual `backfillEmbeddings.js` script.
7. **Ollama fallback is effectively dead weight in production**: the code's own comment acknowledges Render's 512MB memory ceiling can't hold the Ollama model (`ollamaService.js:12-15`), meaning the documented three-stage cascade (Groq → Ollama → templates) is, in the deployed environment, really a two-stage cascade (Groq → templates) — Ollama only meaningfully functions in local dev.
8. **Order-level-only tracking is a real, confirmed data-fidelity gap** (not hypothetical): for any multi-seller order with mixed shipment progress, the chatbot's `ORDER_TRACKING` reply reports the single least-advanced status platform-wide and never mentions partially-arrived packages, even though the underlying `Shipment` model has the granularity to say so (`orderActions.js:23-36` vs. `orderAggregate.js:18-28`, B.8).
9. **`RETURN_REFUND` intent has an acknowledged first-match-only limitation**: for orders with multiple packages, package resolution takes the first regex match with no chat-side disambiguation prompt (`returnActions.js:22-26`) — a narrower version of the same shipment-granularity issue found in tracking.
10. **No mobile chatbot at all**: despite mobile having full parity with web on search, there is zero chatbot code/UI in `mobile/` (confirmed via exhaustive grep) — the two "AI assistance" surfaces (search vs. chat) have diverged in platform coverage.
