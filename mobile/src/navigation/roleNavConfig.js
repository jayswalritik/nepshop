// Single registry mapping activeRole -> its tab navigator config. Adding a
// new supported role (seller/admin) means adding an entry here plus the
// matching screen files under app/(<role>)/ — nothing else in the
// navigation logic needs to change.
//
// `tabs[].name` must match a route file's name inside that role's
// app/(<role>)/ group (e.g. customer's "home" -> app/(customer)/home.js).
export const ROLE_NAV_CONFIG = {
  customer: {
    label: 'Customer',
    group: '(customer)',
    tabs: [
      { name: 'home', title: 'Home', icon: 'home-outline' },
      { name: 'cart', title: 'Cart', icon: 'cart-outline' },
      { name: 'orders', title: 'Orders', icon: 'receipt-outline' },
      { name: 'account', title: 'Account', icon: 'person-outline' },
    ],
    // Routes reachable from a tab (e.g. "See all"/search on Home, tapping a
    // product card) but not shown in the tab bar themselves — registered
    // with the tabs navigator via href:null in RoleTabs.js. Search moved
    // here from `tabs`: it's now reached only via Home's header search bar,
    // not a permanent bottom-bar entry.
    hiddenRoutes: ['products', 'product/[id]', 'search', 'checkout', 'order/[id]', 'wishlist'],
  },
  delivery: {
    label: 'Delivery Agent',
    group: '(delivery)',
    tabs: [
      // Icon names match what each screen's own PlaceholderScreen already
      // uses (app/(delivery)/*.js) — same choice, just also surfaced in the
      // tab bar now.
      { name: 'jobs', title: 'Available Jobs', icon: 'briefcase-outline' },
      { name: 'deliveries', title: 'My Deliveries', icon: 'navigate-outline' },
      { name: 'returns', title: 'Return Pickups', icon: 'return-down-back-outline' },
      { name: 'earnings', title: 'Earnings', icon: 'cash-outline' },
      { name: 'account', title: 'Account', icon: 'person-outline' },
    ],
  },
};

// Roles that exist in the backend's role enum but don't have an app
// experience yet — they land on the "not yet supported" screen instead.
export const UNSUPPORTED_ROLES = ['seller', 'admin'];

export const isRoleSupported = (role) => Boolean(ROLE_NAV_CONFIG[role]);

// Where to send a user right after we know their active role.
export const homeRouteForRole = (role) => {
  const config = ROLE_NAV_CONFIG[role];
  if (!config) return null;
  return `/${config.group}/${config.tabs[0].name}`;
};
