-- Migration 0019: Ride module security hardening — unique indexes
--
-- DEPLOY SAFETY:
--   Part 1 will RAISE EXCEPTION and halt the migration if any user currently
--   holds more than one active ride. A ride may have a wallet debit associated
--   with it so automatic cancellation is not safe without manual reconciliation.
--   If this exception fires on your environment:
--     1. Run the diagnostic query below to identify affected users.
--     2. Manually reconcile wallet debits and set stale duplicate rides to
--        'expired' or 'cancelled' in coordination with your finance team.
--     3. Re-run this migration after all duplicates are resolved.
--   Diagnostic:
--     SELECT user_id, count(*), array_agg(id ORDER BY created_at)
--     FROM rides
--     WHERE status IN ('searching','bargaining','accepted','arrived','in_transit')
--     GROUP BY user_id HAVING count(*) > 1;
--
--   Part 2 (ride_bids) auto-deduplicates safely: bid rows carry no wallet
--   balance impact so keeping the most-recent row per (ride_id, rider_id) pair
--   is financially safe.

-- ── Part 1: One active ride per customer (fail-fast on duplicates) ────────
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT user_id
    FROM rides
    WHERE status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit')
    GROUP BY user_id
    HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      '[0019] Cannot create rides uniqueness index: % user(s) have multiple '
      'active rides. Manually reconcile wallet debits and resolve duplicates, '
      'then re-run this migration.',
      dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX rides_one_active_per_user_uidx
  ON rides (user_id)
  WHERE status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit');

-- ── Part 2: One bid per rider per ride (auto-dedup, no wallet impact) ────
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT ride_id, rider_id
    FROM ride_bids
    GROUP BY ride_id, rider_id
    HAVING count(*) > 1
  LOOP
    DELETE FROM ride_bids
    WHERE ride_id  = rec.ride_id
      AND rider_id = rec.rider_id
      AND id != (
        SELECT id FROM ride_bids
        WHERE ride_id  = rec.ride_id
          AND rider_id = rec.rider_id
        ORDER BY created_at DESC
        LIMIT 1
      );
  END LOOP;
END $$;

DROP INDEX IF EXISTS ride_bids_ride_rider_uidx;
CREATE UNIQUE INDEX ride_bids_ride_rider_uidx
  ON ride_bids (ride_id, rider_id);
