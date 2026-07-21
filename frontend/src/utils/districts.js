/**
 * Shared Nepal district list — the single source of truth for every district
 * dropdown on the web (signup's seller address, checkout's delivery address,
 * seller Settings, and the become-a-seller RoleUpgrade form).
 * frontend/src/utils/districts.js
 *
 * These are real districts. The earlier copy-pasted list mixed in city names
 * (Pokhara, Butwal, Birgunj, Biratnagar, Dharan, Hetauda) and had drifted
 * across four files; those copies now import from here instead.
 * The mobile app keeps its own mirror at mobile/src/constants/districts.js.
 *
 * `district` is a free-string field on the backend (no enum), so this list is
 * presentational only — historical records may hold older values.
 */
export const NEPAL_DISTRICTS = [
  'Kathmandu',
  'Lalitpur',
  'Bhaktapur',
  'Kaski',
  'Chitwan',
  'Rupandehi',
  'Morang',
  'Jhapa',
  'Sunsari',
  'Kavrepalanchok',
  'Makwanpur',
  'Dang',
  'Banke',
  'Parsa',
  'Gorkha',
  'Mustang',
  'Solukhumbu',
  'Ilam',
  'Bardiya',
  'Kailali',
  'Other',
];
