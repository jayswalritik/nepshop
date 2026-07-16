import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getWishlist, addToWishlist, removeFromWishlist } from '../utils/wishlist';
import { useAuth } from './AuthContext';

// Mirrors frontend/src/context/WishlistContext.jsx exactly: fetch the full
// wishlist once (re-fetched whenever `user` changes — login/logout/role
// switch), keep a Set of ids for O(1) membership checks, and toggle
// OPTIMISTICALLY (flip local state immediately, fire the request, refetch
// the full list on success, revert on failure). Mounted at the app root
// (mobile/app/_layout.js) the same way AuthProvider is, matching web's
// App.jsx nesting — every screen can call useWishlist() without threading
// props through the navigator.
const WishlistContext = createContext(null);

export const WishlistProvider = ({ children }) => {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState([]); // array of product objects
  const [wishedIds, setWishedIds] = useState(new Set());

  const fetchWishlist = useCallback(async () => {
    if (!user) return;
    const result = await getWishlist();
    if (result.success) {
      setWishlist(result.wishlist);
      setWishedIds(new Set(result.wishlist.map((p) => p._id)));
    }
    // not a customer, or request failed — leave existing state in place,
    // same as web's silent-ignore catch block.
  }, [user]);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  const isWished = (productId) => wishedIds.has(productId);

  const toggleWish = async (productId) => {
    const next = new Set(wishedIds);
    const wasWished = next.has(productId);
    if (wasWished) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    setWishedIds(next);

    const result = wasWished ? await removeFromWishlist(productId) : await addToWishlist(productId);
    if (result.success) {
      fetchWishlist(); // refresh the full list (name/price/etc. for new adds)
    } else {
      setWishedIds(new Set(wishedIds)); // revert on error — same pre-toggle membership
    }
  };

  return (
    <WishlistContext.Provider value={{ wishlist, isWished, toggleWish, fetchWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => useContext(WishlistContext);
