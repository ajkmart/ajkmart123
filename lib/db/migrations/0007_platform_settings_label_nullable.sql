-- Make platform_settings.label nullable so seed inserts without label succeed
ALTER TABLE "platform_settings" ALTER COLUMN "label" DROP NOT NULL;
