# SMS Dashboard Refactor Plan

> **Context:** This plan should be executed after the JIT SMS scheduler is merged.
> The goal is to simplify SMS visibility by removing redundant features and adding focused, minimal ones.

## Scope Decisions (Important)

Before implementing, decide these:

| Decision                     | Options                            | Recommendation                               |
| ---------------------------- | ---------------------------------- | -------------------------------------------- |
| Which intents in "failures"? | Pickup-only vs All intents         | **Pickup-only** (simplest, matches existing) |
| Time window for failures?    | 48h vs pickup window vs unresolved | **Pickup window** (matches badge count)      |
| What can be resent?          | Pickup-only vs All intents         | **Pickup-only** (existing API supports this) |

> **Note:** The existing `/api/admin/sms/failure-count` endpoint only counts failed SMS for **active, upcoming parcels** (uses inner join with food_parcels). Any new failures page should use the same scope for consistency, or the badge count won't match the failures list.

## Summary of Changes

| Action | Component                                                            |
| ------ | -------------------------------------------------------------------- |
| Remove | SMS Dashboard (full page with statistics, filtering, grouping)       |
| Remove | Schedule SMS Panel (collapsible panel on parcel cards in schedule)   |
| Modify | Existing nav badge to link to failures page instead of SMS Dashboard |
| Build  | Failed SMS page (simple list of failures with links to households)   |
| Build  | SMS History section on household page (all SMS types)                |
| Keep   | ParcelAdminDialog SMS section (already exists, no changes needed)    |
| Keep   | Slack alerts for developer notification                              |

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

## Phase 3: Update Nav Badge to Link to Failures Page

### Existing Implementation

The nav badge **already exists** in `components/HeaderSimple/HeaderSimple.tsx:50-75`. It:

- Fetches failure count on mount
- Shows a red indicator on the "SMS Dashboard" nav link when count > 0
- Currently links to `/sms-dashboard`

### Changes Needed

1. Update the link from `/sms-dashboard` to `/sms-failures`
2. Update the label to match the new page (or keep generic)

### Steps

1. In `components/HeaderSimple/HeaderSimple.tsx`, find the links array (around line 72):

```tsx
// Current
{ link: "/sms-dashboard", label: t("navigation.smsDashboard"), badge: smsFailureCount },

// Change to
{ link: "/sms-failures", label: t("navigation.smsFailures"), badge: smsFailureCount },
```

2. Add the translation key `navigation.smsFailures` to `messages/en.json` and `messages/sv.json`

3. The existing failure count API at `/api/admin/sms/failure-count/route.ts` is already correct - it counts failed SMS for active, upcoming parcels

---

## Phase 4: Build Failed SMS Page

### Location

Use the same routing convention as existing pages (no `/admin` prefix):

```
app/[locale]/sms-failures/page.tsx
```

### What It Shows

Based on the scope decision, show failed SMS for **active, upcoming parcels** (same scope as the badge count):

- Simple list of failed parcel SMS
- Each item shows:
    - Household name (link to household page)
    - Pickup date/time
    - Error message
    - "View" button → links to household page with parcel query param
- No filtering, no statistics, no grouping
- Refresh button (use router.refresh() or revalidate)

> **Note:** If you choose to show all intents including enrolment SMS, you'll need to modify the failure-count API to match, otherwise the badge count won't match the list.

### API Endpoint

Create a new simple endpoint:

```
app/api/admin/sms/failures/route.ts
```

Returns (same scope as failure-count - active parcels with upcoming pickup):

```json
{
    "failures": [
        {
            "id": "sms-123",
            "householdId": "hh-456",
            "householdName": "Andersson Family",
            "parcelId": "parcel-789",
            "pickupDateEarliest": "2025-01-15T10:00:00Z",
            "pickupDateLatest": "2025-01-15T12:00:00Z",
            "errorMessage": "Invalid phone number",
            "failedAt": "2025-01-13T10:30:00Z"
        }
    ]
}
```

### Implementation

1. Create the API route `app/api/admin/sms/failures/route.ts`:

```typescript
// Use same query pattern as failure-count to ensure consistency
const failures = await db
    .select({
        id: outgoingSms.id,
        householdId: foodParcels.household_id,
        householdName: households.name,
        parcelId: outgoingSms.parcel_id,
        pickupDateEarliest: foodParcels.pickup_date_time_earliest,
        pickupDateLatest: foodParcels.pickup_date_time_latest,
        errorMessage: outgoingSms.last_error_message,
        failedAt: outgoingSms.updated_at,
    })
    .from(outgoingSms)
    .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
    .innerJoin(households, eq(foodParcels.household_id, households.id))
    .where(
        and(
            notDeleted(),
            gte(foodParcels.pickup_date_time_latest, new Date()),
            eq(outgoingSms.status, "failed"),
        ),
    )
    .orderBy(desc(outgoingSms.updated_at));
```

2. Create the page component (use i18n for all user-facing strings):

```tsx
// app/[locale]/sms-failures/page.tsx
import { Container, Title, Paper, Stack, Text, Group, Button, Badge } from "@mantine/core";
import { Link } from "@/app/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function SmsFailuresPage() {
    const t = await getTranslations("smsFailures");

    // Fetch with no-store to ensure fresh data
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/sms/failures`, {
        cache: "no-store",
    });
    const { failures } = await response.json();

    return (
        <Container size="md" py="xl">
            <Title order={2} mb="lg">
                {t("title")}
            </Title>

            {failures.length === 0 ? (
                <Paper p="xl" withBorder>
                    <Text c="dimmed" ta="center">
                        {t("noFailures")}
                    </Text>
                </Paper>
            ) : (
                <Stack gap="sm">
                    {failures.map((failure: FailedSms) => (
                        <Paper key={failure.id} p="md" withBorder>
                            <Group justify="space-between">
                                <Stack gap="xs">
                                    <Text fw={600}>{failure.householdName}</Text>
                                    <Text size="sm" c="dimmed">
                                        {t("pickup")}: {formatDate(failure.pickupDateEarliest)}
                                    </Text>
                                    <Badge color="red" variant="light">
                                        {failure.errorMessage}
                                    </Badge>
                                </Stack>
                                <Button
                                    component={Link}
                                    href={`/households/${failure.householdId}?parcel=${failure.parcelId}`}
                                    variant="light"
                                >
                                    {t("view")}
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

3. Add translations to `messages/en.json` and `messages/sv.json`:

```json
{
    "smsFailures": {
        "title": "Failed SMS",
        "noFailures": "No failed SMS for upcoming pickups",
        "pickup": "Pickup",
        "view": "View"
    }
}
```

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

Modify `getHouseholdDetails()` in `app/[locale]/households/actions.ts` to fetch all SMS for the household:

```sql
SELECT
  s.id,
  s.intent,
  s.status,
  s.last_error_message,
  s.created_at,
  s.parcel_id,
  p.pickup_date_time_earliest,
  p.pickup_date_time_latest
FROM outgoing_sms s
LEFT JOIN food_parcels p ON s.parcel_id = p.id
WHERE s.household_id = ?
ORDER BY s.created_at DESC
LIMIT 10
```

> **Important:** The schema uses `pickup_date_time_earliest` and `pickup_date_time_latest`, NOT `pickup_date`.

### UI Changes

Add a new component or section in `HouseholdDetailsPage.tsx`:

```tsx
{
    /* SMS History */
}
{
    smsHistory.length > 0 && (
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
                                        sms.status === "sent"
                                            ? "green"
                                            : sms.status === "failed"
                                              ? "red"
                                              : sms.status === "queued"
                                                ? "blue"
                                                : "gray"
                                    }
                                    variant="light"
                                >
                                    {sms.status === "sent" && "Sent ✓"}
                                    {sms.status === "failed" && "Failed ✗"}
                                    {sms.status === "queued" && "Queued"}
                                    {sms.status === "sending" && "Sending..."}
                                </Badge>

                                {/* Resend only available for pickup_reminder - existing API limitation */}
                                {sms.status === "failed" &&
                                    sms.intent === "pickup_reminder" &&
                                    sms.parcelId && (
                                        <Button
                                            size="xs"
                                            variant="light"
                                            onClick={() => handleResendSms(sms.parcelId)}
                                        >
                                            {t("smsHistory.resend")}
                                        </Button>
                                    )}
                            </Group>
                        </Group>
                    </Paper>
                ))}
            </Stack>
        </Paper>
    );
}

// Note: The resend handler calls the existing parcel-based API
const handleResendSms = async (parcelId: string) => {
    await fetch(`/api/admin/sms/parcel/${parcelId}`, {
        method: "POST",
        body: JSON.stringify({ action: "send" }),
    });
    // Refresh data
};
```

### Helper Function

```tsx
const getIntentLabel = (intent: string): string => {
    const labels: Record<string, string> = {
        consent_enrolment: "Enrolment",
        pickup_reminder: "Pickup Reminder",
        pickup_updated: "Pickup Updated",
        pickup_cancelled: "Pickup Cancelled",
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

- `admin.smsDashboard.*` - **Check if used by ParcelAdminDialog first!** (`components/ParcelAdminDialog.tsx` and `components/SmsActionButton.tsx` use some of these)
- `schedule.sms.*` (if not used elsewhere)
- `navigation.smsDashboard` - Replace with `navigation.smsFailures`

> **Important:** The `ParcelAdminDialog` and `SmsActionButton` share some translation keys with the old dashboard. Either:
>
> 1. Keep those keys and just remove the dashboard-specific ones, OR
> 2. Move them to a generic `sms.*` namespace and update both components

### Remove Unused Components

Search for any orphaned components:

```bash
# Find unused exports
grep -r "SmsStatistics\|SmsDashboardClient\|SmsListItem" app/
```

### Update Tests and Documentation

**Tests to update/delete:**

```bash
# Find related test files
find . -name "*.test.tsx" -o -name "*.spec.ts" | xargs grep -l "SmsDashboard\|SmsManagement\|sms-dashboard"
```

Known test files that reference SMS dashboard:

- `e2e/admin.spec.ts` - Update navigation tests
- `e2e/navigation.spec.ts` - Update route assertions

**Documentation to update:**

- `docs/user-manual.md` - Remove SMS dashboard references, add sms-failures page
- `docs/user-flows.md` - Update admin workflows

---

## Known Limitations (No HelloSMS Callback Yet)

### Current State

Without delivery callbacks from HelloSMS:

- **"Sent" means "accepted by HelloSMS"**, not "delivered to recipient"
- Real delivery failures (wrong number, phone off, number disconnected) are **silent**
- We only catch API-level failures (invalid format, API down, rate limiting)

### Implications for This Refactor

| What We Can Show          | What We Can't Show       |
| ------------------------- | ------------------------ |
| API accepted the SMS      | SMS was delivered        |
| API rejected (bad format) | Phone was off            |
| API was down              | Number disconnected      |
| Retry exhausted           | Recipient blocked sender |

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
app/utils/sms/statistics.ts                          # Only used by dashboard
```

### Create

```
app/[locale]/sms-failures/page.tsx                   # Failed SMS list page (NO /admin prefix)
app/api/admin/sms/failures/route.ts                  # API for failures list
```

### Modify

```
app/[locale]/households/actions.ts                   # Add SMS history fetch
app/[locale]/households/[id]/components/HouseholdDetailsPage.tsx  # Add SMS History section
components/HeaderSimple/HeaderSimple.tsx             # Update link from /sms-dashboard to /sms-failures
messages/en.json                                     # Add smsFailures translations, update navigation
messages/sv.json                                     # Add smsFailures translations, update navigation
```

### Keep Unchanged

```
components/ParcelAdminDialog.tsx                     # Already has SMS section
components/SmsActionButton.tsx                       # Used by dialog
app/api/admin/sms/parcel/[parcelId]/route.ts        # Used by dialog and resend
app/api/admin/sms/failure-count/route.ts            # Used by nav badge (already correct)
app/utils/sms/hello-sms.ts                          # Core SMS functionality
app/utils/sms/sms-service.ts                        # Core SMS functionality
app/utils/sms/templates.ts                          # SMS templates
```

---

## Implementation Order Recommendation

The phases above are numbered for logical grouping, but **consider this alternative execution order** to avoid visibility gaps during implementation:

| Order | Phase                                   | Why This Order                      |
| ----- | --------------------------------------- | ----------------------------------- |
| 1     | Phase 4: Build failures page + API      | Build new visibility first          |
| 2     | Phase 3: Update nav to link to new page | Connect new visibility to nav       |
| 3     | Phase 5: Add household SMS history      | Complete new features               |
| 4     | Phase 1: Remove SMS dashboard           | Safe to remove - new features exist |
| 5     | Phase 2: Remove schedule SMS panel      | Clean up old features               |
| 6     | Phase 6: Cleanup                        | Final cleanup                       |

This order ensures admins never lose SMS visibility during the transition.

---

## Prompt for Claude Code CLI

When you're ready to implement, you can use this prompt:

```
I want to refactor the SMS visibility features. Please read the plan at
docs/sms-dashboard-refactor-plan.md and implement it phase by phase.

Use the recommended implementation order (build new features first, then remove old ones).
Verify build passes after each phase. Commit after each phase.
```
