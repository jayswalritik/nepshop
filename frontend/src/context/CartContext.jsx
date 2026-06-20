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
      addToCart, updateQuantity, removeFromCart, clearCart,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);