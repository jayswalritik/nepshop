// Same math as frontend's getDiscountedPrice/getDisplayPrice — the API
// stores discount as a percentage on the product, not a pre-computed price.
export const getDisplayPrice = (product) =>
  product.discount > 0
    ? Math.round(product.price - (product.price * product.discount) / 100)
    : product.price;

export const formatRs = (amount) => `Rs ${Number(amount).toLocaleString('en-US')}`;
