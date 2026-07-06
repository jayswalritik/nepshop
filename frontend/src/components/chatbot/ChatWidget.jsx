/**
 * ChatWidget.jsx
 * frontend/src/components/chatbot/ChatWidget.jsx
 *
 * Floating chatbot widget — the natural-language front door to NepShop.
 *
 * Architecture notes:
 *   • The OPENING GREETING is generated here, client-side, from AuthContext —
 *     instant, personalized (real name + active role), zero server round-trip.
 *   • Every other reply comes from POST /api/chatbot/message. Facts are
 *     grounded server-side; this component only renders what it's given.
 *   • Conversation memory: the server is stateless — the `context` object it
 *     returns is stored here and echoed back with the next message.
 *   • Messages are in-memory only (reset on refresh) — consistent with the
 *     session-only search history decision.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

// ── Client-side greeting (feature 0 — instant, no LLM, no API) ───────────────
// Customer-only by scope decision; seller/delivery variants removed with the
// role-awareness feature (parked — router/greeting seams remain for later).
const buildGreeting = (user) => {
  const name = user?.firstName || 'there';
  const hour = new Date().getHours();
  const timeGreet =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${timeGreet}, ${name} 👋 I can help you find products, track orders, or start a return. What are you looking for?`;
};

// ── Mini product card rendered inside a bot bubble ────────────────────────────
const ChatProductCard = ({ product }) => {
  const { addToCart, loading } = useCart();
  const [added, setAdded] = useState(false);

  const handleAdd = async () => {
    try {
      await addToCart(product._id, 1);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch {
      /* cart context surfaces its own errors */
    }
  };

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2.5">
      {/* Image */}
      <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-lg">📦</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 truncate">{product.name}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-indigo-600">
            Rs {Number(product.finalPrice).toLocaleString('en-IN')}
          </span>
          {product.discount > 0 && (
            <span className="text-xs text-gray-400 line-through">
              Rs {Number(product.price).toLocaleString('en-IN')}
            </span>
          )}
        </div>
        {product.rating > 0 && (
          <span className="text-xs text-amber-500">★ {product.rating.toFixed(1)}</span>
        )}
      </div>

      {/* Add to cart */}
      <button
        onClick={handleAdd}
        disabled={loading || product.stock <= 0}
        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-all
          ${added
            ? 'bg-green-100 text-green-700'
            : 'bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50'}`}
      >
        {added ? '✓ Added' : product.stock <= 0 ? 'Out' : '+ Add'}
      </button>
    </div>
  );
};

// ── Mini order card rendered inside a bot bubble ──────────────────────────────
const statusBadge = {
  pending:            { label: 'Pending',        cls: 'bg-amber-100 text-amber-700' },
  confirmed:          { label: 'Confirmed',      cls: 'bg-blue-100 text-blue-700' },
  packed:             { label: 'Packed',         cls: 'bg-indigo-100 text-indigo-700' },
  dispatched:         { label: 'Out for delivery', cls: 'bg-orange-100 text-orange-700' },
  delivered:          { label: 'Delivered',      cls: 'bg-green-100 text-green-700' },
  cancelled:          { label: 'Cancelled',      cls: 'bg-red-100 text-red-600' },
  return_assigned:    { label: 'Return approved', cls: 'bg-purple-100 text-purple-700' },
  return_in_transit:  { label: 'Return pickup',  cls: 'bg-purple-100 text-purple-700' },
  returned:           { label: 'Returned',       cls: 'bg-gray-200 text-gray-600' },
};

const ChatOrderCard = ({ order }) => {
  const badge = statusBadge[order.status] || { label: order.status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2.5">
      <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {order.image
          ? <img src={order.image} alt="" className="w-full h-full object-cover" />
          : <span className="text-lg">📦</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-gray-900">#{order.shortId}</p>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-xs text-gray-600 truncate">{order.itemSummary}</p>
        <p className="text-xs font-bold text-indigo-600">
          Rs {Number(order.total).toLocaleString('en-IN')}
        </p>
      </div>
    </div>
  );
};

// ── The widget ────────────────────────────────────────────────────────────────
const ChatWidget = ({ onGoToOrders }) => {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [context, setContext]   = useState({});   // server-echoed memory
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const greetedRef = useRef(false);
  const [mode, setMode] = useState('fast');   // 'fast' | 'conversational'

  // Personalized greeting the FIRST time the widget opens (feature 0)
  useEffect(() => {
    if (open && !greetedRef.current) {
      greetedRef.current = true;
      setMessages([{
        from: 'bot',
        text: buildGreeting(user),
        suggestions: ['Show trending products', 'Where is my order?', "What's in my cart?", 'Help'],
      }]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, user]);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (rawText) => {
    const text = (rawText || '').trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { from: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await API.post('/chatbot/message', { message: text, context, mode });

      // Action directives: perform cart adds through the SAME CartContext
      // flow as the + Add button — confirmation only shows if it succeeds.
      let replyText = data.reply;
      if (data.action?.type === 'add_to_cart') {
        try {
          await addToCart(data.action.productId, 1);
        } catch (cartErr) {
          replyText = `Sorry — I couldn't add the ${data.action.productName} to your cart: ${cartErr.response?.data?.message || 'something went wrong'}. You can try again from the product card.`;
        }
      } else if (data.action?.type === 'add_to_cart_all') {
        let failed = 0;
        for (const pid of data.action.productIds) {
          try { await addToCart(pid, 1); } catch { failed++; }
        }
        if (failed > 0) {
          replyText = `Added ${data.action.productIds.length - failed} to your cart — ${failed} couldn't be added.`;
        }
      }

      setMessages((prev) => [...prev, {
        from: 'bot',
        text:        replyText,
        products:    data.products || [],
        orders:      data.orders || [],
        handoff:     data.handoff || null,
        suggestions: data.suggestions || [],
      }]);
      if (data.context) setContext(data.context);
    } catch (err) {
      setMessages((prev) => [...prev, {
        from: 'bot',
        text: err.response?.data?.message || "Sorry, something went wrong on my end. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  }, [context, loading, addToCart, mode]);

  const handleSubmit = () => send(input);

  return (
    <>
      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center text-2xl transition-all"
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="bg-indigo-600 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 bg-white/15 rounded-full flex items-center justify-center text-lg">🤖</div>
            <div className="flex-1">
              <p className="font-semibold text-sm leading-tight">NepShop Assistant</p>
              <p className="text-xs text-indigo-200 leading-tight">Grounded in real store data</p>
            </div>
            {/* Mode toggle: rules routing (instant) vs LLM routing (experimental) */}
            <button
              onClick={() => setMode((m) => (m === 'fast' ? 'conversational' : 'fast'))}
              className="text-[10px] font-medium bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-1 transition-all"
              title={mode === 'fast' ? 'Instant rule-based understanding' : 'LLM understanding (slower, experimental)'}
            >
              {mode === 'fast' ? '⚡ Fast' : '💬 Conversational'}
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line
                    ${m.from === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'}`}>
                    {m.text}
                  </div>
                </div>

                {/* Product cards under a bot message */}
                {m.from === 'bot' && m.products?.length > 0 && (
                  <div className="mt-2 space-y-2 pr-6">
                    {m.products.map((p) => (
                      <ChatProductCard key={p._id} product={p} />
                    ))}
                  </div>
                )}

                {/* Order cards under a bot message */}
                {m.from === 'bot' && m.orders?.length > 0 && (
                  <div className="mt-2 space-y-2 pr-6">
                    {m.orders.map((o) => (
                      <ChatOrderCard key={o._id} order={o} />
                    ))}
                  </div>
                )}

                {/* Handoff button (e.g. → My Orders for return submission) */}
                {m.from === 'bot' && m.handoff === 'orders' && (
                  <button
                    onClick={() => { onGoToOrders?.(); setOpen(false); }}
                    className="mt-2 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg transition-all"
                  >
                    Open My Orders →
                  </button>
                )}

                {/* Suggestion chips — only on the LATEST bot message */}
                {m.from === 'bot' && m.suggestions?.length > 0 && i === messages.length - 1 && !loading && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.suggestions.map((s, j) => (
                      <button
                        key={j}
                        onClick={() => send(s)}
                        className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2.5 py-1 rounded-full transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-md">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 bg-white px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder='Try "gaming laptop under 200000"'
              className="flex-1 text-sm px-3 py-2 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white flex items-center justify-center transition-all flex-shrink-0"
              aria-label="Send"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatWidget;