-- Add privacy_policies table for GDPR compliance
-- Stores privacy policy content per language, with update tracking

CREATE TABLE IF NOT EXISTS "privacy_policies" (
    "language" varchar(5) NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp(1) with time zone DEFAULT now() NOT NULL,
    "created_by" varchar(50),
    PRIMARY KEY ("language", "created_at")
);

-- Rename SMS intent from 'consent_enrolment' to 'enrolment'
-- Since PostgreSQL doesn't support renaming enum values directly,
-- we add the new value and update existing records
ALTER TYPE "sms_intent" ADD VALUE IF NOT EXISTS 'enrolment';

-- Note: Existing 'consent_enrolment' records (if any) should be updated manually
-- UPDATE outgoing_sms SET intent = 'enrolment' WHERE intent = 'consent_enrolment';
-- The old enum value will remain but won't be used for new records
