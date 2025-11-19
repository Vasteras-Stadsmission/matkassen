-- Add display_name and avatar_url to users table
-- These fields are populated from GitHub on login and kept up-to-date
-- This eliminates the need to call GitHub API when displaying user information

ALTER TABLE "users" ADD COLUMN "display_name" varchar(255);
ALTER TABLE "users" ADD COLUMN "avatar_url" text;

-- Add helpful comment
COMMENT ON COLUMN "users"."display_name" IS 'Full name from GitHub profile, updated on each login';
COMMENT ON COLUMN "users"."avatar_url" IS 'GitHub avatar URL, updated on each login';
