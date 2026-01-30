-- Migration: Add no-show follow-up dismissals table
-- This table tracks when a no-show follow-up was dismissed for a household,
-- allowing the Issues page to avoid showing follow-ups that have been reviewed.

CREATE TABLE IF NOT EXISTS noshow_followup_dismissals (
    id TEXT PRIMARY KEY DEFAULT nanoid(8),
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMP(1) WITH TIME ZONE NOT NULL DEFAULT NOW(),
    dismissed_by_user_id VARCHAR(50)
);

-- Index for efficient lookup by household
CREATE INDEX IF NOT EXISTS idx_noshow_followup_dismissals_household
    ON noshow_followup_dismissals(household_id);

-- Unique constraint to ensure only one active dismissal per household
-- (though we may update the dismissed_at when re-dismissing)
CREATE UNIQUE INDEX IF NOT EXISTS idx_noshow_followup_dismissals_household_unique
    ON noshow_followup_dismissals(household_id);
