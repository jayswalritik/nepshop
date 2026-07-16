import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import API from '../../src/utils/api';
import { addToCart } from '../../src/utils/cart';
import { useWishlist } from '../../src/context/WishlistContext';
import ProductCard from '../../src/components/ProductCard';
import Toast from '../../src/components/Toast';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';

// Mirrors frontend/src/pages/customer/SearchPage.jsx's full result-handling
// model against the SAME endpoint: GET /search?q=<query>&limit=20, response
// { products, rescue, totalFound, understanding, intent[, interpretedAs] }.
// interpretedAs isn't in this task's stated response shape, but the web
// code (the mandated reading) reads it too — it's genuinely part of the
// live response (an LLM-rescue rewrite case), so it's handled here the same
// way rather than silently dropped.
const MIN_CHARS = 2;
const DEBOUNCE_MS = 700;

const columnsForWidth = (width) => {
  if (width >= 900) return 4;
  if (width >= 600) return 3;
  return 2;
};

export default function SearchScreen() {
  const { width } = useWindowDimensions();
  const columns = columnsForWidth(width);
  const inputRef = useRef(null);
  const { isWished, toggleWish } = useWishlist();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [rescue, setRescue] = useState([]);
  const [understanding, setUnderstanding] = useState(null);
  const [intent, setIntent] = useState(null);
  const [interpretedAs, setInterpretedAs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [removedChips, setRemovedChips] = useState([]);
  const [addingId, setAddingId] = useState(null);
  const [toast, setToast] = useState(null);

  // Same stability guard as web: tag each request with the query it was
  // for, discard any response (success or error) that no longer matches
  // the latest query. AbortController is the network-level guard that stops
  // a superseded request from costing anything in the first place; this ref
  // is the last-resort guard for whatever slips past it.
  const latestQueryRef = useRef('');
  const abortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Auto-focus with the keyboard open on arrival. Chosen over passing a
  // route param: nothing needs to flow INTO this screen from Home (the
  // header search bar is a plain button, not a pre-filled input), so a
  // focus-on-mount effect is the whole job. The short delay lets expo-
  // router's push transition settle first — calling .focus() the instant
  // this mounts can get swallowed mid-transition on some devices.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const clearPendingDebounce = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  };

  const runSearch = useCallback(async (q) => {
    // A new request starting always supersedes whatever was still in flight.
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    latestQueryRef.current = q;
    setLoading(true);
    setLoadingSlow(false);
    setRemovedChips([]);
    setHasSearched(true);

    // Cold-start escalation: upgrade the loading copy after 3s without
    // swapping the loading UI out from under the user.
    const slowTimer = setTimeout(() => {
      if (latestQueryRef.current === q) setLoadingSlow(true);
    }, 3000);

    try {
      const { data } = await API.get(`/search?q=${encodeURIComponent(q)}&limit=20`, {
        signal: controller.signal,
      });
      if (latestQueryRef.current !== q) return; // superseded while in flight
      setResults(data.products || []);
      setRescue(data.rescue || []);
      setUnderstanding(data.understanding || null);
      setIntent(data.intent || null);
      setInterpretedAs(data.interpretedAs || null);
    } catch (err) {
      if (err.name === 'AbortError') return; // cancelled, not a failure
      if (latestQueryRef.current !== q) return; // stale error, ignore
      setResults([]);
      setRescue([]);
    } finally {
      clearTimeout(slowTimer);
      if (latestQueryRef.current === q) {
        setLoading(false);
        setLoadingSlow(false);
      }
    }
  }, []);

  const resetToIdle = () => {
    latestQueryRef.current = '';
    setResults([]);
    setRescue([]);
    setUnderstanding(null);
    setIntent(null);
    setInterpretedAs(null);
    setLoading(false);
    setLoadingSlow(false);
    setHasSearched(false);
  };

  // Decide WHEN to search: length gate + debounce, exactly as web's
  // SearchPage.jsx effect — 0-1 chars never auto-search, 2+ chars debounce
  // 700ms after the last keystroke.
  const handleChangeText = (text) => {
    setQuery(text);

    clearPendingDebounce();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const q = text.trim();
    if (!q) {
      resetToIdle();
      return;
    }

    if (q.length < MIN_CHARS) return;

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      runSearch(q);
    }, DEBOUNCE_MS);
  };

  // Keyboard's search/Enter key — fires immediately at any length >= 1,
  // bypassing the debounce, same as web's explicit-commit path.
  const handleSubmit = () => {
    const q = query.trim();
    if (!q) return;
    clearPendingDebounce();
    runSearch(q);
  };

  const handleClear = () => {
    setQuery('');
    clearPendingDebounce();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    resetToIdle();
  };

  // Abort/cancel everything if the screen itself unmounts mid-search.
  useEffect(() => {
    return () => {
      clearPendingDebounce();
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const handleAddToCart = async (product) => {
    setAddingId(product._id);
    const result = await addToCart(product._id, 1);
    setAddingId(null);
    setToast(
      result.success
        ? { type: 'success', message: `"${product.name}" added to cart!` }
        : { type: 'error', message: result.message }
    );
  };

  const goToProduct = (product) => {
    Keyboard.dismiss();
    router.push(`/(customer)/product/${product._id}`);
  };

  const toggleChip = (chip) => {
    setRemovedChips((prev) => {
      const exists = prev.some((c) => c.type === chip.type && c.value === chip.value);
      return exists
        ? prev.filter((c) => !(c.type === chip.type && c.value === chip.value))
        : [...prev, chip];
    });
  };

  // The ONE sanctioned client-side filter — exclusion only, copied
  // faithfully from web's SearchPage.jsx displayResults. The backend
  // already returns correctly ranked results; this only hides products
  // that matched solely because of a constraint the user just relaxed.
  const displayResults = results.filter((p) => {
    for (const chip of removedChips) {
      if (chip.type === 'category' && p.category === chip.value) return false;
      if (chip.type === 'color') {
        const text = `${p.name} ${p.description || ''}`.toLowerCase();
        if (text.includes(String(chip.value).toLowerCase())) return false;
      }
    }
    return true;
  });

  const showRescue = !loading && results.length === 0 && rescue.length > 0;
  const displayQueryLabel = interpretedAs ? interpretedAs.original : (intent?.corrected || query.trim());

  const gridData = displayResults.length > 0 ? displayResults : (showRescue ? rescue : []);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={17} color={COLORS.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            placeholder="Search products..."
            placeholderTextColor={COLORS.tabInactive}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={COLORS.tabInactive} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.searchingBanner}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.searchingText}>
              {loadingSlow ? 'Still searching — first search can take a moment…' : 'Searching…'}
            </Text>
          </View>
          <SkeletonGrid columns={columns} />
        </View>
      ) : (
        <FlatList
          key={columns}
          data={gridData}
          keyExtractor={(item) => item._id}
          numColumns={columns}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <SearchListHeader
              interpretedAs={interpretedAs}
              understanding={understanding}
              removedChips={removedChips}
              onToggleChip={toggleChip}
              displayResults={displayResults}
              displayQueryLabel={displayQueryLabel}
              showRescue={showRescue}
            />
          }
          ListEmptyComponent={
            <SearchListEmpty
              hasSearched={hasSearched}
              displayQueryLabel={displayQueryLabel}
            />
          }
          renderItem={({ item, index }) => (
            <ProductCard
              product={item}
              style={styles.gridCard}
              adding={addingId === item._id}
              showReason={index < 4}
              onPress={() => goToProduct(item)}
              onAddToCart={() => handleAddToCart(item)}
              isWished={isWished(item._id)}
              onToggleWish={() => toggleWish(item._id)}
            />
          )}
        />
      )}

      <Toast toast={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

// ── Header content above the grid: understanding card, result count /
//    interpreted-as framing, rescue framing ──────────────────────────────
function SearchListHeader({
  interpretedAs, understanding, removedChips, onToggleChip,
  displayResults, displayQueryLabel, showRescue,
}) {
  return (
    <View>
      {/* Never shown for interpretedAs results — that banner would be
          describing the LLM's rewritten query, not what the user typed,
          which reads as broken rather than helpful. Same as web. */}
      {!interpretedAs && (
        <UnderstandingCard
          understanding={understanding}
          removedChips={removedChips}
          onToggleChip={onToggleChip}
        />
      )}

      {displayResults.length > 0 && (
        interpretedAs ? (
          <View style={styles.interpretedBlock}>
            <Text style={styles.interpretedText}>
              No exact matches for <Text style={styles.interpretedQuery}>"{interpretedAs.original}"</Text> — showing related products instead
            </Text>
            {interpretedAs.terms?.length > 0 && (
              <View style={styles.relatedRow}>
                <Text style={styles.relatedLabel}>Related:</Text>
                {interpretedAs.terms.map((term, i) => (
                  <View key={i} style={styles.relatedChip}>
                    <Text style={styles.relatedChipText}>{term}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.resultCount}>
            <Text style={styles.resultCountBold}>{displayResults.length}</Text>
            {' '}result{displayResults.length !== 1 ? 's' : ''} for{' '}
            <Text style={styles.resultCountQuery}>"{displayQueryLabel}"</Text>
          </Text>
        )
      )}

      {showRescue && (
        <View style={styles.rescueHeader}>
          <View style={styles.rescueNotice}>
            <Ionicons name="search" size={26} color={COLORS.tabInactive} />
            <Text style={styles.rescueNoticeTitle}>No exact matches</Text>
            <Text style={styles.rescueNoticeBody}>
              No results for <Text style={styles.rescueNoticeQuery}>"{displayQueryLabel}"</Text>
            </Text>
          </View>
          <Text style={styles.rescueHeading}>💡 You might like these instead</Text>
        </View>
      )}
    </View>
  );
}

// ── Empty slot: either "not searched yet" prompt, or true empty result ───
function SearchListEmpty({ hasSearched, displayQueryLabel }) {
  if (!hasSearched) {
    return (
      <View style={styles.promptState}>
        <Ionicons name="search-outline" size={40} color={COLORS.tabInactive} />
        <Text style={styles.promptText}>Search for products by name, category, or description</Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyState}>
      <Ionicons name="search-outline" size={40} color={COLORS.tabInactive} />
      <Text style={styles.emptyTitle}>No products found</Text>
      <Text style={styles.emptyBody}>
        No results for <Text style={styles.emptyQuery}>"{displayQueryLabel}"</Text>
      </Text>
      <Text style={styles.emptyHint}>Try different keywords or browse all products</Text>
      <Pressable style={styles.browseButton} onPress={() => router.push('/(customer)/products')}>
        <Text style={styles.browseButtonText}>Browse All Products</Text>
      </Pressable>
    </View>
  );
}

// ── Understanding card ("We understood your search") + refine chips ─────
function UnderstandingCard({ understanding, removedChips, onToggleChip }) {
  if (!understanding || !understanding.points?.length) return null;

  const isRemoved = (chip) =>
    removedChips.some((c) => c.type === chip.type && c.value === chip.value);

  return (
    <View style={styles.understandingCard}>
      <View style={styles.understandingHeader}>
        <Text style={styles.understandingHeaderIcon}>🧠</Text>
        <Text style={styles.understandingHeaderText}>We understood your search</Text>
      </View>

      <View style={styles.pointsRow}>
        {understanding.points.map((pt, i) => (
          <View key={i} style={styles.pointPill}>
            <Text style={styles.pointPillText}>{pt.icon} {pt.text}</Text>
          </View>
        ))}
      </View>

      {understanding.chips?.length > 0 && (
        <View style={styles.chipsRow}>
          <Text style={styles.chipsLabel}>Refine:</Text>
          {understanding.chips.map((chip, i) => {
            const removed = isRemoved(chip);
            return (
              <Pressable
                key={i}
                onPress={() => onToggleChip(chip)}
                style={[styles.refineChip, removed && styles.refineChipRemoved]}
              >
                <Text style={[styles.refineChipText, removed && styles.refineChipTextRemoved]}>
                  {chip.label} {removed ? '↻' : '✕'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {understanding.wasSpellFixed && (
        <Text style={styles.spellFixedText}>
          Showing results for <Text style={styles.spellFixedQuery}>"{understanding.query}"</Text>
          {' '}(corrected from "{understanding.originalQuery}")
        </Text>
      )}
    </View>
  );
}

// ── Loading skeleton — mobile version of the web's pulse skeletons ───────
function SkeletonGrid({ columns }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: 8 }).map((_, i) => (
        <Animated.View
          key={i}
          style={[styles.skeletonCard, { opacity: pulse, width: `${100 / columns - 2}%` }]}
        >
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonBody}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLineNarrow} />
            <View style={styles.skeletonButton} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    height: 40,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    padding: 0,
  },
  loadingContainer: {
    flex: 1,
    padding: SPACING.lg,
  },
  searchingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 60,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    marginBottom: SPACING.lg,
  },
  searchingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  skeletonCard: {
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
  },
  skeletonImage: {
    width: '100%',
    aspectRatio: 1.15,
    backgroundColor: COLORS.surface,
  },
  skeletonBody: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  skeletonLineWide: {
    height: 10,
    borderRadius: 4,
    backgroundColor: COLORS.surface,
  },
  skeletonLineNarrow: {
    height: 10,
    width: '60%',
    borderRadius: 4,
    backgroundColor: COLORS.surface,
  },
  skeletonButton: {
    height: 26,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
    marginTop: 4,
  },
  grid: {
    padding: SPACING.lg,
    paddingBottom: 32,
    flexGrow: 1,
  },
  gridRow: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  gridCard: {
    flex: 1,
  },
  understandingCard: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  understandingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.sm + 2,
  },
  understandingHeaderIcon: {
    fontSize: 15,
  },
  understandingHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  pointsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  pointPill: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
  },
  pointPillText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: COLORS.primary,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  chipsLabel: {
    fontSize: 11,
    color: COLORS.tabInactive,
  },
  refineChip: {
    backgroundColor: '#E0E7FF',
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
  },
  refineChipRemoved: {
    backgroundColor: COLORS.surface,
  },
  refineChipText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  refineChipTextRemoved: {
    color: COLORS.tabInactive,
    textDecorationLine: 'line-through',
  },
  spellFixedText: {
    fontSize: 11,
    color: COLORS.tabInactive,
    marginTop: SPACING.sm + 2,
  },
  spellFixedQuery: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  interpretedBlock: {
    marginBottom: SPACING.lg,
  },
  interpretedText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  interpretedQuery: {
    fontWeight: '700',
    color: COLORS.text,
  },
  relatedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  relatedLabel: {
    fontSize: 11,
    color: COLORS.tabInactive,
  },
  relatedChip: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
  },
  relatedChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.primary,
  },
  resultCount: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  resultCountBold: {
    fontWeight: '700',
    color: COLORS.text,
  },
  resultCountQuery: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  rescueHeader: {
    marginBottom: SPACING.lg,
  },
  rescueNotice: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    marginBottom: SPACING.lg,
    gap: 4,
  },
  rescueNoticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  rescueNoticeBody: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  rescueNoticeQuery: {
    fontWeight: '600',
    color: COLORS.text,
  },
  rescueHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  promptState: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  promptText: {
    fontSize: 13,
    color: COLORS.tabInactive,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: SPACING.xl,
    gap: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  emptyBody: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  emptyQuery: {
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyHint: {
    fontSize: 12,
    color: COLORS.tabInactive,
    marginBottom: SPACING.md,
  },
  browseButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm + 2,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md - 1,
    marginTop: SPACING.sm,
  },
  browseButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
