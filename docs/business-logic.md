# Business Logic & UX Patterns

## Parcel Status Display Logic

### Overview

Parcel status badges use **date-only** comparison, not time-based logic.

### Status Rules

- **Upcoming** (blue badge): Scheduled for today or future dates
- **Not Picked Up** (red badge): Scheduled for previous days AND never marked as picked up
- **Picked Up** (green badge): Manually marked by staff

### Intentional Behavior

Same-day parcels **ALWAYS** show as "upcoming" (blue), even if:

- The pickup window time has passed (e.g., 14:00-16:00 but it's now 17:00)
- The location has closed
- It's late in the evening

Only parcels from **previous days** show as "not picked up" (red).

### Rationale

1. **Households may arrive late** - We don't want to discourage them by showing "not picked up" while they're still coming
2. **Staff processes throughout the day** - May be handling multiple arrivals simultaneously
3. **Pickup windows are guidelines** - Not hard cutoffs
4. **Avoid premature red badges** - Staff might still be actively processing handouts

### Staff Workflow

1. Staff views household details during handout
2. Sees parcels scheduled for today (blue badges)
3. Opens parcel management dialog
4. **Manually marks parcel as picked up** when household receives it
5. System records pickup timestamp and user

### Code Location

`app/[locale]/households/[id]/components/HouseholdDetailsPage.tsx`:

```typescript
// Date-only comparison (intentional)
const isDateInPast = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    return compareDate < today;
};
```

**DO NOT** change this to time-based logic without discussing with product owner.

### Test Coverage

See `__tests__/app/households/parcel-status-display.test.ts`:

- Same-day parcels show as upcoming
- Previous-day parcels show as not picked up
- Future parcels show as upcoming
- Picked-up parcels show as picked up regardless of date

## Household Verification Questions

### Overview

Staff can add location-specific verification questions to ensure correct household identification during handouts.

### Question Types

1. **Yes/No** - Simple boolean questions
2. **Text** - Open-ended text answers
3. **Number** - Numeric answers (e.g., "How many children?")

### Storage

- Questions stored per handout location
- Answers stored per household per location
- Historical tracking for compliance

### Workflow

1. Admin configures questions in handout location settings
2. Staff views household during handout
3. Questions appear in verification dialog
4. Staff asks household the questions
5. Staff records answers
6. System saves answers with timestamp

### Use Cases

- Identity verification ("What is your address?")
- Household composition ("How many people in household?")
- Dietary restrictions ("Any allergies?")
- Compliance questions ("Have you received a parcel this month?")

## Household Management

### Household States

- **Active** - Currently receiving parcels
- **Inactive** - Temporarily paused (e.g., traveling)
- **Archived** - No longer receiving parcels (moved away, etc.)

### Multi-Location Support

- Households can be associated with multiple handout locations
- Each location may have different verification questions
- Staff only sees households relevant to their location

## Parcel Scheduling

### Scheduling Rules

- Parcels scheduled per household per location
- One parcel per household per day per location
- Recurring schedule support (weekly, bi-weekly, monthly)
- Manual one-off parcels

### SMS Notifications

- Sent 1 day before scheduled pickup (configurable)
- Includes location name, address, pickup window
- Supports 20+ languages via household preference
- Queue-based delivery with retry logic

## SMS Queue System

### Background Processing

- Custom Next.js server (`server.js`) starts scheduler on boot
- Checks for pending SMS every minute
- PostgreSQL advisory locks prevent duplicate processing

### SMS Lifecycle

1. **Scheduled** - Created 24h before parcel pickup
2. **Pending** - Ready to send
3. **Sent** - Successfully delivered
4. **Failed** - Delivery failed (retries up to 3 times)
5. **Cancelled** - Parcel cancelled before SMS sent

### Monitoring

Health endpoint shows scheduler status:

```bash
curl https://your-domain.com/api/health
```

Response:

```json
{
    "schedulerDetails": {
        "isRunning": true,
        "lastCheck": "2025-10-18T12:00:00Z"
    }
}
```

## Data Retention

### Active Data

- Households: Indefinite (until manually archived)
- Parcels: Indefinite (historical record)
- SMS logs: 90 days
- Verification answers: Indefinite (compliance)

### GDPR Compliance

- Households can request data deletion
- Admin can export household data
- Soft delete with anonymization option

## Access Control

### Current Model

- **Single admin role** - All authenticated users have full access
- **Organization membership** - Must be member of configured GitHub organization

### Future Considerations

- Location-specific staff roles
- Read-only reporter role
- Super admin vs. regular staff

## Parcel QR Codes

### Public Pages

- Each parcel has unique ID (8-char nanoid)
- QR code displays parcel details without authentication
- URL: `/p/[parcelId]?lang=sv`
- No sensitive information shown (name only, no address/phone)

### Use Case

- Staff can scan QR code during handout
- Household can view their own parcel info
- Quick verification without login

## Related Documentation

- **Development**: See `docs/dev-guide.md` for code conventions
- **Database**: See `docs/database-guide.md` for schema details
- **Testing**: See `docs/testing-guide.md` for status display tests
