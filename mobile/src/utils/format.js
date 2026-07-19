// Same math as frontend's getDiscountedPrice/getDisplayPrice — the API
// stores discount as a percentage on the product, not a pre-computed price.
export const getDisplayPrice = (product) =>
  product.discount > 0
    ? Math.round(product.price - (product.price * product.discount) / 100)
    : product.price;

export const formatRs = (amount) => `Rs ${Number(amount).toLocaleString('en-US')}`;

// Same math as frontend/src/hooks/useNotifications.js's timeAgo — kept in
// sync by hand since there's no shared package between web and mobile.
export const timeAgo = (dateStr) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(dateStr).toLocaleDateString('en-NP', { day: 'numeric', month: 'short' });
};
