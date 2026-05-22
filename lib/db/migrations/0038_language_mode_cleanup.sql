-- Migrate existing rows using removed language codes to "en"
-- Cast to text first to avoid enum cast errors on values that don't exist in enum
UPDATE user_settings SET language = 'en' WHERE language::text IN ('en_roman', 'en_ur');

-- Recreate enum without the removed values
-- PostgreSQL doesn't support DROP VALUE so we rename + recreate
CREATE TYPE language_mode_new AS ENUM ('en', 'ur', 'roman');

ALTER TABLE user_settings
  ALTER COLUMN language DROP DEFAULT;

ALTER TABLE user_settings
  ALTER COLUMN language TYPE language_mode_new
  USING language::text::language_mode_new;

ALTER TABLE user_settings
  ALTER COLUMN language SET DEFAULT 'en';

DROP TYPE language_mode;
ALTER TYPE language_mode_new RENAME TO language_mode;
