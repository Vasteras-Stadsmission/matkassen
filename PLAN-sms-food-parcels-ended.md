# Implementation Plan: SMS When Food Parcels End

## Overview

Send an SMS to households 48 hours after their last food parcel outcome (picked up or no-show) when they have no upcoming parcels scheduled. This notifies them that their food assistance has concluded and provides contact information for questions.

---

## 1. Database Changes

### 1.1 New Enums

```sql
-- Parcel state enum (replaces is_picked_up boolean + deleted_at pattern)
CREATE TYPE parcel_state AS ENUM ('pending', 'picked_up', 'no_show', 'cancelled');

-- New SMS intent
ALTER TYPE sms_intent ADD VALUE 'food_parcels_ended';
```

### 1.2 Schema Changes to `food_parcels` Table

**Add new columns:**
```sql
ALTER TABLE food_parcels
ADD COLUMN state parcel_state NOT NULL DEFAULT 'pending',
ADD COLUMN state_changed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN state_changed_by_user_id VARCHAR(50);
```

**Add index for stale parcels query:**
```sql
CREATE INDEX idx_food_parcels_stale
ON food_parcels (state, pickup_date_time_latest)
WHERE state = 'pending';
```

### 1.3 Data Migration

Migrate existing data BEFORE dropping old columns:

```sql
-- Migrate is_picked_up = true → state = 'picked_up'
UPDATE food_parcels
SET
    state = 'picked_up',
    state_changed_at = picked_up_at,
    state_changed_by_user_id = picked_up_by_user_id
WHERE is_picked_up = true AND deleted_at IS NULL;

-- Migrate deleted_at IS NOT NULL → state = 'cancelled'
UPDATE food_parcels
SET
    state = 'cancelled',
    state_changed_at = deleted_at,
    state_changed_by_user_id = deleted_by_user_id
WHERE deleted_at IS NOT NULL;

-- Remaining (is_picked_up = false AND deleted_at IS NULL) stay as 'pending' (default)
```

### 1.4 Drop Old Columns (Separate Migration Later)

After verifying data migration is correct:

```sql
ALTER TABLE food_parcels
DROP COLUMN is_picked_up,
DROP COLUMN picked_up_at,
DROP COLUMN picked_up_by_user_id,
DROP COLUMN deleted_at,
DROP COLUMN deleted_by_user_id;
```

### 1.5 Drizzle Migration Strategy

1. Run `pnpm drizzle-kit generate` after updating `schema.ts`
2. This generates a new migration file in `drizzle/migrations/`
3. Manually append the data migration SQL (UPDATE statements) to the generated file
4. The drop columns should be a separate migration file (run after verification)

**Updated schema.ts:**
```typescript
export const parcelStateEnum = pgEnum("parcel_state", [
    "pending",
    "picked_up",
    "no_show",
    "cancelled",
]);

export const foodParcels = pgTable(
    "food_parcels",
    {
        id: text("id").primaryKey().notNull().$defaultFn(() => nanoid(12)),
        household_id: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
        pickup_location_id: text("pickup_location_id").notNull().references(() => pickupLocations.id),
        pickup_date_time_earliest: timestamp({ precision: 0, withTimezone: true }).notNull(),
        pickup_date_time_latest: timestamp({ precision: 0, withTimezone: true }).notNull(),
        state: parcelStateEnum("state").notNull().default("pending"),
        state_changed_at: timestamp({ precision: 1, withTimezone: true }),
        state_changed_by_user_id: varchar("state_changed_by_user_id", { length: 50 }),
    },
    // ... indexes
);
```

---

## 2. SMS Template

### 2.1 New Template Function

**File:** `app/utils/sms/templates.ts`

```typescript
/**
 * Generate SMS for when household has no more food parcels planned.
 * Uses simple, dignity-preserving language - not formal humanitarian terminology.
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

### 2.2 Messages by Locale

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
| hy | `Այլևdelays չdelays. Հdelays? Կdelays.` | ~40 |

**Note:** Messages use simple, everyday language for dignity. Avoid formal humanitarian terminology which can feel stigmatizing.

---

## 3. Scheduler Logic

### 3.1 Query: Find Households for "Ended" SMS

**File:** `app/utils/sms/sms-service.ts`

```typescript
export async function getHouseholdsForEndedNotification(): Promise<HouseholdForEndedSms[]> {
    // Find households where:
    // 1. Not anonymized
    // 2. Last parcel has terminal state (picked_up or no_show)
    // 3. State changed 48+ hours ago
    // 4. No upcoming pending parcels
    // 5. No existing SMS with this idempotency key
}
```

```sql
SELECT
    h.id as household_id,
    h.phone_number,
    h.locale,
    fp.id as last_parcel_id,
    fp.state_changed_at
FROM households h
JOIN food_parcels fp ON fp.household_id = h.id
WHERE
    -- Not anonymized (efficiency: filter early)
    h.anonymized_at IS NULL

    -- Terminal state, 48h ago
    AND fp.state IN ('picked_up', 'no_show')
    AND fp.state_changed_at <= NOW() - INTERVAL '48 hours'

    -- No upcoming pending parcels
    AND NOT EXISTS (
        SELECT 1 FROM food_parcels upcoming
        WHERE upcoming.household_id = h.id
        AND upcoming.state = 'pending'
        AND upcoming.pickup_date_time_latest > NOW()
    )

    -- Idempotency: no existing SMS for this ending
    AND NOT EXISTS (
        SELECT 1 FROM outgoing_sms sms
        WHERE sms.idempotency_key = 'food_parcels_ended|' || h.id || '|' || fp.id
    )

-- Get the most recent terminal parcel per household
ORDER BY fp.state_changed_at DESC;
```

### 3.2 Idempotency Key

**Format:** `food_parcels_ended|{householdId}|{lastParcelId}`

This allows:
- One SMS per "ending cycle"
- Re-sending if household is re-enrolled and ends again (different parcel ID)

### 3.3 Integration with Scheduler

**File:** `app/utils/scheduler.ts`

Add call to process ended notifications in the existing SMS processing loop:

```typescript
async function processSmsJIT() {
    await processRemindersJIT();
    await processQueuedSms();
    await processFoodParcelsEndedSms(); // New
}
```

---

## 4. Admin UI Changes

### 4.1 Issues Dashboard on Sign-In Page

Show actionable issues with clear text and links:

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ Needs Attention                                  │
├─────────────────────────────────────────────────────┤
│ 🔴 3 parcels scheduled outside opening hours    →   │
│ 🔴 5 SMS failed to deliver                      →   │
│ 🔴 8 parcels need outcome (picked up / no-show) →   │
└─────────────────────────────────────────────────────┘
```

If no issues → nothing shown (clean dashboard).

| Issue Type | Text | Links To |
|------------|------|----------|
| Outside hours | "X parcels scheduled outside opening hours" | `/admin/parcels/outside-hours` |
| SMS failures | "X SMS failed to deliver" | `/admin/sms/failures` |
| Stale parcels | "X parcels need outcome (picked up / no-show)" | `/admin/parcels/stale` |

### 4.2 Stale Parcels Page

**Route:** `/admin/parcels/stale`

Shows parcels where:
- `state = 'pending'`
- `pickup_date_time_latest < NOW()`

**Columns:**
- Household name
- Pickup date/time
- Location
- Time since pickup window closed

**Actions per parcel:**
- "Mark picked up" → `state = 'picked_up'`
- "Mark no-show" → `state = 'no_show'`
- "Cancel" → `state = 'cancelled'`

### 4.3 Red Badge in Nav

Keep as secondary indicator when admin navigates away from dashboard.

Badge shows count of: stale parcels + SMS failures + outside hours parcels

### 4.4 When Badge Appears

**Immediately** when `pickup_date_time_latest < NOW()` for any pending parcel.

No delay - admins should act promptly.

---

## 5. Developer Alerts (Slack)

### 5.1 Weekly Report

If any stale parcels are > 7 days old, send weekly Slack report to developer:

```
⚠️ Stale Parcels Report
12 parcels need attention
Oldest: 23 days (Household: ABC123)
```

This is escalation - if admins ignore the dashboard, developer can intervene.

---

## 6. Files to Modify

| File | Changes |
|------|---------|
| `drizzle/migrations/XXXX_add_parcel_state_enum.sql` | New enum, columns, data migration |
| `drizzle/migrations/XXXX_drop_old_parcel_columns.sql` | Drop deprecated columns (later) |
| `drizzle/migrations/XXXX_add_food_parcels_ended_intent.sql` | Add SMS intent |
| `app/db/schema.ts` | Add `parcelStateEnum`, update `foodParcels` table |
| `app/utils/sms/templates.ts` | Add `formatFoodParcelsEndedSms()` |
| `app/utils/sms/sms-service.ts` | Add `getHouseholdsForEndedNotification()`, `sendFoodParcelsEndedSms()` |
| `app/utils/scheduler.ts` | Add call to process ended notifications |
| `app/[locale]/admin/page.tsx` | Add issues dashboard section |
| `app/[locale]/admin/parcels/stale/page.tsx` | New stale parcels page |
| `app/[locale]/admin/parcels/stale/actions.ts` | Server actions for state changes |
| `app/components/admin/nav.tsx` | Update badge to include stale count |
| `app/utils/admin-issues.ts` | Shared function to get all issue counts |

---

## 7. Integration Test Cases

### Happy Path

1. **Last parcel picked up, 48h passes, no new parcels**
   - Household has 1 parcel → picks it up → 48h passes → SMS sent

2. **Multiple parcels, last one picked up**
   - Household has 3 parcels → picks up all → 48h after last pickup → SMS sent

3. **Re-enrollment after ending**
   - Parcel A picked up → 48h → SMS sent → new parcel B added → picked up → 48h → second SMS sent

4. **Last parcel marked as no-show**
   - Parcel marked no-show → 48h passes → SMS sent

### Admin Adds Parcels in Time

5. **New parcel added within 48h window**
   - Parcel picked up → 24h later admin adds new parcel → 48h passes → no SMS

6. **New parcel added just before 48h threshold**
   - Parcel picked up → 47h later admin adds new parcel → scheduler runs at 48h → no SMS

### No SMS Should Be Sent

7. **Parcel picked up but more upcoming parcels exist**
   - Household has 2 parcels → picks up first → 48h passes → no SMS (second parcel still upcoming)

8. **Household anonymized before 48h**
   - Parcel picked up → household anonymized at 24h → 48h passes → no SMS

9. **Parcel cancelled (never picked up)**
   - Parcel state = cancelled → 48h passes → no SMS (only triggers on picked_up/no_show)

10. **Parcel still pending (not yet resolved)**
    - Parcel state = pending → no SMS

11. **No-show but has upcoming parcel**
    - Parcel marked no-show, but another parcel scheduled → no SMS

### Idempotency / No Spam

12. **Scheduler runs multiple times after 48h**
    - Parcel picked up → 48h → SMS sent → scheduler runs again at 49h, 50h, 72h → no duplicate SMS

13. **SMS fails, retries, succeeds**
    - 48h passes → SMS queued → fails → retries → succeeds → scheduler runs again → no duplicate

### Timing Edge Cases

14. **Just before 48h threshold**
    - Parcel picked up 47h59m ago → scheduler runs → no SMS yet

15. **Just after 48h threshold**
    - Parcel picked up 48h01m ago → scheduler runs → SMS sent

### Stale Parcels (Admin Dashboard)

16. **Stale parcel exists (pending, window passed)**
    - Parcel pickup window passed, state = pending → no SMS (wait for admin to resolve)
    - Badge shows in nav, issue shows on dashboard

17. **Admin marks stale parcel as picked up**
    - Stale parcel → admin marks picked up → 48h passes → SMS sent

18. **Admin marks stale parcel as no-show**
    - Stale parcel → admin marks no-show → 48h passes → SMS sent

19. **Admin cancels stale parcel**
    - Stale parcel → admin cancels → no SMS (cancelled parcels don't trigger)

### Edge Cases

20. **Anonymized household excluded from query**
    - Household anonymized → parcel picked up → 48h passes → no SMS (excluded from query)

21. **Parcel with null state_changed_at (legacy data edge case)**
    - Handle gracefully - skip or use fallback timestamp

---

## 8. Implementation Order

1. **Database migration** - Add enum, columns, migrate data
2. **Update schema.ts** - Reflect new structure
3. **Update existing code** - Replace `is_picked_up`/`deleted_at` with `state`
4. **Admin UI** - Stale parcels page, dashboard issues, badge
5. **SMS template** - Add `formatFoodParcelsEndedSms()`
6. **Scheduler logic** - Add ended notification processing
7. **Tests** - All integration test cases
8. **Drop old columns** - Separate migration after verification
9. **Slack weekly report** - Developer escalation

---

## 9. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Idempotency: per-household or per-parcel? | Per-parcel (`householdId\|parcelId`) - allows re-sending after re-enrollment |
| Contact URL in SMS? | Not yet - TBD with stakeholders |
| Delay after pickup? | 48 hours |
| Terminology? | Simple, everyday language for dignity (not formal humanitarian terms) |
| Badge timing? | Immediately when pickup window closes |
