# SMS Delivery Status UI Implementation Plan

## Overview

This plan covers UI improvements to display SMS delivery status from HelloSMS callbacks and improve the SMS failure handling workflow.

## Background

We have implemented:

- `provider_status` and `provider_status_updated_at` columns in `outgoing_sms` table
- Webhook endpoint at `/api/webhooks/sms-status` to receive HelloSMS callbacks
- Status values: `delivered`, `failed`, `not delivered`

Now we need to surface this information in the UI.

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

---

## Implementation Tasks

### 1. API: Expose Provider Status Fields

**File:** `app/api/admin/sms/parcel/[parcelId]/route.ts`

**Changes:**

- Ensure `provider_status` and `provider_status_updated_at` are included in SMS record response
- Already returning full SMS records, just verify fields are present

**File:** `app/api/admin/sms/failures/route.ts`

**Changes:**

- Include `provider_status` and `provider_status_updated_at` in failure records
- This enables distinguishing API failures from delivery failures

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
- No status yet → Gray text "Awaiting confirmation" (only show if status is `sent`)

#### 2.2 Display format

```
Pickup Reminder
├─ Status: [Sent ✓] → [Delivered ✓]
├─ Sent: Jan 15, 10:30
├─ Delivered: Jan 15, 10:32
└─ [Send Again]
```

For failures:

```
Pickup Reminder
├─ Status: [Sent ✓] → [Failed ✗]
├─ Sent: Jan 15, 10:30
├─ Failed: Jan 15, 10:31
├─ Error: Invalid phone number
└─ [Try Again]
```

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

Add to `outgoing_sms` table:

```sql
dismissed_at TIMESTAMP WITH TIME ZONE,
dismissed_by VARCHAR(255)  -- admin user ID/email
```

#### 3.3 Failure card improvements

Each failure card shows:

- Household name (link to household page)
- Phone number (full, not masked)
- Pickup date/time
- SMS intent (pickup_reminder, etc.)
- API status + Provider status with badges
- Timestamp of failure
- Full error message (expandable if long)
- Action buttons: [Resend] [Dismiss] [View Parcel]

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

### 4. Confirmation Dialog Before Sending SMS

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
- Or wrap it in the dialog component

---

### 5. Type Updates

**File:** `app/utils/sms/sms-service.ts`

Ensure `SmsRecord` interface includes:

```typescript
interface SmsRecord {
    // ... existing fields
    provider_status: string | null;
    provider_status_updated_at: Date | null;
    dismissed_at: Date | null;
    dismissed_by: string | null;
}
```

---

## Database Migration

New migration for dismissed tracking:

```sql
ALTER TABLE "outgoing_sms" ADD COLUMN "dismissed_at" timestamp with time zone;
ALTER TABLE "outgoing_sms" ADD COLUMN "dismissed_by" varchar(255);
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

1. **Schema + Migration:** Add dismissed_at/dismissed_by columns
2. **API updates:** Expose provider_status, add dismiss endpoint
3. **ParcelAdminDialog:** Add provider status display
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
