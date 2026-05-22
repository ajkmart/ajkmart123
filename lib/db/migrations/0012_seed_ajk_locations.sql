-- Migration: Seed hardcoded AJK fallback cities into the popular_locations table
-- so they can be managed from the Admin Panel instead of being hardcoded in source code.
-- Uses ON CONFLICT DO NOTHING so existing admin-curated entries are never overwritten.

INSERT INTO popular_locations (id, name, lat, lng, is_active, sort_order, created_at)
VALUES
  ('ajk_muzaffarabad',  'Muzaffarabad Chowk, Muzaffarabad, AJK',    34.3697, 73.4716, TRUE,  1,  NOW()),
  ('ajk_mirpur',        'Mirpur City Centre, Mirpur, AJK',           33.1413, 73.7508, TRUE,  2,  NOW()),
  ('ajk_rawalakot',     'Rawalakot Bazar, Rawalakot, AJK',           33.8572, 73.7613, TRUE,  3,  NOW()),
  ('ajk_bagh',          'Bagh City, Bagh, AJK',                      33.9732, 73.7729, TRUE,  4,  NOW()),
  ('ajk_kotli',         'Kotli Main Chowk, Kotli, AJK',              33.5152, 73.9019, TRUE,  5,  NOW()),
  ('ajk_bhimber',       'Bhimber, Mirpur, AJK',                      32.9755, 74.0727, TRUE,  6,  NOW()),
  ('ajk_poonch',        'Poonch City, Poonch, AJK',                  33.7700, 74.0954, TRUE,  7,  NOW()),
  ('ajk_neelum',        'Neelum Valley, Neelum, AJK',                34.5689, 73.8765, TRUE,  8,  NOW()),
  ('ajk_hattian',       'Hattian Bala, Hattian, AJK',                34.0523, 73.8265, TRUE,  9,  NOW()),
  ('ajk_sudhnoti',      'Sudhnoti, Sudhnoti, AJK',                   33.7457, 73.6920, TRUE,  10, NOW()),
  ('ajk_haveli',        'Haveli, Haveli, AJK',                       33.6667, 73.9500, TRUE,  11, NOW()),
  ('ajk_airport',       'Airport Rawalakot, Rawalakot, AJK',         33.8489, 73.7978, TRUE,  12, NOW()),
  ('ajk_university',    'AJK University, Muzaffarabad, AJK',         34.3601, 73.5088, TRUE,  13, NOW()),
  ('ajk_cmh',           'CMH Muzaffarabad, Muzaffarabad, AJK',       34.3660, 73.4780, TRUE,  14, NOW()),
  ('ajk_pallandri',     'Pallandri, Sudhnoti, AJK',                  33.7124, 73.9294, TRUE,  15, NOW())
ON CONFLICT (id) DO NOTHING;
