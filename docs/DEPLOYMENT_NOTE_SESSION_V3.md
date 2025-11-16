# Deployment Note: Session Cookie Version Bump (v2 → v3)

## Overview

This deployment includes a session cookie version bump from `v2` to `v3` that will **invalidate all existing user sessions**.

## What This Means

### During Deployment
- All currently logged-in users will be automatically logged out
- Users will see the sign-in page on their next request
- No data loss or corruption will occur

### After Deployment
- Users must click "Sign in with GitHub" once to re-authenticate
- During sign-in, the system will:
  - Verify organization membership (as usual)
  - **Populate user profile data** (display_name, avatar_url) in the database
  - Issue a new session cookie with version `v3`

## Why This Change?

This deployment introduces the "creator tracking v2" feature that stores user display names and avatars in the database (previously fetched from GitHub API on-demand). The session version bump ensures:

1. **All active users get fresh profile data** - Display names and avatars populate automatically during re-authentication
2. **Historical data is preserved** - The backfill script populates data for inactive users
3. **Clean migration** - No fallback code needed, simpler architecture

## Timeline

### Before Deployment
Run the backfill script to populate profile data for historical users:

```bash
# Test first (dry run)
node scripts/backfill-user-profiles.mjs --dry-run

# Actually run it
node scripts/backfill-user-profiles.mjs
```

This ensures that:
- Historical comments from users who haven't logged in recently will show names/avatars
- Creator information for households will display correctly

### During Deployment
- Session version changes from `v2` → `v3` in 4 files:
  - `auth.ts` (main config)
  - `middleware.ts` (cookie checks)
  - `scripts/setup-e2e-auth.mjs` (E2E test setup)
  - `e2e/auth.setup.ts` (E2E test validation)

### After Deployment
1. All users will see sign-in page on next visit
2. Users click "Sign in with GitHub"
3. System populates their profile data in database
4. Comments and creator info show names/avatars going forward

## Technical Details

### Changed Files
- `auth.ts:31` - Session cookie name: `next-auth.session-token.v3`
- `middleware.ts:77,119` - Cookie lookups for v3
- `scripts/setup-e2e-auth.mjs:23,41` - E2E test cookie setup
- `e2e/auth.setup.ts:45-46` - E2E test validation

### Session Cookie Behavior
- Old cookie name: `next-auth.session-token.v2`
- New cookie name: `next-auth.session-token.v3`
- NextAuth will not find v2 cookies → treats users as logged out
- New sessions use v3 cookies

### Database Schema
User profile data stored in `users` table:
- `github_username` (unique, primary lookup)
- `display_name` (nullable, from GitHub profile)
- `avatar_url` (nullable, from GitHub profile)

Updated on every login via upsert (auth.ts:67-80).

## Impact Assessment

### User Impact
- **Disruption**: One-time inconvenience (single click to re-login)
- **Duration**: 1-2 seconds per user
- **Frequency**: Once per user after this deployment
- **Data loss**: None

### System Impact
- **Downtime**: None (zero-downtime deployment)
- **Database**: No schema changes, backfill is optional
- **Performance**: No degradation (fewer GitHub API calls actually)

## Rollback Plan

If needed, revert by changing cookie version back to `v2`:

```bash
# Revert the 4 files
git revert <commit-hash>

# Or manually change v3 → v2 in:
# - auth.ts:31
# - middleware.ts:77,119
# - scripts/setup-e2e-auth.mjs:23,41
# - e2e/auth.setup.ts:45-46

# Redeploy
```

**Note**: This would invalidate v3 sessions and restore v2 sessions (if deployed quickly enough that cookies haven't expired).

## Testing

### Pre-Deployment Testing (Staging)
1. Deploy to staging environment
2. Verify existing sessions are invalidated
3. Verify users can re-authenticate
4. Verify profile data populates in database
5. Verify comments/creator info shows names

### Post-Deployment Verification (Production)
1. Attempt to access application → redirected to sign-in ✓
2. Sign in with GitHub → successful ✓
3. Check database: `SELECT * FROM users WHERE github_username = 'yourusername'` → display_name and avatar_url populated ✓
4. View household comments → names and avatars display ✓

## Communication Template

**For Team/Users:**

> **Deployment Notice: Brief Re-Authentication Required**
>
> After the next deployment, you will need to sign in again with GitHub (one-time).
>
> **What to do:**
> 1. Visit the application
> 2. Click "Sign in with GitHub"
> 3. Done!
>
> **Why:** We're improving how user profile data is stored for better performance.
>
> **When:** [Insert deployment date/time]

## References

- NextAuth Cookie Configuration: https://next-auth.js.org/configuration/options#cookies
- Feature Implementation: Creator tracking v2 (stores user data in DB)
- Related Script: `scripts/backfill-user-profiles.mjs`
