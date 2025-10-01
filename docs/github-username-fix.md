# GitHub Username Authentication Fix

## Problem

**CRITICAL BUG**: The application was using GitHub display names instead of GitHub usernames for organization membership checks and database records.

### The Issue

In NextAuth with GitHub provider:
- `profile.login` during OAuth = GitHub username (e.g., `"johndoe123"`)
- `session.user.name` by default = GitHub display name (e.g., `"John Doe"`)

The code was:
1. ✅ Correctly checking `profile.login` during sign-in
2. ❌ **BUT** then using `session.user.name` in server actions and API routes
3. ❌ Passing display names like "John Doe" to GitHub API `checkOrganizationMembership()`
4. ❌ GitHub API returns 404 for "John Doe" (not a valid username)
5. ❌ **Result: All protected actions fail for users with display names**

### Impact

This bug affected:
- All server actions (`verifyServerActionAuth`)
- All household actions (`protectedHouseholdAction`)
- All API routes (`authenticateAdminRequest`)
- Database records (comments, pickup records, user preferences)

**Any GitHub user with a real name set would be unable to use the application.**

## Solution

### 1. Preserve GitHub Username in Session

Added NextAuth callbacks to capture and preserve the GitHub login:

**File: `auth.ts`**
```typescript
callbacks: {
    // JWT callback: Store GitHub login during sign-in
    async jwt({ token, profile, account }) {
        if (account?.provider === "github" && profile) {
            token.githubUsername = (profile as any).login;
        }
        return token;
    },
    // Session callback: Transfer to session
    async session({ session, token }) {
        if (token.githubUsername) {
            session.user.githubUsername = token.githubUsername;
        }
        return session;
    },
}
```

### 2. TypeScript Types

**File: `types/next-auth.d.ts`**
```typescript
declare module "next-auth" {
    interface Session {
        user: {
            githubUsername?: string;  // For API/DB operations
            name?: string | null;      // For display only
            email?: string | null;
            image?: string | null;
        };
    }
}
```

### 3. Updated All Auth Checks

Changed from `session.user.name` to `session.user.githubUsername`:

- ✅ `app/utils/auth/server-action-auth.ts`
- ✅ `app/utils/auth/api-auth.ts`
- ✅ `app/[locale]/schedule/utils/user-preferences.ts`
- ✅ `app/[locale]/households/[id]/edit/actions.ts`
- ✅ `app/api/admin/household/[householdId]/comments/route.ts`
- ✅ `app/api/admin/parcel/[parcelId]/pickup/route.ts`

## Testing

Created comprehensive test suite with **30 new tests**:

### Test Files Created

1. **`__tests__/app/auth/session-callbacks.test.ts`** (8 tests)
   - JWT callback captures `profile.login`
   - Session callback transfers `githubUsername`
   - Handles missing values gracefully
   - Full integration flow test

2. **`__tests__/app/utils/auth/server-action-auth.test.ts`** (8 tests)
   - Uses `githubUsername` for org checks
   - **REGRESSION**: User with display name authenticates
   - Handles missing username
   - Special characters in display name

3. **`__tests__/app/utils/auth/api-auth.test.ts`** (6 tests)
   - Uses `githubUsername` for org checks
   - **REGRESSION**: User with display name accesses API
   - Error handling

4. **`__tests__/app/utils/auth/username-tracking.test.ts`** (6 tests)
   - Database operations use `githubUsername`
   - User preferences work correctly
   - Comment creation uses correct field

5. **Updated `__tests__/app/auth/auth-flow.test.ts`** (2 new tests)
   - GitHub login preserved through sign-in
   - **REGRESSION**: Display names work correctly

### Test Helpers

**File: `__tests__/test-helpers.ts`**
```typescript
// Create session with different name/login
createMockSession({
    githubUsername: "johndoe123",
    name: "John Doe"
})

// The bug scenario
createMockSessionWithDisplayName()

// User without display name
createMockSessionWithoutDisplayName()

// GitHub profile from OAuth
createMockGitHubProfile({
    login: "johndoe123",
    name: "John Doe"
})
```

### Test Results

```
Test Files  50 passed (50)
Tests      420 passed (420)
```

All tests pass, including:
- ✅ Existing tests updated with new session structure
- ✅ New regression tests for the bug scenario
- ✅ Integration tests for full auth flow

## Key Test Scenarios Covered

1. **User with display name** (The bug case!)
   - Profile: `{ login: "johndoe123", name: "John Doe" }`
   - ✅ Authenticates successfully
   - ✅ Calls protected actions
   - ✅ Stores "johndoe123" in database

2. **User without display name**
   - Profile: `{ login: "johndoe123", name: null }`
   - ✅ Works identically

3. **Display name equals login**
   - Profile: `{ login: "johndoe", name: "johndoe" }`
   - ✅ Works (edge case)

4. **Special characters in display name**
   - Profile: `{ login: "user123", name: "Jöhn Döe-Smith" }`
   - ✅ Works correctly

## Verification

To verify the fix works:

1. **In code**: Check that `session.user.githubUsername` is used for:
   - Organization membership checks
   - Database record creation
   - Rate limiting keys

2. **In tests**: Run `pnpm test -- __tests__/app/auth/`
   - Should show 30+ auth-related tests passing
   - Including regression tests for display names

3. **Manually**: Have a user with a GitHub display name set:
   - Sign in to the application
   - Try to perform any action
   - Should work without 404 errors

## Migration Notes

- **No database migration needed** - we're just fixing what gets stored
- **No existing data cleanup needed** - old records with display names are just historical
- **Backward compatible** - old sessions will refresh with new field on next login
- **Type safe** - TypeScript will catch any missed conversions

## Related Files

### Core Implementation
- `auth.ts` - NextAuth configuration with callbacks
- `types/next-auth.d.ts` - TypeScript type extensions
- `app/utils/auth/server-action-auth.ts` - Server action auth
- `app/utils/auth/api-auth.ts` - API route auth

### Updated Components
- `app/[locale]/schedule/utils/user-preferences.ts`
- `app/[locale]/households/[id]/edit/actions.ts`
- `app/api/admin/household/[householdId]/comments/route.ts`
- `app/api/admin/parcel/[parcelId]/pickup/route.ts`

### Test Files
- `__tests__/app/auth/session-callbacks.test.ts`
- `__tests__/app/utils/auth/server-action-auth.test.ts`
- `__tests__/app/utils/auth/api-auth.test.ts`
- `__tests__/app/utils/auth/username-tracking.test.ts`
- `__tests__/app/auth/auth-flow.test.ts`
- `__tests__/test-helpers.ts`

## Review Comments Addressed

Original review comment:
> "app/utils/auth/server-action-auth.ts:54 – verifyServerActionAuth re-validates GitHub org membership using session.user.name. In our NextAuth setup that value is the display name when the user has one, not the GitHub login. Passing a display name to checkOrganizationMembership returns 404, so every protected server action (and every protectedHouseholdAction) will start failing for anyone with a real name set in GitHub."

**Status: ✅ FIXED**

- GitHub username now properly preserved in session
- All auth checks use `githubUsername` field
- Comprehensive tests prevent regression
- Display names work correctly
