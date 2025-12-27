# SMS Delivery Status UI Implementation Plan

## Overview

This plan covers UI improvements to display SMS delivery status from HelloSMS callbacks and improve the SMS failure handling workflow.

## Backend Status: Complete

The following backend infrastructure is already implemented:

- `provider_status` and `provider_status_updated_at` columns in `outgoing_sms` table
- Webhook endpoint at `/api/webhooks/sms-status` to receive HelloSMS callbacks
- `updateSmsProviderStatus()` function in SMS service
- `SmsRecord` interface includes `providerStatus` and `providerStatusUpdatedAt`
- Integration tests for callback handling
- Index on `provider_message_id` for fast callback lookups

**Remaining work:** UI to surface this information + dismiss workflow.

---

## Failure Definition

**Internal failures** (our API call to HelloSMS failed):

- `outgoing_sms.status = 'failed'`
- Caused by: network errors, API errors, validation failures

**Provider failures** (HelloSMS couldn't deliver):

- `providerStatus = 'failed'` - Permanent failure (invalid/inactive phone number)
- `providerStatus = 'not delivered'` - Temporary failure (phone off/no signal)

**Navigation badge:** Will count BOTH internal failures AND provider failures (`failed` or `not delivered`).

---

## Provider Status Display Mapping

| Raw Value         | i18n Key                    | Badge Color | Icon |
| ----------------- | --------------------------- | ----------- | ---- |
| `delivered`       | `sms.status.delivered`      | Green       | ✓    |
| `failed`          | `sms.status.provider_failed`| Red         | ✗    |
| `not delivered`   | `sms.status.not_delivered`  | Orange      | ⚠    |
| (null, status=sent) | `sms.status.awaiting`     | Gray        | ...  |

**Note:** HelloSMS callbacks do NOT include error reasons. We only know the status, not why it failed.

---

## Resend Semantics

**Important:** UI must POST `{ action: 'resend' }` for manual retries.

Using `action: 'send'` is deduplicated by idempotency key and won't create a new SMS. The `resend` action generates a unique idempotency key to allow re-sending.

---

## Architecture Decision

**Centralized approach:** Keep SMS failure handling on the dedicated SMS Failures page rather than spreading indicators across multiple pages.

**Rationale:**

- Single source of truth for SMS problems
- Each page does one thing well
- Avoid "same action in 5 places" confusion
- Navigation badge already alerts admins to problems

**Where SMS status is shown:**
| Location | Purpose | Actions Available |
|----------|---------|-------------------|
| Navigation badge | Alert to problems | Click → SMS Failures page |
| SMS Failures page | Handle all SMS issues | Resend, dismiss, view history |
| ParcelAdminDialog | Context for specific parcel | Resend, view status |

**Note:** Navigation badge only refreshes on mount. Dismiss/resend won't instantly update it unless we add polling or manual refresh.

---

## Implementation Tasks

### 1. API: Expose Provider Status Fields

**File:** `app/api/admin/sms/parcel/[parcelId]/route.ts`

**Status:** Already returns `providerStatus` and `providerStatusUpdatedAt` via `getSmsRecordsForParcel()`.

**File:** `app/api/admin/sms/failures/route.ts`

**Changes needed:**

- Include `providerStatus` and `providerStatusUpdatedAt` in failure records
- Add query params: `status=active|dismissed`, `include_history=true`

---

### 2. ParcelAdminDialog: Show Provider Delivery Status

**File:** `components/ParcelAdminDialog.tsx`

**Current state:** Shows SMS records with status badges (queued/sending/sent/failed/retrying/cancelled)

**Changes:**

#### 2.1 Add provider status badge

Display a second badge showing delivery status when available:

- `delivered` → Green badge with checkmark
- `failed` → Red badge
- `not delivered` → Orange/yellow badge (temporary failure)
- No status yet → Gray text (i18n: `sms.status.awaiting`) - only show if status is `sent`

#### 2.2 Display format

```
Pickup Reminder
├─ Status: [Sent ✓] → [Delivered ✓]
├─ Sent: Jan 15, 10:30
├─ Delivered: Jan 15, 10:32
└─ [Send Again]
```

For provider failures:

```
Pickup Reminder
├─ Status: [Sent ✓] → [Failed ✗]
├─ Sent: Jan 15, 10:30
├─ Provider: [Failed]
└─ [Try Again]
```

**Note:** We don't have error details from HelloSMS - just the status.

#### 2.3 Multiple attempts

If multiple SMS records exist for same parcel:

- Show all records, newest first
- Label as "Attempt 1", "Attempt 2", etc. if same intent
- Collapse older attempts by default (expandable)

---

### 3. SMS Failures Page: Full Overhaul

**Files:**

- `app/[locale]/sms-failures/page.tsx`
- `app/[locale]/sms-failures/components/SmsFailuresClient.tsx`

**Current state:** Shows failed SMS for upcoming parcels with truncated error messages

**Changes:**

#### 3.1 Add "Active" vs "Dismissed" views

- Tab or toggle: "Active" | "Dismissed"
- Active = failures not yet handled
- Dismissed = marked as handled by admin

#### 3.2 Schema change: Add dismissed tracking

Add to `outgoing_sms` table in `app/db/schema.ts`:

```typescript
dismissed_at: timestamp({ precision: 1, withTimezone: true }),
dismissed_by_user_id: varchar("dismissed_by_user_id", { length: 50 }),
```

Then run: `pnpm run db:generate`

#### 3.3 Failure card improvements

Each failure card shows:

- Household name (link to household page)
- Phone number (full, not masked)
- Pickup date/time
- SMS intent (pickup_reminder, etc.)
- API status + Provider status with badges
- Timestamp of failure
- Full error message (expandable if long) - for internal failures only
- Action buttons: [Resend] [Dismiss] [View Parcel]

**Resend button must use `action: 'resend'`** to bypass idempotency deduplication.

#### 3.4 Show SMS history per failure

Expandable section showing all SMS attempts for that parcel:

- Newest first
- Each with status, timestamps, error if any
- Helps admin see if this is a recurring problem

#### 3.5 Sorting and filtering

- Default sort: Pickup date (soonest first)
- Filter options:
  - All failures
  - API failures only (our system failed)
  - Delivery failures only (HelloSMS failed)
  - By date range

#### 3.6 Dismissed view

- Shows all dismissed failures
- Can restore (un-dismiss) if needed
- Shows who dismissed and when
- Useful for auditing

---

### 4. Update Failure Count API

**File:** `app/api/admin/sms/failure-count/route.ts`

**Current:** Counts only `status = 'failed'` (internal failures)

**Change:** Also count SMS where `status = 'sent'` AND `provider_status IN ('failed', 'not delivered')`

This ensures the navigation badge reflects both internal and provider failures.

---

### 5. Confirmation Dialog Before Sending SMS

**File:** New component `components/SmsConfirmDialog.tsx`

**Trigger:** Before any SMS send/resend action

**Contents:**

```
┌─────────────────────────────────────────────┐
│ Send SMS to Household?                      │
├─────────────────────────────────────────────┤
│ Recipient: +46 70 123 4567                  │
│ Message: Pickup reminder for Jan 15         │
│                                             │
│ Previous SMS for this parcel:               │
│ ├─ Jan 14, 09:00 - Sent → Failed           │
│ └─ Jan 13, 10:30 - Sent → Delivered        │
│                                             │
│ ⚠️ An SMS was sent 5 minutes ago            │
│                                             │
│           [Cancel]  [Send SMS]              │
└─────────────────────────────────────────────┘
```

**Features:**

- Show recipient phone number
- Show message preview (or at least intent type)
- Show previous SMS attempts with delivery status
- Warning if recently sent (within 1 hour)
- Clear action buttons

**Integration:**

- Update `SmsActionButton` to open this dialog instead of sending directly
- Dialog calls API with `action: 'resend'` for manual retries

---

### 6. Type Updates

**File:** `app/utils/sms/sms-service.ts`

`SmsRecord` interface already includes:

```typescript
interface SmsRecord {
    // ... existing fields
    providerStatus?: string;          // Already present
    providerStatusUpdatedAt?: Date;   // Already present
}
```

Add for dismiss tracking:

```typescript
    dismissedAt?: Date;
    dismissedByUserId?: string;
```

---

## API Endpoints

### New/Modified Endpoints

#### PATCH `/api/admin/sms/[smsId]/dismiss`

Mark an SMS failure as dismissed.

**Request:**

```json
{ "dismissed": true }
```

**Response:**

```json
{ "success": true }
```

#### GET `/api/admin/sms/failures`

**Add query params:**

- `status=active|dismissed` (default: active)
- `include_history=true` to include all SMS for each parcel

---

## Implementation Order

1. **Schema + Migration:** Add `dismissed_at`/`dismissed_by_user_id` columns via Drizzle
2. **API updates:** Update failures endpoint, add dismiss endpoint, update failure-count
3. **ParcelAdminDialog:** Add provider status display with i18n
4. **SMS Failures page:** Overhaul with history and dismiss
5. **Confirmation dialog:** Add before sending
6. **Testing:** Integration tests for new flows

---

## Open Questions

1. **History retention:** How long to keep dismissed failures? Forever? 1 year?
2. **Bulk actions:** Allow dismissing multiple failures at once?
3. **Notifications:** Should dismissing trigger any notification/log?

---

## Not In Scope

- Red phone indicator on Household page (decided against for UX clarity)
- Automatic retry of failed SMS (HelloSMS doesn't retry, we handle manually)
- SMS opt-out handling (recipients can't reply to our one-way SMS)
