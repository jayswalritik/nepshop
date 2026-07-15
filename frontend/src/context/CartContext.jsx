import { createContext, useContext, useState, useEffect } from 'react';
import API from '../utils/api';
import { useAuth } from './AuthContext';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const { user } = useAuth();
  const [cart, setCart]       = useState({ items: [], total: 0, itemCount: 0 });
  const [loading, setLoading] = useState(false);

  // Fetch cart whenever user logs in
  useEffect(() => {
    if (user?.role === 'customer') fetchCart();
    else setCart({ items: [], total: 0, itemCount: 0 });
  }, [user]);

  const fetchCart = async () => {
    try {
      const { data } = await API.get('/cart');
      setCart(data.cart);
    } catch (err) {
      console.error('Failed to fetch cart:', err);
    }
  };

  const addToCart = async (productId, quantity = 1) => {
    setLoading(true);
    try {
      const { data } = await API.post('/cart', { productId, quantity });
      setCart(data.cart);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || 'Failed to add to cart' };
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (productId, quantity) => {
    try {
      const { data } = await API.put(`/cart/${productId}`, { quantity });
      setCart(data.cart);
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  // itemIds may be cart-item _ids or product ids (mirrors backend/controllers/
  // cartController.js's updateSelection) — covers single-item, seller-group,
  // and select-all toggles with one call. Optimistic UI, reconciled with the
  // server response (or a full refetch if the request itself fails).
  const updateSelection = async (itemIds, selected) => {
    const idSet = new Set(itemIds.map(String));
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const productId = item.product?._id || item.product;
        return idSet.has(String(item._id)) || idSet.has(String(productId))
          ? { ...item, selected }
          : item;
      }),
    }));
    try {
      const { data } = await API.patch('/cart/selection', { itemIds, selected });
      setCart(data.cart);
    } catch (err) {
      console.error('Selection update failed:', err);
      fetchCart(); // reconcile local state with the server's actual truth
    }
  };

  const removeFromCart = async (productId) => {
    try {
      const { data } = await API.delete(`/cart/${productId}`);
      setCart(data.cart);
    } catch (err) {
      console.error('Remove failed:', err);
    }
  };

  const clearCart = async () => {
    try {
      const { data } = await API.delete('/cart');
      setCart(data.cart);
    } catch (err) {
      console.error('Clear failed:', err);
    }
  };

  return (
    <CartContext.Provider value={{
      cart, loading, fetchCart,
      addToCart, updateQuantity, updateSelection, removeFromCart, clearCart,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);