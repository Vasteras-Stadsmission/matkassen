-- Custom SQL migration file, put your code below! --

-- Add new SMS intent types for parcel updates and cancellations
-- These values are added to support automatic SMS updates when parcels are edited/cancelled

ALTER TYPE "sms_intent" ADD VALUE IF NOT EXISTS 'pickup_updated';
ALTER TYPE "sms_intent" ADD VALUE IF NOT EXISTS 'pickup_cancelled';

-- No down migration provided as enum values cannot be safely removed without data migration
