# SMS Dashboard Refactor Plan

> **Context:** This plan should be executed after the JIT SMS scheduler is merged.
> The goal is to simplify SMS visibility by removing redundant features and adding focused, minimal ones.

## Summary of Changes

| Action | Component |
|--------|-----------|
| Remove | SMS Dashboard (full page with statistics, filtering, grouping) |
| Remove | Schedule SMS Panel (collapsible panel on parcel cards in schedule) |
| Build | Nav badge showing failed SMS count (only visible when errors exist) |
| Build | Failed SMS page (simple list of failures with links to households) |
| Build | SMS status badge on parcel cards in household page |
| Keep | ParcelAdminDialog SMS section (already exists, no changes needed) |
| Keep | Slack alerts for developer notification |

---

## Phase 1: Remove SMS Dashboard

### Files to Delete

```
app/[locale]/sms-dashboard/
├── page.tsx
├── components/
│   ├── SmsDashboardClient.tsx
│   ├── SmsStatistics.tsx
│   └── SmsListItem.tsx
```

### API Routes to Delete

```
app/api/admin/sms/dashboard/route.ts
app/api/admin/sms/statistics/route.ts
```

### API Routes to Keep

```
app/api/admin/sms/parcel/[parcelId]/route.ts  # Used by ParcelAdminDialog
app/api/admin/sms/failure-count/route.ts       # Will be used by nav badge
app/api/admin/sms/process-queue/route.ts       # May still be needed for manual triggers
```

### Steps

1. Delete the `app/[locale]/sms-dashboard/` directory
2. Delete `app/api/admin/sms/dashboard/route.ts`
3. Delete `app/api/admin/sms/statistics/route.ts`
4. Remove any navigation links to `/sms-dashboard` (check nav components, sidebar, etc.)
5. Remove translations related to SMS dashboard in `messages/en.json` and `messages/sv.json` (keys under `admin.smsDashboard` - but check if any are reused elsewhere first)
6. Run build to verify no broken imports

---

## Phase 2: Remove Schedule SMS Panel

### Files to Delete

```
app/[locale]/schedule/components/SmsManagementPanel.tsx
app/[locale]/schedule/components/PickupCardWithSms.tsx
app/[locale]/schedule/hooks/useSmsManagement.ts
```

### Files to Modify

Any files that import `PickupCardWithSms` should use the simpler `PickupCard` instead.

### Steps

1. Search for usages of `PickupCardWithSms`:
   ```bash
   grep -r "PickupCardWithSms" app/
   ```
2. Replace with `PickupCard` in those files
3. Remove the `showSmsPanel` prop from any components
4. Delete `SmsManagementPanel.tsx`
5. Delete `PickupCardWithSms.tsx`
6. Delete `useSmsManagement.ts` (verify it's not used elsewhere first)
7. Run build to verify no broken imports

---

## Phase 3: Build Nav Badge for Failed SMS

### Location

Add to the main navigation/header component (find where nav is defined).

### Behavior

- Only visible when there are failed SMS (count > 0)
- Shows count: `[SMS: 2]` with warning color
- Clicking navigates to failed SMS page
- Fetches count on page load and periodically (every 60 seconds?)

### Implementation

1. Create a new component: `components/SmsFailureBadge.tsx`

```tsx
// Pseudocode structure
"use client";

import { useState, useEffect } from "react";
import { Badge, Indicator } from "@mantine/core";
import { IconMessage } from "@tabler/icons-react";
import { Link } from "@/app/i18n/navigation";

export function SmsFailureBadge() {
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      const res = await fetch("/api/admin/sms/failure-count");
      const data = await res.json();
      setFailureCount(data.count);
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (failureCount === 0) return null;

  return (
    <Link href="/admin/sms-failures">
      <Badge color="red" variant="filled" leftSection={<IconMessage size={14} />}>
        SMS: {failureCount}
      </Badge>
    </Link>
  );
}
```

2. Add `<SmsFailureBadge />` to the navigation component
3. Ensure the existing `/api/admin/sms/failure-count/route.ts` returns the right data (check its implementation)

---

## Phase 4: Build Failed SMS Page

### Location

```
app/[locale]/admin/sms-failures/page.tsx
```

Or simpler path if preferred:
```
app/[locale]/sms-failures/page.tsx
```

### What It Shows

- Simple list of failed SMS from last 48 hours
- **All intent types**: pickup_reminder, consent_enrolment, etc.
- Each item shows:
  - Household name (link to household page)
  - Intent type (Pickup Reminder, Enrolment, etc.)
  - Pickup date (for parcel SMS) or "Enrolment" (for non-parcel SMS)
  - Error message
  - "View" button:
    - Parcel SMS → links to household page with parcel query param
    - Enrolment SMS → links to household page
- No filtering, no statistics, no grouping
- Refresh button

### API Endpoint

Create a new simple endpoint or modify existing:

```
app/api/admin/sms/failures/route.ts
```

Returns:
```json
{
  "failures": [
    {
      "id": "sms-123",
      "householdId": "hh-456",
      "householdName": "Andersson Family",
      "intent": "pickup_reminder",
      "parcelId": "parcel-789",
      "pickupDate": "2025-01-15",
      "errorMessage": "Invalid phone number",
      "failedAt": "2025-01-13T10:30:00Z"
    },
    {
      "id": "sms-456",
      "householdId": "hh-789",
      "householdName": "Johansson Family",
      "intent": "consent_enrolment",
      "parcelId": null,
      "pickupDate": null,
      "errorMessage": "Number no longer in service",
      "failedAt": "2025-01-13T09:15:00Z"
    }
  ]
}
```

### Implementation

1. Create the API route `app/api/admin/sms/failures/route.ts`:
   - Query `outgoing_sms` where status = 'failed' and created_at > now - 48 hours
   - Join with households and food_parcels to get names and dates

2. Create the page component:

```tsx
// Pseudocode structure for app/[locale]/admin/sms-failures/page.tsx
import { Container, Title, Paper, Stack, Text, Group, Button, Badge } from "@mantine/core";
import { Link } from "@/app/i18n/navigation";

// Server component that fetches data
export default async function SmsFailuresPage() {
  const failures = await fetchFailures(); // Implement this

  return (
    <Container size="md" py="xl">
      <Title order={2} mb="lg">Failed SMS</Title>

      {failures.length === 0 ? (
        <Paper p="xl" withBorder>
          <Text c="dimmed" ta="center">No failed SMS in the last 48 hours</Text>
        </Paper>
      ) : (
        <Stack gap="sm">
          {failures.map(failure => (
            <Paper key={failure.id} p="md" withBorder>
              <Group justify="space-between">
                <Stack gap="xs">
                  <Text fw={600}>{failure.householdName}</Text>
                  <Text size="sm" c="dimmed">Pickup: {failure.pickupDate}</Text>
                  <Badge color="red" variant="light">{failure.errorMessage}</Badge>
                </Stack>
                <Button
                  component={Link}
                  href={`/households/${failure.householdId}?parcel=${failure.parcelId}`}
                  variant="light"
                >
                  View
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
    </Container>
  );
}
```

3. Add translations for the page title and empty state

---

## Phase 5: Add SMS History Section to Household Page

### What It Shows

A single SMS section showing **all SMS history** for the household:
- Enrolment SMS (consent_enrolment)
- Pickup reminder SMS (pickup_reminder)
- Any other SMS types

This gives admins one place to see everything SMS-related for a household.

### Visual Design

```
┌─────────────────────────────────────────────────────────┐
│ SMS History                                             │
├─────────────────────────────────────────────────────────┤
│ Enrolment              Jan 10      [Sent ✓]             │
│                                                         │
│ Pickup Reminder        Jan 15      [Sent ✓]             │
│   └─ Parcel: Mon 2025-01-15                             │
│                                                         │
│ Pickup Reminder        Jan 22      [Failed ✗]  [Resend] │
│   └─ Parcel: Mon 2025-01-22                             │
│   └─ Error: Invalid phone number                        │
└─────────────────────────────────────────────────────────┘
```

### Files to Modify

```
app/[locale]/households/[id]/components/HouseholdDetailsPage.tsx
app/[locale]/households/actions.ts - getHouseholdDetails()
```

### Backend Changes

Modify `getHouseholdDetails()` to fetch all SMS for the household:

```sql
SELECT
  s.id,
  s.intent,
  s.status,
  s.last_error_message,
  s.created_at,
  s.parcel_id,
  p.pickup_date
FROM outgoing_sms s
LEFT JOIN food_parcels p ON s.parcel_id = p.id
WHERE s.household_id = ?
ORDER BY s.created_at DESC
LIMIT 10
```

### UI Changes

Add a new component or section in `HouseholdDetailsPage.tsx`:

```tsx
{/* SMS History */}
{smsHistory.length > 0 && (
  <Paper withBorder p="lg" radius="md">
    <Title order={3} size="h4" mb="md">
      SMS History ({smsHistory.length})
    </Title>
    <Stack gap="sm">
      {smsHistory.map(sms => (
        <Paper key={sms.id} p="sm" withBorder radius="sm">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={4} style={{ flex: 1 }}>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {getIntentLabel(sms.intent)}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatDate(sms.createdAt)}
                </Text>
              </Group>

              {/* Show parcel info for pickup reminders */}
              {sms.parcelId && sms.pickupDate && (
                <Text size="xs" c="dimmed">
                  Parcel: {formatDate(sms.pickupDate)}
                </Text>
              )}

              {/* Show error message for failures */}
              {sms.status === "failed" && sms.lastErrorMessage && (
                <Text size="xs" c="red">
                  {sms.lastErrorMessage}
                </Text>
              )}
            </Stack>

            <Group gap="xs">
              <Badge
                color={
                  sms.status === "sent" ? "green" :
                  sms.status === "failed" ? "red" :
                  sms.status === "queued" ? "blue" :
                  "gray"
                }
                variant="light"
              >
                {sms.status === "sent" && "Sent ✓"}
                {sms.status === "failed" && "Failed ✗"}
                {sms.status === "queued" && "Queued"}
                {sms.status === "sending" && "Sending..."}
              </Badge>

              {sms.status === "failed" && (
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => handleResendSms(sms.id)}
                >
                  Resend
                </Button>
              )}
            </Group>
          </Group>
        </Paper>
      ))}
    </Stack>
  </Paper>
)}
```

### Helper Function

```tsx
const getIntentLabel = (intent: string): string => {
  const labels: Record<string, string> = {
    "consent_enrolment": "Enrolment",
    "pickup_reminder": "Pickup Reminder",
    "pickup_updated": "Pickup Updated",
    "pickup_cancelled": "Pickup Cancelled",
  };
  return labels[intent] || intent;
};
```

### Steps

1. Modify `getHouseholdDetails()` in `app/[locale]/households/actions.ts` to fetch all SMS for household
2. Add SMS history section to `HouseholdDetailsPage.tsx`
3. Add resend functionality (can reuse existing API endpoint)
4. Add translations for intent labels and section title
5. Test with households that have various SMS (sent, failed, enrolment, pickup)

---

## Phase 6: Cleanup

### Remove Unused Translations

Check and clean up translation keys in:
- `messages/en.json`
- `messages/sv.json`

Keys that may be removable (verify first):
- `admin.smsDashboard.*` (if not used by ParcelAdminDialog)
- `schedule.sms.*` (if not used elsewhere)

### Remove Unused Components

Search for any orphaned components:
```bash
# Find unused exports
grep -r "SmsStatistics\|SmsDashboardClient\|SmsListItem" app/
```

### Update Tests

Delete or update any tests related to:
- SMS Dashboard
- Schedule SMS Panel
- SMS Statistics

```bash
# Find related test files
find . -name "*.test.tsx" -o -name "*.spec.ts" | xargs grep -l "SmsDashboard\|SmsManagement"
```

---

## Known Limitations (No HelloSMS Callback Yet)

### Current State

Without delivery callbacks from HelloSMS:
- **"Sent" means "accepted by HelloSMS"**, not "delivered to recipient"
- Real delivery failures (wrong number, phone off, number disconnected) are **silent**
- We only catch API-level failures (invalid format, API down, rate limiting)

### Implications for This Refactor

| What We Can Show | What We Can't Show |
|------------------|-------------------|
| API accepted the SMS | SMS was delivered |
| API rejected (bad format) | Phone was off |
| API was down | Number disconnected |
| Retry exhausted | Recipient blocked sender |

### Recommendations

1. **Consider adding a tooltip** on "Sent" badge: "Sent to provider. Delivery not confirmed."
2. **Design for future callbacks**: Keep `status` field extensible for `delivered`, `undelivered` values
3. **Accept the limitation**: Until callbacks are implemented, household complaints remain the main way to discover delivery issues

### When Callbacks Are Implemented (Future)

1. Add new statuses: `delivered`, `undelivered`
2. Update failed SMS list to include `undelivered`
3. Update badges: green ✓ only for `delivered`, yellow ? for `sent` (pending confirmation)
4. Add webhook endpoint to receive HelloSMS callbacks

---

## Testing Checklist

After implementation, verify:

- [ ] Nav badge shows nothing when no failures
- [ ] Nav badge shows count and links to failures page when failures exist
- [ ] Failed SMS page lists failures with correct info (both parcel and enrolment SMS)
- [ ] Clicking "View" on failures page goes to household page
- [ ] Household page shows SMS History section with all SMS (enrolment + pickup)
- [ ] SMS History shows correct status badges (green=sent, red=failed, blue=queued)
- [ ] SMS History shows error message for failed SMS
- [ ] SMS History shows parcel date for pickup reminder SMS
- [ ] Can resend failed SMS from household page SMS History section
- [ ] Clicking parcel on household page opens dialog with SMS details
- [ ] Can resend SMS from ParcelAdminDialog (still works)
- [ ] No broken links to old dashboard
- [ ] No console errors from removed components
- [ ] Build passes
- [ ] All routes load without error

---

## Files Summary

### Delete

```
app/[locale]/sms-dashboard/                          # Entire directory
app/[locale]/schedule/components/SmsManagementPanel.tsx
app/[locale]/schedule/components/PickupCardWithSms.tsx
app/[locale]/schedule/hooks/useSmsManagement.ts
app/api/admin/sms/dashboard/route.ts
app/api/admin/sms/statistics/route.ts
```

### Create

```
app/[locale]/admin/sms-failures/page.tsx             # Failed SMS list page
app/api/admin/sms/failures/route.ts                  # API for failures list
components/SmsFailureBadge.tsx                       # Nav badge component
```

### Modify

```
app/[locale]/households/actions.ts                   # Add SMS status to parcel query
app/[locale]/households/[id]/components/ParcelCard.tsx    # Add SMS badge
app/[locale]/households/[id]/components/ParcelList.tsx    # Pass SMS status
components/Navigation.tsx (or wherever nav is)       # Add SmsFailureBadge
```

### Keep Unchanged

```
components/ParcelAdminDialog.tsx                     # Already has SMS section
components/SmsActionButton.tsx                       # Used by dialog
app/api/admin/sms/parcel/[parcelId]/route.ts        # Used by dialog
app/api/admin/sms/failure-count/route.ts            # Used by nav badge
```

---

## Prompt for Claude Code CLI

When you're ready to implement, you can use this prompt:

```
I want to refactor the SMS visibility features. Please read the plan at
docs/sms-dashboard-refactor-plan.md and implement it phase by phase.

Start with Phase 1 (removing SMS Dashboard), verify build passes,
then move to Phase 2, and so on. Commit after each phase.
```
