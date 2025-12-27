# Test Conversion Plan: Unit Tests to Integration Tests

This document analyzes all test files and categorizes them based on whether they should:
1. **Convert to Integration** - Currently mocks DB but tests behavior that requires real DB
2. **Keep as Unit** - Tests pure logic that doesn't need real DB
3. **Already Integration** - Already uses PGlite test DB
4. **Split** - Some tests should become integration, others stay unit

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Convert to Integration | 8 | Create new `.integration.test.ts` files |
| Keep as Unit | ~75 | No changes needed |
| Already Integration | 5 | No changes needed |
| Split (partial conversion) | 4 | Extract DB-dependent tests to integration |

---

## Files to Convert to Integration Tests

### Priority 1: Heavy DB Mocking That Tests DB Behavior

#### 1. `__tests__/app/households/enroll/capacity.test.ts`
**Current State**: 100+ lines mocking `db.select()`, `notDeleted()`, and schema
**What It Tests**: Whether capacity calculations exclude soft-deleted parcels
**Why Convert**: The test only verifies `notDeletedMock` was called, not that it works correctly
**New File**: `__tests__/integration/households/capacity.integration.test.ts`
**Note**: Integration test already exists at `__tests__/integration/parcels/capacity.integration.test.ts` - this unit test can likely be deleted after verifying coverage

#### 2. `__tests__/app/api/admin/verification-questions/route.test.ts`
**Current State**: Mocks Drizzle chain and schema
**What It Tests**: That `is_active=true` filter is applied
**Why Convert**: Testing that a WHERE clause works requires real SQL
**New File**: `__tests__/integration/api/verification-questions.integration.test.ts`
**Test Cases to Convert**:
- "should filter by is_active = true"
- "should not return inactive questions"
- "should return empty array when no active questions exist"

#### 3. `__tests__/app/api/admin/sms/statistics.test.ts`
**Current State**: Mocks `db.select` with chained builder for GROUP BY
**What It Tests**: Success rate calculations from aggregated SMS data
**Why Convert**: Aggregate queries (GROUP BY, COUNT) need real SQL to verify
**New File**: `__tests__/integration/api/sms-statistics.integration.test.ts`
**Test Cases to Convert**:
- Division-by-zero guard tests
- Success rate calculations (80%, 100%, 0%)
- Location filtering

#### 4. `__tests__/app/utils/sms/opening-hours-filtering.test.ts`
**Current State**: Mocks complex 4-table JOIN query
**What It Tests**: Whether `getParcelsNeedingReminder()` joins data correctly
**Why Convert**: Complex JOINs need real DB to verify correct results
**New File**: `__tests__/integration/sms/opening-hours-filtering.integration.test.ts`
**Test Cases to Convert**:
- "should filter out parcels that are outside opening hours"
- "should include parcel when location schedule is not available"
- Tests that verify JOIN behavior

#### 5. `__tests__/app/utils/public-privacy-policy.test.ts`
**Current State**: Mocks Drizzle chain and drizzle-orm helpers
**What It Tests**: Language fallback and latest policy selection
**Why Convert**: ORDER BY + LIMIT + WHERE logic needs real SQL
**New File**: `__tests__/integration/utils/privacy-policy.integration.test.ts`
**Test Cases to Convert**:
- "should return policy when found in requested language"
- "should fallback to Swedish when requested language not found"
- "should return the latest policy based on created_at"

#### 6. `__tests__/app/utils/auth/username-tracking.test.ts`
**Current State**: Mocks db.select/update/insert with where condition tracking
**What It Tests**: GitHub username is used for DB lookups
**Why Convert**: Real DB would verify column behavior, unique constraints
**New File**: `__tests__/integration/auth/username-tracking.integration.test.ts`
**Test Cases to Convert**:
- "should use githubUsername for database lookups"
- "REGRESSION: user with display name can save preferences"
- "should fail when githubUsername is missing"

---

### Priority 2: Action Tests with Transaction Mocking

#### 7. `__tests__/app/households/parcels/location-change.test.ts`
**Current State**: Mocks `db.transaction`, insert/delete/update
**What It Tests**: Parcel location changes with upsert logic
**Why Convert**: Tests uniqueness constraints and deletion keys
**New File**: `__tests__/integration/households/parcel-location-change.integration.test.ts`
**Note**: Existing `update-parcels.integration.test.ts` may cover some cases

#### 8. `__tests__/app/households/parcels/past-parcel-prevention.test.ts`
**Current State**: Mocks `db.transaction` and insert/delete
**What It Tests**: NEW vs EXISTING parcel validation for past times
**Why Convert**: Tests transaction behavior and constraint validation
**New File**: `__tests__/integration/households/past-parcel-prevention.integration.test.ts`
**Test Cases to Convert**:
- "should reject creating a NEW parcel with a time in the past"
- "should ALLOW updating existing parcels even if their time has passed"
- "should reject SOME parcels and allow OTHERS in mixed batch"

---

## Files to Split (Partial Conversion)

These files have BOTH pure logic tests AND DB-dependent tests.

#### 1. `__tests__/app/parcels/softDeleteParcel.test.ts`
**Keep as Unit**:
- SMS cancellation decision logic (which status triggers what)
- "should cancel queued SMS silently" (logic test)
- "should send cancellation SMS when original SMS was already sent" (logic test)
**Move to Integration** (already done!):
- `__tests__/integration/parcels/soft-delete.integration.test.ts` exists

#### 2. `__tests__/app/households/parcels/actions.test.ts`
**Keep as Unit**:
- Time validation logic (future vs past)
- "should include parcels scheduled for later today"
- "should reject new parcels scheduled for past times today"
**Move to Integration**:
- Tests that verify actual DB inserts work
- Upsert/conflict behavior
**Note**: Consider if existing integration tests cover this

#### 3. `__tests__/app/utils/parcel-warnings.test.ts`
**Keep as Unit**:
- Threshold parsing logic
- `shouldWarn()` function logic
- Boundary testing
**Move to Integration**:
- "Integration with Database Mock" section - these test DB queries
**Note**: Most of this file is pure logic testing, only small section needs integration

#### 4. `__tests__/app/households/user-profile-data.test.ts`
**Current State**: Hand-built mockDb testing upsert/join behavior
**Keep as Unit**: The mapping logic tests (`githubUserData` mapping)
**Move to Integration**: The upsert behavior tests, LEFT JOIN tests
**New File**: `__tests__/integration/auth/user-profile-data.integration.test.ts`

---

## Files to Keep as Unit Tests (No Changes)

### Pure Logic Tests (No DB)

| File | What It Tests |
|------|---------------|
| `app/utils/duration-parser.test.ts` | Duration string parsing |
| `app/utils/markdown-to-html.test.ts` | Markdown conversion |
| `app/utils/sms/templates.test.ts` | SMS text generation |
| `app/utils/sms/cancellation-templates.test.ts` | Cancellation SMS text |
| `app/utils/sms/enrolment-templates.test.ts` | Enrollment SMS text |
| `app/utils/sms/phone-validation.test.ts` | Phone number validation |
| `app/utils/validation/phone-validation.test.ts` | Phone validation |
| `app/utils/validation/error-code-mapping.test.ts` | Error code mapping |
| `app/utils/validation/parcel-date-exclusion.test.ts` | Date validation |
| `app/utils/anonymization/anonymize-household.test.ts` | Anonymization logic |
| `app/utils/anonymization/date-comparison.test.ts` | Date comparison |
| `app/schedule/utils/date-utils.test.ts` | Date utilities |
| `app/schedule/utils/schedule-utils.test.ts` | Schedule utilities |
| `app/schedule/utils/schedule-validation.test.tsx` | Schedule validation |
| `app/schedule/utils/location-availability.test.ts` | Availability logic |
| `utils/date-utils-dst.test.ts` | DST handling |
| `utils/deep-equal.test.ts` | Deep equality |
| `utils/schedule/*.test.ts` | Schedule functions |
| `translations/translation-validation.test.ts` | Translation keys |

### Component Tests (React Testing Library)

| File | What It Tests |
|------|---------------|
| `app/schedule/components/*.test.tsx` | Schedule UI components |
| `app/households/enroll/components/*.test.tsx` | Enrollment forms |
| `app/households/edit/*.test.tsx` | Edit forms |
| `app/handout-locations/components/*.test.tsx` | Location components |
| `app/hooks/useActionWithNotification.test.tsx` | Hook behavior |
| `components/household-wizard/*.test.tsx` | Wizard components |
| `components/SmsActionButton.test.tsx` | SMS button |

### Auth/Middleware Tests (Mock External Services)

| File | What It Tests |
|------|---------------|
| `app/auth/auth-flow.test.ts` | Auth flow logic |
| `app/auth/session-callbacks.test.ts` | Session callbacks |
| `app/utils/auth/api-auth.test.ts` | API auth |
| `app/utils/auth/server-action-auth.test.ts` | Server action auth |
| `middleware.test.ts` | Middleware routing |

### Tests That Mock Actions (Not DB)

| File | What It Tests |
|------|---------------|
| `app/settings/parcels/actions.test.ts` | Validation logic only |
| `app/settings/general/*.test.ts` | Settings logic |
| `app/schedule/actions/schedule-actions.test.ts` | Timezone/date logic |

---

## Already Integration Tests

These files already use PGlite and need no changes:

| File | Coverage |
|------|----------|
| `integration/db-setup.integration.test.ts` | PGlite setup verification |
| `integration/factories.integration.test.ts` | Factory functions |
| `integration/parcels/capacity.integration.test.ts` | Capacity calculations |
| `integration/parcels/soft-delete.integration.test.ts` | Soft delete + SMS |
| `integration/parcels/update-parcels.integration.test.ts` | Parcel CRUD |

---

## Implementation Plan

### Phase 1: Delete Redundant Unit Tests
Some unit tests are now covered by integration tests. After verification:
- [ ] Verify `capacity.test.ts` is covered by `capacity.integration.test.ts`
- [ ] Verify `softDeleteParcel.test.ts` DB parts are covered by `soft-delete.integration.test.ts`

### Phase 2: Create New Integration Tests (Priority 1)
- [ ] `verification-questions.integration.test.ts`
- [ ] `sms-statistics.integration.test.ts`
- [ ] `opening-hours-filtering.integration.test.ts`
- [ ] `privacy-policy.integration.test.ts`
- [ ] `username-tracking.integration.test.ts`

### Phase 3: Create New Integration Tests (Priority 2)
- [ ] `parcel-location-change.integration.test.ts` (if not covered)
- [ ] `past-parcel-prevention.integration.test.ts`

### Phase 4: Split Mixed Tests
- [ ] Extract DB tests from `parcel-warnings.test.ts`
- [ ] Extract DB tests from `user-profile-data.test.ts`
- [ ] Review `actions.test.ts` for overlap with integration tests

### Phase 5: Factory Additions
New factories may be needed:
- [ ] `createTestPrivacyPolicy()`
- [ ] `createTestVerificationQuestion()`
- [ ] `createTestGlobalSetting()`

---

## Notes

### Why Keep Some Mocked Tests

Unit tests with mocks are still valuable when:
1. **Testing pure logic**: The threshold calculation in `parcel-warnings.test.ts`
2. **Testing error handling**: What happens when DB throws
3. **Testing branching logic**: SMS status → action mapping
4. **Fast feedback**: Unit tests run in <1s, integration in 5-10s

### Test Naming Convention

```
*.test.ts         → Unit tests (mocked dependencies)
*.integration.test.ts → Integration tests (real PGlite DB)
```

Vitest config already handles this via `setupFiles` based on file pattern.
