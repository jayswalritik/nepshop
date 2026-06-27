import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../utils/api';
import { useAuth } from './AuthContext';

const WishlistContext = createContext();

export const WishlistProvider = ({ children }) => {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState([]); // array of product objects
  const [wishedIds, setWishedIds] = useState(new Set());

  const fetchWishlist = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await API.get('/wishlist');
      setWishlist(data.wishlist);
      setWishedIds(new Set(data.wishlist.map(p => p._id)));
    } catch (err) {
      // not a customer or not logged in — ignore
    }
  }, [user]);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  const isWished = (productId) => wishedIds.has(productId);

  const toggleWish = async (productId) => {
    // optimistic update
    const next = new Set(wishedIds);
    const wasWished = next.has(productId);
    try {
      if (wasWished) {
        next.delete(productId);
        setWishedIds(next);
        await API.delete(`/wishlist/${productId}`);
      } else {
        next.add(productId);
        setWishedIds(next);
        await API.post(`/wishlist/${productId}`);
      }
      fetchWishlist(); // refresh the full list
    } catch (err) {
      // revert on error
      setWishedIds(new Set(wishedIds));
      console.error('Wishlist toggle failed:', err);
    }
  };

  return (
    <WishlistContext.Provider value={{ wishlist, isWished, toggleWish, fetchWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => useContext(WishlistContext);