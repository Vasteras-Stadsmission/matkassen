# Future Improvements

This document captures ideas and improvements that may be valuable in the future, but are not currently prioritized.

## i18n-Compatible Household Data

**Status:** Deferred - not a current priority
**Date Added:** 2025-11-15

### Problem

Currently, household-specific data (pets, food restrictions, allergies, etc.) are stored as free-text in Swedish. This works fine for the current use case, but creates potential issues:

- Not i18n compatible (burned-in Swedish)
- Data inconsistency (typos, variations: "hund" vs "Hund" vs "hunden")
- Harder to aggregate/report on
- Would be problematic if expanding to non-Swedish regions or volunteers

### Proposed Solution

Implement a unified review queue pattern for all household data:

1. Users enter data freely (no restrictions)
2. Entries go into admin review queue
3. Admins add EN/SV translations to create official options
4. Future users see translated options in dropdowns/autocomplete
5. Original households retroactively linked to normalized version
6. System learns from actual usage patterns

**Benefits:**

- Single consistent pattern across all data types
- Zero barriers for end users
- Gradual improvement toward i18n compatibility
- Admin controls quality when convenient
- Crowdsourced option discovery

**Implementation notes:**

- Could prioritize certain types (allergies > pets > other)
- Reuse existing checklist pattern from admin settings
- Need migration strategy for existing Swedish data

### When to Revisit

- When non-Swedish speaking staff/volunteers regularly use the system
- When expanding to other countries/languages
- When data inconsistency causes operational problems
- When there's capacity and no higher-priority work

### Why Not Now

- Everyone currently speaks Swedish
- No reported issues with current approach
- System works reliably as-is
- Other features likely have higher impact
- i18n infrastructure for UI labels is sufficient for current needs

---

_Add new ideas below this line_
