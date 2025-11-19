-- Add created_by column to track which GitHub user created each household
-- NULL represents unknown creator (for existing households or when creator info is unavailable)
-- Display information (name, avatar) is fetched from the users table (migration 0032)
ALTER TABLE "households" ADD COLUMN "created_by" varchar(50);
