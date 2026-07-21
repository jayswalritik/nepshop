/**
 * Shared product-category list — the single source of truth for the customer
 * Shop and Search filter dropdowns.
 * frontend/src/utils/categories.js
 *
 * These MUST stay identical to the backend Product schema's category enum
 * (backend/models/Product.js). Historically this list was copy-pasted into
 * several pages, which let the copies drift; Shop (ProductsPage) and Search
 * (SearchPage) now import from here instead of keeping their own copies.
 * (The seller pages and HomePage still keep local copies — a noted follow-up.)
 */
export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Clothing',
  'Food & Grocery',
  'Home & Kitchen',
  'Beauty & Health',
  'Sports & Outdoors',
  'Books & Stationery',
  'Toys & Games',
  'Automotive',
  'Other',
];
