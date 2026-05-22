-- Migration 0018: Add foreign key constraints to all tables
-- Matches Drizzle schema .references() declarations

-- orders
ALTER TABLE orders
  ADD CONSTRAINT orders_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT orders_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT orders_vendor_id_fk FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT orders_assigned_rider_id_fk FOREIGN KEY (assigned_rider_id) REFERENCES users(id) ON DELETE SET NULL;

-- rides
ALTER TABLE rides
  ADD CONSTRAINT rides_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT rides_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT rides_dispatched_rider_id_fk FOREIGN KEY (dispatched_rider_id) REFERENCES users(id) ON DELETE SET NULL;

-- ride_bids
ALTER TABLE ride_bids
  ADD CONSTRAINT ride_bids_ride_id_fk FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  ADD CONSTRAINT ride_bids_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE;

-- wallet_transactions
ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_txn_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- notifications
ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- reviews
ALTER TABLE reviews
  ADD CONSTRAINT reviews_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT reviews_vendor_id_fk FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT reviews_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE SET NULL;

-- saved_addresses
ALTER TABLE saved_addresses
  ADD CONSTRAINT saved_addresses_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- user_settings
ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- rider_profiles
ALTER TABLE rider_profiles
  ADD CONSTRAINT rider_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- vendor_profiles
ALTER TABLE vendor_profiles
  ADD CONSTRAINT vendor_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- refresh_tokens
ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- live_locations
ALTER TABLE live_locations
  ADD CONSTRAINT live_locations_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ride_ratings
ALTER TABLE ride_ratings
  ADD CONSTRAINT ride_ratings_ride_id_fk FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  ADD CONSTRAINT ride_ratings_customer_id_fk FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT ride_ratings_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE;

-- rider_penalties
ALTER TABLE rider_penalties
  ADD CONSTRAINT rider_penalties_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE;

-- pharmacy_orders
ALTER TABLE pharmacy_orders
  ADD CONSTRAINT pharmacy_orders_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT pharmacy_orders_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE SET NULL;

-- parcel_bookings
ALTER TABLE parcel_bookings
  ADD CONSTRAINT parcel_bookings_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT parcel_bookings_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE SET NULL;

-- products
ALTER TABLE products
  ADD CONSTRAINT products_vendor_id_fk FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE CASCADE;

-- product_variants
ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_product_id_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- login_history
ALTER TABLE login_history
  ADD CONSTRAINT login_history_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- user_sessions
ALTER TABLE user_sessions
  ADD CONSTRAINT user_sessions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- magic_link_tokens
ALTER TABLE magic_link_tokens
  ADD CONSTRAINT magic_link_tokens_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- wishlist
ALTER TABLE wishlist
  ADD CONSTRAINT wishlist_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT wishlist_product_id_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- location_logs
ALTER TABLE location_logs
  ADD CONSTRAINT location_logs_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- user_interactions
ALTER TABLE user_interactions
  ADD CONSTRAINT user_interactions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT user_interactions_product_id_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- ride_event_logs
ALTER TABLE ride_event_logs
  ADD CONSTRAINT ride_event_logs_ride_id_fk FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  ADD CONSTRAINT ride_event_logs_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE;

-- ride_notified_riders
ALTER TABLE ride_notified_riders
  ADD CONSTRAINT ride_notified_riders_ride_id_fk FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  ADD CONSTRAINT ride_notified_riders_rider_id_fk FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE;

-- push_subscriptions
ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- school_subscriptions
ALTER TABLE school_subscriptions
  ADD CONSTRAINT school_subs_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT school_subs_route_id_fk FOREIGN KEY (route_id) REFERENCES school_routes(id) ON DELETE CASCADE;

-- promo_codes
ALTER TABLE promo_codes
  ADD CONSTRAINT promo_codes_vendor_id_fk FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE SET NULL;

-- auth_audit_log
ALTER TABLE auth_audit_log
  ADD CONSTRAINT auth_audit_log_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
