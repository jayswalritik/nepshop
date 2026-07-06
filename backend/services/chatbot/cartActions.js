/**
 * Chatbot Cart Actions  (backend/services/chatbot/cartActions.js)
 * Grounding for the view-cart intent — reads the SAME Cart document the cart
 * page uses, including the price snapshots taken at add time.
 */

const Cart = require('../../models/Cart');

const getCartContents = async (userId) => {
  const cart = await Cart.findOne({ customer: userId })
    .populate('items.product', 'name images price discount stock isActive category rating')
    .lean();

  if (!cart) return { items: [], total: 0, itemCount: 0 };

  const validItems = (cart.items || []).filter((i) => i.product && i.product.isActive);
  const total      = validItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const itemCount  = validItems.reduce((s, i) => s + i.quantity, 0);

  return { items: validItems, total, itemCount };
};

module.exports = { getCartContents };