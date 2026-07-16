// Same district list used across the web in multiple places (AuthPage.jsx's
// shopDistrict select, CartPage.jsx's CheckoutPage delivery-address select)
// — single shared source so signup's seller address and checkout's delivery
// address can never drift apart.
export const DISTRICTS = [
  'Kathmandu', 'Lalitpur', 'Bhaktapur', 'Pokhara', 'Chitwan',
  'Butwal', 'Birgunj', 'Biratnagar', 'Dharan', 'Hetauda', 'Other',
];
