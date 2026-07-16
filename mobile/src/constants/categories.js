// Same fixed taxonomy the web hardcodes in both HomePage.jsx (with icons,
// for its category tile grid) and ProductsPage.jsx (names only, for its
// filter dropdown) — there's no /categories endpoint, this IS how the web
// derives its list. Single shared source so Home's tile grid and the
// listing screen's chip row can never drift apart.
export const CATEGORIES = [
  { name: 'Electronics', icon: '📱' },
  { name: 'Clothing', icon: '👕' },
  { name: 'Food & Grocery', icon: '🛒' },
  { name: 'Home & Kitchen', icon: '🏠' },
  { name: 'Beauty & Health', icon: '💄' },
  { name: 'Sports & Outdoors', icon: '⚽' },
  { name: 'Books & Stationery', icon: '📚' },
  { name: 'Toys & Games', icon: '🧸' },
  { name: 'Automotive', icon: '🚗' },
  { name: 'Other', icon: '📦' },
];
