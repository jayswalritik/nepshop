// Same district list used across the web in multiple places (AuthPage.jsx's
// shopDistrict select, CartPage.jsx's CheckoutPage delivery-address select)
// — single shared source so signup's seller address and checkout's delivery
// address can never drift apart.
// Mirrors the web's frontend/src/utils/districts.js (NEPAL_DISTRICTS) — keep
// the two in sync. These are real districts; the earlier list mixed in city
// names (Pokhara, Butwal, Birgunj, Biratnagar, Dharan, Hetauda).
export const DISTRICTS = [
  'Kathmandu', 'Lalitpur', 'Bhaktapur', 'Kaski', 'Chitwan',
  'Rupandehi', 'Morang', 'Jhapa', 'Sunsari', 'Kavrepalanchok',
  'Makwanpur', 'Dang', 'Banke', 'Parsa', 'Gorkha',
  'Mustang', 'Solukhumbu', 'Ilam', 'Bardiya', 'Kailali', 'Other',
];
