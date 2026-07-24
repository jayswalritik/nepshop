// app/(customer)/chat.js
//
// Full-screen mobile chatbot — feature parity with the web ChatWidget
// (frontend/src/components/chatbot/ChatWidget.jsx). Same POST /chatbot/message
// contract, the same opaque `context` round-trip, the same product/order cards,
// the same client-side actions (add_to_cart, add_to_cart_all, cancel_order),
// and the same conversational CANCEL confirm (the server only emits a
// cancel_order action AFTER the user's "yes" turn — this screen never fabricates
// a cancel, so confirmation stays mandatory).
//
// Registered as a HIDDEN route in app/(customer)/_layout.js (not a tab). Opened
// from the Home FAB. Android hardware back returns to the previous screen.

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, BackHandler, Image, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import API from '../../src/utils/api';
import { addToCart } from '../../src/utils/cart';
import { formatRs } from '../../src/utils/format';
import ScreenHeader from '../../src/components/ScreenHeader';
import { useAuth } from '../../src/context/AuthContext';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';

// ── Client-side greeting (mirrors ChatWidget.buildGreeting) ──────────────────
const buildGreeting = (user) => {
  const name = user?.firstName || 'there';
  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${timeGreet}, ${name} 👋 I can help you find products, track orders, or start a return. What are you looking for?`;
};

const GREETING_SUGGESTIONS = ['Show trending products', 'Where is my order?', "What's in my cart?", 'Help'];

// ── Status badge map (same labels/semantics as the web widget) ───────────────
const STATUS_BADGE = {
  pending:    { label: 'Pending',          bg: '#fef3c7', fg: '#b45309' },
  confirmed:  { label: 'Confirmed',        bg: '#dbeafe', fg: '#1d4ed8' },
  packed:     { label: 'Packed',           bg: '#e0e7ff', fg: '#4338ca' },
  dispatched: { label: 'Out for delivery', bg: '#ffedd5', fg: '#c2410c' },
  delivered:  { label: 'Delivered',        bg: '#dcfce7', fg: '#15803d' },
  cancelled:  { label: 'Cancelled',        bg: '#fee2e2', fg: '#dc2626' },
  returned:   { label: 'Returned',         bg: '#e5e7eb', fg: '#4b5563' },
};
const humanizeStatus = (status) => {
  const t = String(status || '').replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const badgeFor = (status) => STATUS_BADGE[status] || { label: humanizeStatus(status), bg: '#f3f4f6', fg: '#4b5563' };

// Delivery date in the chatbot's "5 Jul" style — manual (no locale dependency),
// '' when missing/unparseable so a card never prints "Invalid Date".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDeliveredDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
};

const RETURN_STATUS_SELF_EVIDENT = ['returned', 'return_assigned', 'return_in_transit'];

const StatusPill = ({ status }) => {
  const b = badgeFor(status);
  return <Text style={[styles.pill, { backgroundColor: b.bg, color: b.fg }]}>{b.label}</Text>;
};

// Unit-count badges — "N item(s) in return" / "N item(s) returned". Each hides
// at 0; suppressed when the status already spells out the return. Mirrors web.
const ReturnCountBadges = ({ pkg }) => {
  if (!pkg || RETURN_STATUS_SELF_EVIDENT.includes(pkg.status)) return null;
  return (
    <View style={styles.badgeRow}>
      {pkg.itemsInReturn > 0 && (
        <Text style={[styles.miniPill, { backgroundColor: '#ffedd5', color: '#c2410c' }]}>
          {pkg.itemsInReturn} item{pkg.itemsInReturn > 1 ? 's' : ''} in return
        </Text>
      )}
      {pkg.itemsReturned > 0 && (
        <Text style={[styles.miniPill, { backgroundColor: '#e5e7eb', color: '#4b5563' }]}>
          {pkg.itemsReturned} item{pkg.itemsReturned > 1 ? 's' : ''} returned
        </Text>
      )}
    </View>
  );
};

// ── Product card (mirrors ChatProductCard) ───────────────────────────────────
const ChatProductCard = ({ product }) => {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const outOfStock = product.stock <= 0;

  const handleAdd = async () => {
    if (busy || outOfStock) return;
    setBusy(true);
    const r = await addToCart(product._id, 1);
    setBusy(false);
    if (r.success) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.thumb}>
        {product.image
          ? <Image source={{ uri: product.image }} style={styles.thumbImg} />
          : <Text style={styles.thumbGlyph}>📦</Text>}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{product.name}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatRs(product.finalPrice)}</Text>
          {product.discount > 0 && <Text style={styles.strike}>{formatRs(product.price)}</Text>}
        </View>
        {product.rating > 0 && <Text style={styles.rating}>★ {product.rating.toFixed(1)}</Text>}
      </View>
      <Pressable
        onPress={handleAdd}
        disabled={busy || outOfStock}
        style={[styles.addBtn, added && styles.addBtnAdded, outOfStock && styles.addBtnDisabled]}
      >
        <Text style={[styles.addBtnText, added && styles.addBtnAddedText]}>
          {added ? '✓ Added' : outOfStock ? 'Out' : '+ Add'}
        </Text>
      </Pressable>
    </View>
  );
};

// ── Order card (mirrors ChatOrderCard, single + multi package) ───────────────
const ChatOrderCard = ({ order }) => {
  const packages = Array.isArray(order.packages) ? order.packages : [];
  const isMulti = packages.length > 1;
  const p0 = packages[0];

  if (!isMulti) {
    return (
      <View style={styles.card}>
        <View style={styles.thumb}>
          {order.image
            ? <Image source={{ uri: order.image }} style={styles.thumbImg} />
            : <Text style={styles.thumbGlyph}>📦</Text>}
        </View>
        <View style={styles.cardBody}>
          <View style={styles.orderHeadRow}>
            <Text style={styles.orderId}>#{order.shortId}</Text>
            <StatusPill status={order.status} />
          </View>
          <Text style={styles.cardSub} numberOfLines={1}>{order.itemSummary}</Text>
          {/* Money — three READ lines, each an exact API field. No arithmetic. */}
          {p0 && (
            <>
              <Text style={styles.moneyLine}>Items {formatRs(p0.sellerSubtotal)}</Text>
              <Text style={styles.moneyLine}>
                Delivery {p0.deliveryCharge === 0
                  ? <Text style={styles.free}>FREE</Text>
                  : formatRs(p0.deliveryCharge)}
              </Text>
              {p0.couponAllocation > 0 && (
                <Text style={styles.voucher}>voucher −{formatRs(p0.couponAllocation)}</Text>
              )}
            </>
          )}
          <Text style={styles.total}>{formatRs(order.total)}</Text>
          {p0?.returnWindowLabel ? <Text style={styles.returnLabel}>{p0.returnWindowLabel}</Text> : null}
          {p0?.status === 'delivered' && shortDeliveredDate(p0.deliveredAt)
            ? <Text style={styles.deliveredDate}>Delivered {shortDeliveredDate(p0.deliveredAt)}</Text> : null}
          <ReturnCountBadges pkg={p0} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cardCol}>
      <View style={styles.cardRow}>
        <View style={styles.thumb}>
          {order.image
            ? <Image source={{ uri: order.image }} style={styles.thumbImg} />
            : <Text style={styles.thumbGlyph}>📦</Text>}
        </View>
        <View style={styles.cardBody}>
          <View style={styles.orderHeadRow}>
            <Text style={styles.orderId}>#{order.shortId}</Text>
            <StatusPill status={order.status} />
          </View>
          <Text style={styles.cardSub} numberOfLines={1}>{order.itemSummary}</Text>
          <Text style={styles.total}>{formatRs(order.total)}</Text>
        </View>
      </View>

      <View style={styles.pkgWrap}>
        <Text style={styles.pkgCount}>{packages.length} PACKAGES</Text>
        {packages.map((p) => (
          <View key={p.index} style={styles.pkgRow}>
            <View style={styles.pkgInfo}>
              <Text style={styles.pkgTitle} numberOfLines={1}>
                Package {p.index} <Text style={styles.pkgSeller}>— {p.sellerName}</Text>
              </Text>
              <Text style={styles.moneyLine}>
                Items {formatRs(p.sellerSubtotal)} · Delivery {p.deliveryCharge === 0
                  ? <Text style={styles.free}>FREE</Text>
                  : formatRs(p.deliveryCharge)}
                {p.couponAllocation > 0 && <Text style={styles.voucher}>  · voucher −{formatRs(p.couponAllocation)}</Text>}
              </Text>
              {p.refund > 0 && <Text style={styles.voucher}>Refund {formatRs(p.refund)} being processed</Text>}
              {p.returnWindowLabel ? <Text style={styles.returnLabel}>{p.returnWindowLabel}</Text> : null}
              {p.status === 'delivered' && shortDeliveredDate(p.deliveredAt)
                ? <Text style={styles.deliveredDate}>Delivered {shortDeliveredDate(p.deliveredAt)}</Text> : null}
              <ReturnCountBadges pkg={p} />
            </View>
            <StatusPill status={p.status} />
          </View>
        ))}
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('conversational'); // 'fast' | 'conversational'
  const [context, setContext] = useState({});         // opaque server memory, echoed back

  const scrollRef = useRef(null);
  const greetedRef = useRef(false);
  const cancelInFlightRef = useRef(false);

  // Seed the greeting once, on first focus (useFocusEffect, not mount-only).
  useFocusEffect(
    useCallback(() => {
      if (!greetedRef.current) {
        greetedRef.current = true;
        setMessages([{ from: 'bot', text: buildGreeting(user), suggestions: GREETING_SUGGESTIONS }]);
      }
    }, [user])
  );

  // Android hardware back → previous screen (the tab we came from).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (router.canGoBack()) { router.back(); return true; }
        return false;
      });
      return () => sub.remove();
    }, [])
  );

  const send = useCallback(async (rawText) => {
    const text = (rawText || '').trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { from: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await API.post('/chatbot/message', { message: text, context, mode });

      // Action directives — identical semantics to the web widget.
      let replyText = data.reply;
      const action = data.action;
      if (action?.type === 'add_to_cart') {
        const r = await addToCart(action.productId, 1);
        if (!r.success) {
          replyText = `Sorry — I couldn't add the ${action.productName} to your cart: ${r.message || 'something went wrong'}. You can try again from the product card.`;
        }
      } else if (action?.type === 'add_to_cart_all') {
        let failed = 0;
        for (const pid of action.productIds) {
          const r = await addToCart(pid, 1);
          if (!r.success) failed++;
        }
        if (failed > 0) {
          replyText = `Added ${action.productIds.length - failed} to your cart — ${failed} couldn't be added.`;
        }
      } else if (action?.type === 'cancel_order') {
        // Cancel goes ONLY through the existing per-package endpoint; guard a
        // double-fire while one PUT is in flight (mirrors the web widget).
        if (cancelInFlightRef.current) {
          replyText = "I'm already cancelling that — one moment.";
        } else {
          cancelInFlightRef.current = true;
          try {
            const { data: cd } = await API.put(`/orders/shipments/${action.shipmentId}/cancel`);
            if (cd?.message) replyText = cd.message;
          } catch (cancelErr) {
            replyText = `Sorry — I couldn't cancel that: ${cancelErr.data?.message || 'something went wrong'}. You can try again from your Orders page.`;
          } finally {
            cancelInFlightRef.current = false;
          }
        }
      }

      setMessages((prev) => [...prev, {
        from: 'bot',
        text: replyText,
        products: data.products || [],
        orders: data.orders || [],
        handoff: data.handoff || null,
        suggestions: data.suggestions || [],
      }]);
      if (data.context) setContext(data.context);
    } catch (err) {
      setMessages((prev) => [...prev, {
        from: 'bot',
        text: err.data?.message || 'Sorry, something went wrong on my end. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [context, loading, mode]);

  const modeLabel = mode === 'fast' ? '⚡ Fast' : '💬 Conv';

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScreenHeader
          title="NepShop Assistant"
          subtitle="Grounded in real store data"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(customer)/home'))}
          rightSlot={
            <Pressable onPress={() => setMode((m) => (m === 'fast' ? 'conversational' : 'fast'))} hitSlop={8}>
              <Text style={styles.modeToggle}>{modeLabel}</Text>
            </Pressable>
          }
        />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.messages}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              return (
                <View key={i} style={styles.msgBlock}>
                  <View style={[styles.bubbleRow, m.from === 'user' ? styles.rowEnd : styles.rowStart]}>
                    <View style={[styles.bubble, m.from === 'user' ? styles.userBubble : styles.botBubble]}>
                      <Text style={m.from === 'user' ? styles.userText : styles.botText}>{m.text}</Text>
                    </View>
                  </View>

                  {m.from === 'bot' && m.products?.length > 0 && (
                    <View style={styles.cardStack}>
                      {m.products.map((p) => <ChatProductCard key={p._id} product={p} />)}
                    </View>
                  )}

                  {m.from === 'bot' && m.orders?.length > 0 && (
                    <View style={styles.cardStack}>
                      {m.orders.map((o) => <ChatOrderCard key={o._id} order={o} />)}
                    </View>
                  )}

                  {m.from === 'bot' && m.handoff === 'orders' && (
                    <Pressable style={styles.handoffBtn} onPress={() => router.push('/(customer)/orders')}>
                      <Text style={styles.handoffText}>Open My Orders →</Text>
                    </Pressable>
                  )}
                  {m.from === 'bot' && m.handoff === 'cart' && (
                    <Pressable style={styles.handoffBtn} onPress={() => router.push('/(customer)/cart')}>
                      <Text style={styles.handoffText}>Go to cart →</Text>
                    </Pressable>
                  )}

                  {m.from === 'bot' && m.suggestions?.length > 0 && isLast && !loading && (
                    <View style={styles.chipRow}>
                      {m.suggestions.map((s, j) => (
                        <Pressable key={j} style={styles.chip} onPress={() => send(s)}>
                          <Text style={styles.chipText}>{s}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {loading && (
              <View style={[styles.bubbleRow, styles.rowStart]}>
                <View style={[styles.bubble, styles.botBubble, styles.typing]}>
                  <ActivityIndicator size="small" color={COLORS.textMuted} />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send(input)}
              placeholder='Try "gaming laptop under 200000"'
              placeholderTextColor={COLORS.textMuted}
              style={styles.textInput}
              returnKeyType="send"
            />
            <Pressable
              onPress={() => send(input)}
              disabled={loading || !input.trim()}
              style={[styles.sendBtn, (loading || !input.trim()) && styles.sendBtnDisabled]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },

  modeToggle: { fontSize: 11, fontWeight: '600', color: COLORS.primary },

  messages: { padding: SPACING.md, gap: SPACING.md },
  msgBlock: { gap: SPACING.sm },

  bubbleRow: { flexDirection: 'row' },
  rowEnd: { justifyContent: 'flex-end' },
  rowStart: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADII.lg },
  userBubble: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  userText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  botText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  typing: { paddingVertical: 12 },

  cardStack: { gap: SPACING.sm, paddingRight: SPACING.lg },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADII.md, padding: SPACING.sm,
  },
  cardCol: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADII.md, padding: SPACING.sm, gap: SPACING.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  thumb: {
    width: 48, height: 48, borderRadius: RADII.sm, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbGlyph: { fontSize: 20 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  strike: { fontSize: 11, color: COLORS.textMuted, textDecorationLine: 'line-through' },
  rating: { fontSize: 11, color: '#f59e0b' },

  orderHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderId: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  moneyLine: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  free: { color: '#16a34a', fontWeight: '600' },
  voucher: { fontSize: 11, color: '#16a34a', marginTop: 1 },
  total: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginTop: 2 },
  returnLabel: { fontSize: 11, color: COLORS.primary, fontWeight: '600', marginTop: 1 },
  deliveredDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },

  pkgWrap: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, gap: SPACING.sm },
  pkgCount: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  pkgRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.sm },
  pkgInfo: { flex: 1, minWidth: 0 },
  pkgTitle: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  pkgSeller: { fontWeight: '400', color: COLORS.textMuted },

  pill: { fontSize: 10, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADII.pill, overflow: 'hidden' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  miniPill: { fontSize: 10, fontWeight: '500', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADII.pill, overflow: 'hidden' },

  handoffBtn: { alignSelf: 'flex-start', backgroundColor: COLORS.accent, borderRadius: RADII.sm, paddingHorizontal: 12, paddingVertical: 8 },
  handoffText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#e0e7ff', borderRadius: RADII.pill, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, color: COLORS.primary },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background,
  },
  textInput: {
    flex: 1, fontSize: 14, color: COLORS.text, backgroundColor: '#f3f4f6',
    borderRadius: RADII.md, paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  sendBtn: { width: 40, height: 40, borderRadius: RADII.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },

  addBtn: { backgroundColor: COLORS.accent, borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 7 },
  addBtnAdded: { backgroundColor: '#dcfce7' },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  addBtnAddedText: { color: '#15803d' },
});
