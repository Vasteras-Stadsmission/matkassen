# Implementation Plan: SMS When Food Parcels End + Unified Issues Page

## Overview

1. Send an SMS to households 48 hours after their last food parcel outcome (picked up or no-show) when they have no upcoming parcels scheduled
2. Create a unified Issues page as the admin landing page for all system health items

---

## 1. Database Changes (Simplified Approach)

### 1.1 Add No-Show Tracking

**Rationale:** Instead of a complex state enum refactor that touches `notDeleted()`, partial unique indexes, and upsert logic, we add simple columns alongside existing fields.

**Keep existing columns unchanged:**
- `is_picked_up`, `picked_up_at`, `picked_up_by_user_id`
- `deleted_at`, `deleted_by_user_id` (soft-delete is a separate concern)

### 1.2 Drizzle Schema Update

Update `app/db/schema.ts`:

```typescript
export const foodParcels = pgTable("food_parcels", {
    // ... existing columns unchanged ...
    no_show_at: timestamp({ precision: 1, withTimezone: true }),
    no_show_by_user_id: varchar("no_show_by_user_id", { length: 50 }),
});

// Add new SMS intent to existing enum
export const smsIntentEnum = pgEnum("sms_intent", [
    "pickup_reminder",
    "pickup_updated",
    "pickup_cancelled",
    "consent_enrolment",
    "enrolment",
    "food_parcels_ended",  // New
]);
```

### 1.3 Generate Migration

```bash
pnpm drizzle-kit generate
```

This generates migration files in `drizzle/migrations/`. The generated SQL will include:
- `ALTER TABLE food_parcels ADD COLUMN no_show_at ...`
- `ALTER TABLE food_parcels ADD COLUMN no_show_by_user_id ...`
- `ALTER TYPE sms_intent ADD VALUE 'food_parcels_ended'`

**No manual data migration needed** - new columns are nullable, existing rows remain unchanged.

### 1.4 Data Integrity Constraints

Add application-level validation to ensure mutual exclusivity:

```typescript
// In server actions that mark parcels
function validateParcelState(parcel: {
    is_picked_up: boolean;
    picked_up_at: Date | null;
    no_show_at: Date | null;
}) {
    // Cannot be both picked up AND no-show
    if (parcel.is_picked_up && parcel.no_show_at !== null) {
        throw new Error("Parcel cannot be both picked up and no-show");
    }
    // If picked up, must have timestamp
    if (parcel.is_picked_up && parcel.picked_up_at === null) {
        throw new Error("Picked up parcel must have picked_up_at timestamp");
    }
    // If no-show, must not be picked up
    if (parcel.no_show_at !== null && parcel.is_picked_up) {
        throw new Error("No-show parcel cannot be marked as picked up");
    }
}
```

### 1.5 Terminal State Logic

```typescript
// A parcel has terminal state if:
const hasTerminalState = parcel.is_picked_up || parcel.no_show_at !== null;

// Terminal timestamp (when outcome was recorded)
const terminalTimestamp = parcel.is_picked_up
    ? parcel.picked_up_at
    : parcel.no_show_at;

// Unresolved parcel = pickup DATE has passed, no terminal state, not deleted
// NOTE: Date-based, not time-based! A same-day parcel is not unresolved.
const isUnresolved =
    parcel.pickup_date_time_latest::date < CURRENT_DATE &&
    !parcel.is_picked_up &&
    parcel.no_show_at === null &&
    parcel.deleted_at === null;
```

---

## 2. SMS Sending: Pure JIT (No Queue)

### 2.1 Rationale

JIT is better than queue-based for this use case:
- No stale data - query criteria evaluated at send time, not 48h earlier
- Simpler logic - no send-time revalidation needed
- Self-healing - if scheduler was down, catches up on next run
- Matches existing `processRemindersJIT()` pattern

### 2.2 Implementation

```typescript
// app/utils/sms/sms-service.ts
export async function processFoodParcelsEndedJIT() {
    const eligible = await getHouseholdsForEndedNotification();

    for (const household of eligible) {
        // Insert SMS record with "sending" status
        const smsId = await createEndedSmsRecord(household);

        try {
            await sendSms(household);
            await markSmsSent(smsId);
        } catch (error) {
            await markSmsFailed(smsId, error);
        }
    }
}
```

**Note:** Since this runs on a single VPS with the existing `smsProcessingInFlight` lock, we don't need atomic claiming with `INSERT ON CONFLICT`. The `NOT EXISTS` check in the query provides idempotency - once an SMS record exists, that household won't be returned in future queries.

### 2.3 Eligibility Query

```sql
WITH latest_terminal_parcel AS (
    -- Get the most recent terminal parcel per household
    SELECT DISTINCT ON (fp.household_id)
        fp.household_id,
        fp.id as parcel_id,
        CASE
            WHEN fp.is_picked_up THEN fp.picked_up_at
            ELSE fp.no_show_at
        END as terminal_at
    FROM food_parcels fp
    WHERE fp.deleted_at IS NULL
      AND (fp.is_picked_up = true OR fp.no_show_at IS NOT NULL)
    ORDER BY fp.household_id,
             CASE WHEN fp.is_picked_up THEN fp.picked_up_at ELSE fp.no_show_at END DESC NULLS LAST
),
households_with_unresolved AS (
    -- Households that have unresolved parcels (should NOT get "ended" SMS)
    SELECT DISTINCT household_id
    FROM food_parcels
    WHERE deleted_at IS NULL
      AND is_picked_up = false
      AND no_show_at IS NULL
      AND (pickup_date_time_latest AT TIME ZONE 'Europe/Stockholm')::date < CURRENT_DATE
)
SELECT
    h.id as household_id,
    h.phone_number,
    h.locale,
    ltp.parcel_id as last_parcel_id,
    ltp.terminal_at
FROM households h
JOIN latest_terminal_parcel ltp ON ltp.household_id = h.id
WHERE
    -- Not anonymized
    h.anonymized_at IS NULL

    -- Has valid phone number
    AND h.phone_number IS NOT NULL

    -- Terminal state was set 48+ hours ago
    AND ltp.terminal_at <= NOW() - INTERVAL '48 hours'

    -- No future parcels (date-based: pickup date >= today)
    AND NOT EXISTS (
        SELECT 1 FROM food_parcels upcoming
        WHERE upcoming.household_id = h.id
        AND upcoming.deleted_at IS NULL
        AND (upcoming.pickup_date_time_latest AT TIME ZONE 'Europe/Stockholm')::date >= CURRENT_DATE
    )

    -- No unresolved parcels (must resolve all before sending "ended")
    AND h.id NOT IN (SELECT household_id FROM households_with_unresolved)

    -- Idempotency: no existing SMS for this parcel ending
    AND NOT EXISTS (
        SELECT 1 FROM outgoing_sms sms
        WHERE sms.idempotency_key = 'food_parcels_ended|' || h.id::text || '|' || ltp.parcel_id::text
    )
ORDER BY ltp.terminal_at ASC;
```

### 2.4 Idempotency Key

Format: `food_parcels_ended|{householdId}|{lastParcelId}`

This allows:
- One SMS per "ending cycle"
- Re-sending if household is re-enrolled and ends again (different parcel ID)

### 2.5 Integration with Scheduler

```typescript
// app/utils/scheduler.ts
async function processSmsJIT() {
    await processRemindersJIT();
    await processQueuedSms();
    await processFoodParcelsEndedJIT();  // New
}
```

---

## 3. SMS Template

### 3.1 New Template Function

```typescript
// app/utils/sms/templates.ts

/**
 * Generate SMS for when household has no more food parcels planned.
 * Uses simple, dignity-preserving language.
 *
 * Character limits:
 * - GSM-7 (Latin scripts): ≤120 chars
 * - UCS-2 (non-Latin scripts): ≤70 chars
 */
export function formatFoodParcelsEndedSms(locale: SupportedLocale): string {
    switch (locale) {
        // ... all locales
    }
}
```

### 3.2 Messages by Locale

**GSM-7 Languages (≤120 chars):**

| Locale | Message | Chars |
|--------|---------|-------|
| sv | `Inga fler matpaket planerade. Frågor? Kontakta oss.` | 51 |
| en | `No more food pickups planned. Questions? Contact us.` | 53 |
| es | `No hay mas recogidas de comida. Preguntas? Contactenos.` | 57 |
| fr | `Plus de collectes prevues. Questions? Contactez-nous.` | 54 |
| de | `Keine Abholungen mehr geplant. Fragen? Kontaktieren Sie uns.` | 61 |
| fi | `Ei ruokanoutoja. Kysymyksia? Ota yhteytta.` | 43 |
| it | `Nessun ritiro previsto. Domande? Contattateci.` | 47 |
| pl | `Brak kolejnych odbiorow. Pytania? Skontaktuj sie.` | 50 |
| ku | `Xwarin nemaye. Pirs? Peywendi bi me re.` | 40 |
| so | `Cunto kale lama qorshaysan. Suaalo? Nala xiriir.` | 49 |
| sw | `Hakuna chakula kingine. Maswali? Wasiliana nasi.` | 49 |

**UCS-2 Languages (≤70 chars):**

| Locale | Message | Chars |
|--------|---------|-------|
| ar | `لا مواعيد استلام أخرى. أسئلة؟ اتصلوا بنا.` | 41 |
| fa | `برنامه دیگری نیست. سوال؟ تماس بگیرید.` | 37 |
| el | `Δεν υπάρχουν άλλες παραλαβές. Ερωτήσεις; Επικοινωνήστε.` | 56 |
| uk | `Видач більше немає. Питання? Зв'яжіться.` | 41 |
| ru | `Выдач больше нет. Вопросы? Свяжитесь.` | 38 |
| ka | `აღარ არის დაგეგმილი. კითხვები? დაგვიკავშირდით.` | 46 |
| th | `ไม่มีรับอาหารอีก คำถาม? ติดต่อเรา` | 32 |
| vi | `Không còn nhận thực phẩm. Hỏi? Liên hệ.` | 40 |

**Note:** Messages use simple, everyday language for dignity. Avoid formal humanitarian terminology.

---

## 4. Unified Issues Page (Admin Landing Page)

### 4.1 Design Principles

- **Mobile-first:** Card-based layout, works on any screen
- **Single page:** All issue types in one place (scales to future types)
- **Inline actions:** Resolve issues without page navigation
- **Progressive disclosure:** Complex forms (reschedule) expand inline

### 4.2 Route

`/[locale]/admin` - This IS the landing page after login

### 4.3 Issue Types

| Type | Condition | Actions |
|------|-----------|---------|
| Unresolved parcels | Pickup DATE < today, no outcome set | [Picked up] [No-show] |
| Outside opening hours | Parcel scheduled outside location hours | [Cancel parcel] [Reschedule] |
| SMS failures | `status = 'failed'` | [Retry] [Dismiss] [Edit household →] |

**Important:** "Unresolved" uses DATE comparison, not timestamp. A parcel scheduled today with a passed time window is NOT unresolved yet - staff has until end of day.

### 4.4 Page Layout

```
┌─────────────────────────────────────────────────┐
│  Issues                                         │
│  ─────────────────────────────────────────────  │
│  [All (15)] [Parcels (10)] [SMS (5)]           │
│                                                 │
│  UNRESOLVED PARCELS                             │
│  ┌─────────────────────────────────────────┐   │
│  │ 📦 Andersson family  ←── link to        │   │
│  │    Dec 15, 12:00-14:00 · Centrum        │   │
│  │    [Picked up] [No-show]                │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  OUTSIDE OPENING HOURS                          │
│  ┌─────────────────────────────────────────┐   │
│  │ 📦 Berg family                          │   │
│  │    Dec 20, 10:00-12:00 · Centrum        │   │
│  │    (Location opens 12:00)               │   │
│  │    [Cancel parcel] [Reschedule]         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  SMS FAILURES                                   │
│  ┌─────────────────────────────────────────┐   │
│  │ 📱 Eriksson family                      │   │
│  │    "Invalid phone number"               │   │
│  │    [Retry] [Dismiss] [Edit household →] │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ─────────────────────────────────────────────  │
│  Quick links: [Schedule] [Households] [SMS]    │
└─────────────────────────────────────────────────┘
```

### 4.5 Empty State

```
┌─────────────────────────────────────────────────┐
│  Issues                                         │
│  ─────────────────────────────────────────────  │
│  ✓ All clear! No issues need attention.        │
│                                                 │
│  Quick links: [Schedule] [Households] [SMS]    │
└─────────────────────────────────────────────────┘
```

### 4.6 Card Interactions

**Household name:** Clickable link to `/households/[id]`

**Inline actions (no navigation):**
- [Picked up] → marks parcel `is_picked_up = true`, sets `picked_up_at`, card disappears
- [No-show] → sets `no_show_at`, card disappears
- [Retry] → retries SMS with SAME idempotency key (updates existing record), shows result inline
- [Dismiss] → sets `dismissed_at` and `dismissed_by_user_id`, card disappears
- [Cancel parcel] → confirmation dialog, then soft-deletes parcel

**Navigation actions:**
- [Edit household →] → links to `/households/[id]/edit` (for fixing phone number)

**Inline expansion (form appears in card):**
- [Reschedule] → expands to show calendar + time picker

### 4.7 Reschedule Inline Expansion

When user clicks [Reschedule], the card expands:

```
┌─────────────────────────────────────────────────┐
│ 📦 Berg family                                  │
│    Dec 20, 10:00-12:00 · Centrum               │
│                                                 │
│    ┌───────────────────────────────────┐       │
│    │       December 2025        < >    │       │
│    │  Mo Tu We Th Fr Sa Su      W      │       │
│    │  16 17 18 19 20 21 22      51     │       │
│    │  23 24 25 26 27 28 29      52     │       │
│    │  30 31  1  2  3  4  5      1      │       │
│    └───────────────────────────────────┘       │
│                                                 │
│    Time: [12:00-14:00 ▼]  ← available slots    │
│                                                 │
│    [Cancel] [Save]                              │
└─────────────────────────────────────────────────┘
```

**Calendar implementation:**
- Reuse style from `/households/[id]/parcels` page
- Grey out unavailable dates (no opening hours, location closed)
- Show week numbers
- Single month view (continuous)
- **Must use parcel's `pickup_location_id`** to determine availability

**Time dropdown:**
- Only shows available slots for selected date at the parcel's location
- Updates when date changes

**Data flow:**
```typescript
// RescheduleInline receives:
interface RescheduleProps {
    parcelId: string;
    householdId: string;
    currentDate: Date;
    currentTimeSlot: string;
    pickupLocationId: string;  // Required for availability lookup
}
```

---

## 5. Internationalization (i18n)

### 5.1 Admin UI Translations

Add translations for English and Swedish:

| Key | English | Swedish |
|-----|---------|---------|
| `issues.title` | Issues | Problem |
| `issues.allClear` | All clear! No issues need attention. | Allt klart! Inga problem att åtgärda. |
| `issues.tabs.all` | All | Alla |
| `issues.tabs.parcels` | Parcels | Paket |
| `issues.tabs.sms` | SMS | SMS |
| `issues.unresolvedParcels` | Unresolved parcels | Ej hanterade paket |
| `issues.outsideHours` | Outside opening hours | Utanför öppettider |
| `issues.smsFailures` | SMS failures | Misslyckade SMS |
| `issues.actions.pickedUp` | Picked up | Hämtat |
| `issues.actions.noShow` | No-show | Ej hämtat |
| `issues.actions.cancelParcel` | Cancel parcel | Avboka paket |
| `issues.actions.reschedule` | Reschedule | Omboka |
| `issues.actions.retry` | Retry | Försök igen |
| `issues.actions.dismiss` | Dismiss | Ignorera |
| `issues.actions.editHousehold` | Edit household | Redigera hushåll |
| `issues.actions.cancel` | Cancel | Avbryt |
| `issues.actions.save` | Save | Spara |
| `issues.quickLinks` | Quick links | Snabblänkar |
| `issues.locationOpens` | Location opens {time} | Platsen öppnar {time} |
| `nav.issues` | Issues | Problem |

### 5.2 Translation Files

Add to existing translation files:
- `messages/en.json`
- `messages/sv.json`

---

## 6. Navigation

### 6.1 Navbar Design

**Decision:** Issues button only appears when there are issues (Option 2).

```
No issues:  [Schedule] [Households] [SMS]
Has issues: [Schedule] [Households] [SMS] [Issues ⚠️ 5]
```

**Rationale:**
- The button appearing IS the notification - impossible to miss
- Clean navbar most of the time (when system is healthy)
- Matches current SMS failures pattern (only shows when relevant)

**Changes:**
- **Remove:** Existing SMS failures navbar button (consolidated into Issues page)
- **Add:** Issues button that appears only when `issueCount > 0`
- **Keep:** Schedule outside-hours badge as secondary indicator (contextually useful)

### 6.2 Landing Page

After login, users are redirected to `/[locale]/admin` (the Issues page).

### 6.3 Home/Logo Click

Clicking the logo/site name navigates to the Issues page (same as landing page).

---

## 7. Files to Create/Modify

| File | Changes |
|------|---------|
| `app/db/schema.ts` | Add no_show columns to foodParcels, add SMS intent to enum |
| `drizzle/migrations/XXXX_*.sql` | **Generated** by `pnpm drizzle-kit generate` |
| `drizzle/migrations/meta/_journal.json` | **Generated** by Drizzle |
| `app/utils/sms/templates.ts` | Add `formatFoodParcelsEndedSms()` |
| `app/utils/sms/sms-service.ts` | Add `processFoodParcelsEndedJIT()`, `getHouseholdsForEndedNotification()`, `createEndedSmsRecord()` |
| `app/utils/scheduler.ts` | Call `processFoodParcelsEndedJIT()` in `processSmsJIT()` |
| `app/[locale]/admin/page.tsx` | **New:** Unified Issues page |
| `app/[locale]/admin/actions.ts` | **New:** Server actions for issue resolution (use `protectedAction()`) |
| `app/api/admin/issues/route.ts` | **New:** API to fetch all issues with counts |
| `app/components/admin/IssueCard.tsx` | **New:** Card component with inline actions/expansion |
| `app/components/admin/RescheduleInline.tsx` | **New:** Inline calendar + time picker (reuse ParcelCalendar style) |
| `messages/en.json` | Add `issues.*` and `nav.issues` translations |
| `messages/sv.json` | Add `issues.*` and `nav.issues` translations |
| `app/components/navbar.tsx` (or similar) | Remove SMS failures button, add conditional Issues button |

---

## 8. Test Cases

### SMS "Food Parcels Ended"

**Happy paths:**
1. Last parcel picked up, 48h passes, no new parcels → SMS sent
2. Last parcel marked no-show, 48h passes → SMS sent
3. Re-enrollment after ending → SMS → re-enroll → new ending → second SMS (different parcel ID)

**No SMS should be sent:**
4. Parcel picked up but future parcels exist (by date) → no SMS
5. Parcel picked up, new parcel added within 48h → no SMS
6. Household anonymized before 48h passes → no SMS
7. Parcel cancelled (not picked up/no-show) → no SMS
8. Household has unresolved parcel (older, no outcome) → no SMS (must resolve first)
9. Same-day parcel with passed time window → still counts as "upcoming", no SMS yet

**Idempotency:**
10. Scheduler runs multiple times after 48h → no duplicate SMS (NOT EXISTS check)
11. Existing failed SMS with same idempotency key → skip (don't auto-retry)

**Edge cases & bad data:**
12. Multiple terminal parcels per household → only latest one considered
13. `is_picked_up=true` but `picked_up_at=NULL` → skip (invalid state)
14. Both `picked_up_at` and `no_show_at` set → skip (invalid state)
15. `phone_number` is NULL → skip
16. `locale` is NULL → use fallback locale (sv)

### Issues Page

**Unresolved parcels:**
17. Parcel pickup DATE passes (not time) → appears in list
18. Same-day parcel with passed time window → NOT in unresolved list yet
19. Click [Picked up] → sets `is_picked_up=true`, `picked_up_at=now`, removes from list
20. Click [No-show] → sets `no_show_at=now`, removes from list

**Outside opening hours:**
21. Parcel scheduled outside hours → appears in list
22. Click [Reschedule] → calendar expands inline
23. Calendar shows availability for parcel's location (not other locations)
24. Only available dates are selectable (greyed out otherwise)
25. Time dropdown shows only available slots for selected date
26. Click [Save] → parcel updated, removed from list
27. Click [Cancel parcel] → confirmation → soft-deletes, removed from list

**SMS failures:**
28. Failed SMS appears with error message
29. Click [Retry] → updates existing record (same idempotency key), attempts resend
30. Click [Dismiss] → sets `dismissed_at/by`, removes from list
31. Click [Edit household →] → navigates to household edit page

**General:**
32. Household name links to `/households/[id]`
33. Tabs filter correctly by issue type
34. Counts in tabs update after actions
35. Empty state shows "All clear" message

---

## 9. Implementation Order

1. **Update schema.ts** - Add no_show columns + SMS intent to enum
2. **Generate migration** - Run `pnpm drizzle-kit generate`
3. **Issues page UI** - Build page with tabs, sections, cards (empty at first)
4. **Issue queries** - API/actions to fetch issues by type
5. **Inline actions** - [Picked up], [No-show], [Retry], [Dismiss] (with `protectedAction()`)
6. **Reschedule component** - Calendar + time picker (pass `pickup_location_id`)
7. **SMS template** - Add `formatFoodParcelsEndedSms()` with i18n
8. **SMS JIT logic** - Query + atomic claim + send for ended notifications
9. **Integration tests** - All test cases above
10. **Cleanup** - Update any affected existing UI

**Note:** Steps 1-6 (Issues page + no-show UI) should be completed BEFORE enabling the SMS logic (steps 7-8). This ensures staff can resolve unresolved parcels before the "ended" SMS feature goes live.

---

## 10. Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| State enum vs columns? | Add `no_show_at/by` columns | Simpler, doesn't break existing soft-delete pattern |
| Queue vs JIT? | Pure JIT | No stale data, simpler, matches existing pattern |
| Separate vs unified issues? | Unified page | Scales, one place to check, mobile-friendly |
| Modal vs page for reschedule? | Inline expansion | Stays in context, no navigation, mobile-friendly |
| Calendar vs dropdowns? | Calendar with time dropdown | Visual context for scheduling, matches existing UI |
| Keep existing indicators? | Yes, as secondary | Convenience for users already in those sections |
| Time vs date for "unresolved"? | Date-based | Staff has until end of day to resolve same-day parcels |
| Time vs date for "upcoming"? | Date-based | Consistent with "unresolved", prevents edge cases |
| Edit phone inline? | No, link to household | Editing phone affects all SMS, needs full context |
| Retry SMS behavior? | Update existing record | Preserves idempotency, no duplicate rows |
| Navbar Issues button? | Only show when issues exist | Clean navbar when healthy, button appearing = notification |
| SMS failures navbar button? | Remove (consolidated) | All issues in one place |

---

## 11. Open Items

- [ ] Consider "Acknowledge/Snooze" for issues that can't be fixed immediately
- [ ] Decide on retry behavior for failed "ended" SMS (manual only? auto-retry?)
