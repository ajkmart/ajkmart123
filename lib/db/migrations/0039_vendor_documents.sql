-- Add vendor document photo URL columns to vendor_profiles
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS cnic_front_url TEXT;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS cnic_back_url  TEXT;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS business_doc_url TEXT;
