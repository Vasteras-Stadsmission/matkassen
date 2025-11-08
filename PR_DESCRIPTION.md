# Track Household Creator with Nullable Field

## Summary

Track which user creates each household by storing their GitHub username in a nullable `created_by` field. This provides accountability and visibility into who is responsible for each household, with rich GitHub profile display (avatar + name) on the household details page.

## Implementation

### Database Schema

- **Migration**: Add nullable `created_by` varchar(50) column to households table
- **Semantics**: NULL represents "creator unknown" (for legacy/pre-existing households)
- **New households**: Store authenticated user's GitHub username via `session.user.githubUsername`

### Display Features

- **Household Details Page**: Show creator with GitHub avatar and display name
- **Households Table**: Added optional "Created By" column (hidden by default, user-toggleable)
- **Column Visibility**: Users can show/hide table columns with localStorage persistence
- **Fallback Display**: Shows username with icon if GitHub API data unavailable

### Technical Decisions

**Why nullable instead of NOT NULL with default "unknown"?**

- NULL is semantically correct for "unknown creator"
- Simpler code: `{createdBy && ...}` instead of `createdBy !== "unknown"`
- No magic strings - standard database practice
- Better type safety: `string | null` is clearer than special sentinel values
- No constants needed

**Code Pattern**

```typescript
// Save creator (protectedAction guarantees user exists)
created_by: session.user!.githubUsername

// Display check (nullable semantics)
{createdBy && <Avatar src={creatorGithubData?.avatar_url} />}
```

## Changes

**Database:**

- `migrations/0031_add_household_created_by.sql` - Add nullable created_by column
- `app/db/schema.ts` - Add nullable created_by field with comment

**Backend:**

- `app/[locale]/households/enroll/actions.ts` - Save creator on household creation
- `app/[locale]/households/actions.ts` - Fetch creator GitHub data

**Frontend:**

- `app/[locale]/households/[id]/components/HouseholdInfoCard.tsx` - Display creator with avatar
- `app/[locale]/households/components/HouseholdsTable.tsx` - Add creator column + visibility controls
- `app/[locale]/households/components/HouseholdsPageClient.tsx` - Add created_by to interface

**Translations:**

- `messages/en.json` & `messages/sv.json` - Add creator display strings

**Tests:**

- `__tests__/app/households/creator-tracking.test.ts` - 12 comprehensive tests covering:
    - Session username extraction
    - Nullable field semantics
    - GitHub API data fetching
    - Batch fetching with deduplication
    - Regression tests for magic string avoidance

## Testing

✅ All 806 tests passing
✅ TypeScript type checking
✅ ESLint validation
✅ Prettier formatting
✅ Security checks (server actions & API routes)

## Notes

- Existing households in production will have `created_by = NULL` (semantically correct)
- All new households will have the authenticated user's GitHub username
- Column visibility preferences persist in localStorage
- GitHub user data is cached to reduce API calls
