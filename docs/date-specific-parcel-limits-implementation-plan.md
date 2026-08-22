# Date-specific food parcel limits: implementation plan

## Goal

Give each handout location one default daily parcel limit and optional independent limits for
specific calendar dates. Administrators can select dates across months and years, apply a limit
to the selection, and later change or reset any single date without affecting the other dates
that were originally selected.

The capacity limit is a hard booking limit. Existing parcels are never cancelled automatically
when an administrator lowers a limit below the number already booked; the date instead becomes
over capacity. Operations that increase its parcel count are rejected, while removals, moves out,
and changes between time slots on the same location/date remain possible.

## Product decisions

- The setting belongs inside each location as a third tab named **Limits**.
- The existing **Schedules** tab is renamed **Opening hours**.
- General information contains no duplicate limit summary or link.
- The default daily limit and the optional per-time-slot limit move from General to Limits.
- Slot duration moves from General to Opening hours.
- A specific-date limit overrides the location's default daily limit only for that date.
- Date rows are independent. Bulk selection is only an editing convenience and creates no
  persistent group, recurrence, weekday rule, or date-range rule.
- New overrides can be created only for open dates that are today or later.
- Existing overrides on dates that later become closed remain stored. Opening-hours validation
  makes them inactive while the location is closed; they become active again if the date reopens.
  They remain visible and can be edited or reset.
- Past overrides are retained for history but are read-only in the interface.
- Limits must be positive whole numbers. Closing a date belongs in Opening hours rather than
  being represented by a limit of zero.
- Leaving the per-time-slot limit empty means “use that date's daily limit.” No duplicate number
  is stored and no redundant slot check is needed: the daily hard-cap check already prevents any
  one slot from exceeding that date's limit. If a legacy location has neither a daily nor a
  time-slot limit, it remains uncapped until an administrator configures one.

### Effective limits

For a location and Stockholm calendar date:

1. `effective daily limit = date override ?? location default daily limit`
2. An explicit time-slot limit adds a tighter independent check. Without one, only the effective
   daily limit is checked, which functionally allows up to that daily limit in one slot.

The daily and time-slot checks are both enforced. An explicit time-slot limit higher than the
daily limit therefore cannot permit bookings beyond the daily limit.

## Data model and migration

Add `pickup_location_daily_limits` with:

- `pickup_location_id`: required foreign key to `pickup_locations`, cascading on location delete
- `date`: required PostgreSQL `date`
- `max_parcels`: required positive integer
- a composite primary key on `(pickup_location_id, date)`
- a database check requiring `max_parcels > 0`

Also add the missing database constraint for the existing default:
`parcels_max_per_day IS NULL OR parcels_max_per_day > 0`. Verify existing data contains no
non-positive value before applying it. Actor and history belong in the generic audit log, so the
override table needs no synthetic ID, actor columns, or timestamps.

Generate the migration with Drizzle and review both the SQL and migration metadata. Do not write
the migration manually.

## Shared domain logic

Create one capacity module responsible for:

- validating and normalizing Stockholm date keys
- resolving a single date's effective daily and time-slot limits
- loading overrides for a date range without one query per date
- locking affected pickup-location rows in deterministic ID order before capacity-sensitive
  mutations; this helper accepts a transaction handle only

The location-row lock (`SELECT ... FOR UPDATE`) intentionally serializes the small number of
simultaneous booking mutations for a location. Every booking or limit mutation must, inside one
transaction:

1. Determine every affected location ID.
2. Lock the deterministic union of source and target location rows in sorted order.
3. Row-lock and re-read selected parcels, defaults, overrides, and counts after the location locks
   are held; abort if a selected parcel or its source location changed.
4. Validate the complete final state.
5. Write and commit.

Opening-hours mutations acquire the same parent-location lock before changing schedules. Booking
validation reads opening hours only after that lock is held, so a booking cannot pass against an
outdated open/closed state while an administrator changes the schedule.

No capacity count or limit read from before the lock may be reused for the decision. This closes
the existing check-then-insert race without advisory-lock portability issues and coordinates
bookings with default or date-specific limit edits. Update the existing `insertParcels`
documentation that currently records the race as accepted.

The shared resolver must fail closed. Database errors are propagated; a failed lookup is never
converted into a `null`/uncapped limit. Read-only availability UIs show a retryable error state.

Replace direct use of `pickup_locations.parcels_max_per_day` in capacity decisions with the
shared resolver in all of these paths:

- household enrollment and its range availability response
- household parcel editing
- single-parcel rescheduling
- bulk rescheduling/final-state validation
- fully booked date calculations
- the weekly schedule's capacity badges, over-capacity styling, and drag/drop blocking
- the seven-day capacity statistics

The weekly grid receives a `Record<YYYY-MM-DD, number | null>` instead of one scalar maximum, and
the artificial numeric fallback for an uncapped location is removed.

The household booking calendar loads capacity for the months currently visible, rather than only
for the current and following month. Navigating into later months triggers a fresh range load and
merges the returned counts and effective limits. Until that load succeeds, dates fail closed. This
keeps the calendar's red strike-through/disabled state aligned with the schedule even for dates
several months ahead.

Rescheduling availability also fails closed while daily/slot data is loading or after a read
failure. Its slot counts use interval overlap, matching server enforcement for supported pickup
windows longer than one configured slot. Weekly schedule requests ignore stale responses after
rapid week or location navigation.

All mutation checks are delta-aware:

- adding or moving a parcel into a full/over-capacity date is rejected
- moving within the same location/date is allowed when the daily count does not increase
- removing or moving out is allowed
- household and bulk changes are validated against their complete final state, not one parcel at
  a time

Statistics that describe a location's configured default may continue to display the default.
Statistics that claim to measure available capacity for particular dates must use effective
date-specific limits.

## Server actions

Add protected admin actions for:

1. Loading date-specific limits, booked counts, and open/closed state for a requested month or
   date range.
2. Updating the location's default daily and optional explicit time-slot limits.
3. Applying one positive limit to a deduplicated list of selected date keys using an upsert.
4. Resetting selected dates to the location default by deleting their independent rows.
5. Updating slot duration from the Opening hours tab.

Every mutation will:

- validate authorization through the existing protected action wrappers
- accept only canonical `YYYY-MM-DD` Stockholm calendar-date strings, validate that they are real
  calendar dates, and never derive them with `toISOString().split("T")[0]`
- validate location existence, inputs, today/future rules, and opening-hour eligibility on the
  server rather than trusting the calendar
- accept at most 366 unique dates per apply/reset request
- acquire the location capacity lock before reading or writing limits
- run its database writes and audit event in one transaction
- return structured action errors and revalidate the locations settings page

Lowering a default, applying an override, or resetting an override to a lower default uses one
two-phase mutation. The first call returns `CONFIRMATION_REQUIRED` with affected dates, current
bookings, and resulting limits. After the administrator confirms, the same action is called with
the exact conflict dates they acknowledged; it reacquires the lock and rechecks current state. If
another selected date has become a conflict, the action asks again rather than applying a newly
expanded warning. No separate preview endpoint or confirmation token is introduced. Existing
parcels remain.

Equal values are no-ops and produce no warning, write, or audit event. Each bounded bulk action
creates one audit event attached to the pickup location rather than one event per date.

## Tablet-first and responsive interface

### Location tabs

Use three short, visible tabs with at least 44-pixel touch targets:

- General
- Opening hours
- Limits

The tab list must fit at small widths without icon-only controls or hover-dependent explanations.
The existing location selector remains usable with touch and keyboard; any overflow must be
contained rather than clipping the active location or delete action. Desktop may keep location
tabs. Phones and portrait tablets use a full-width location select with a separate labeled delete
action instead of narrow tabs with adjacent icon-only delete controls.

### Default limits

At the top of Limits, show a compact form containing:

- Default parcels per day
- Parcels per time slot (optional)
- A visible Save defaults button

The optional field uses the helper text “Leave empty to use that date's daily limit” and a
matching placeholder. Fields display side by side where space permits and stack on phones.

### Date-specific limits

Below the defaults, show a single-month, touch-friendly calendar and an editing panel:

- administrators can select arbitrary open dates and navigate across months and years without
  losing earlier selections
- selected dates, existing overrides, closed dates, past dates, and over-capacity dates have
  distinct text/icon treatment; meaning never relies on color alone
- existing override values are visible in their date cells
- the panel shows only **“N dates selected”**, not a potentially unbounded inline date sentence
- **Review dates** opens a responsive drawer grouped by month and year, for example
  “August 2026: 4, 11, 18, 25”; each date can be removed individually
- the primary action applies the entered limit to all selected dates
- **Reset to default** deletes overrides for selected dates that already have one
- **Clear selection** changes only the local selection

On wide tablets and desktops, the calendar and editing panel can sit beside one another. On
portrait tablets and phones they stack, with full-width labeled actions. The review drawer uses
comfortable touch targets, remains keyboard accessible, and does not rely on hover. The calendar
uses one month at every size to keep date cells large and avoid horizontal scrolling. Calendar
cells use compact numbers/status icons plus accessible labels and a visible legend rather than
trying to fit full status text into seven narrow columns.

## State and error handling

- Keep selected date keys in client state independently from the currently displayed month.
- Fetch the visible month on demand without a custom client cache; preserve only the selected date
  keys across month navigation.
- Give each visible-month request a generation ID and ignore responses from older requests, so
  rapid month navigation cannot paint October's availability onto November.
- Clear selection when the location changes.
- Disable Apply until the selection is valid and a positive whole-number limit is present.
- If a schedule changes after the month was loaded, trust the server response, keep rejected
  dates selected for review, and refresh the affected month.
- After apply/reset, update local override state from the action result and announce success or
  actionable failure through translated notifications.
- If a proposed change is below existing bookings, show the confirmation before applying and
  explain that existing parcels remain; never remove or reschedule them automatically.

## Internationalization and accessibility

- Add every new user-facing string to English and Swedish messages.
- Use locale-aware month/year and full-date formatting rather than hand-built English summaries.
- Use semantic labeled inputs and buttons, visible focus states, and accessible names for calendar
  navigation and date status.
- Ensure all interactive controls meet a 44-by-44-pixel touch target where practical.
- Use text or icons alongside color for selected, overridden, closed, and over-capacity states.

## Test plan

### Unit tests

- effective daily limit uses an override when present and the location default otherwise
- empty time-slot limit adds no independent ceiling while the effective daily ceiling still
  applies to the slot
- explicit time-slot limit remains explicit while the daily ceiling still applies
- date normalization is stable across Stockholm DST boundaries
- selected-date grouping orders dates by year, month, and day
- open-date eligibility handles schedule boundaries and weekdays

### Component tests

- Limits is rendered as the third tab and the renamed Opening hours tab is present
- capacity controls no longer appear in General
- selections survive month navigation and the primary surface shows only the count
- Review dates groups multiple months and years and can remove one date
- applying and resetting call the correct protected actions and refresh visible override badges
- closed and past dates cannot receive new overrides; a closed date with an existing override can
  be reset
- blank per-time-slot input is presented as inheriting the date's daily limit
- navigating the household booking calendar to a later month reloads capacity and renders a full
  date with a red strike-through while preventing selection
- a slower response for a previously displayed month cannot overwrite the current month's limits

### Integration tests

- bulk upsert creates independent rows and updating one date leaves sibling dates unchanged
- reset deletes only requested rows
- invalid, duplicate, past, closed, and non-positive inputs are handled safely
- deleting a location cascades its daily-limit rows
- two-phase confirmation is required before lowering a resulting limit below current bookings
- lowering a limit after confirmation preserves parcels and blocks the next incoming booking
- enrollment, household editing, single rescheduling, bulk rescheduling, and fully-booked date
  lookup all honor a date override
- the weekly grid and seven-day statistics use per-date effective limits and retain `null` for an
  uncapped date
- same-date slot changes and moves/removals out remain possible on an over-capacity date
- capacity lookup failures do not become uncapped results
- multiple new rows in one request are counted together rather than each claiming the same final
  place
- multi-location household submissions validate and lock every row's actual location
- earlier same-day parcels count toward the daily total when adding a later pickup
- overlapping time windows count toward an explicit slot limit, even when their start times differ
- a stale confirmation must be shown again if additional dates become over capacity
- the general-information update action cannot mutate operational limit or slot-duration fields
- changing only the time-slot limit does not surface warnings caused by an unchanged daily limit
- enrollment and single/bulk rescheduling reject closed dates and times outside opening hours
- opening-hour writers and booking writers coordinate through the same location lock
- new or changed form submissions reject zero-length or reversed pickup windows before overlap
  capacity is evaluated; unchanged legacy rows are not blocked
- longer pickup windows mark every overlapping reschedule slot unavailable, and availability read
  failures expose no selectable fallback slots or dates

Coverage deliberately uses only two narrow shared seams: the effective-capacity module and the
existing parcel-assignment validator. Each page/action retains its own orchestration tests. This
duplicates a small amount of setup, but avoids a large test abstraction that could make all entry
points pass while concealing a broken integration in one of them.

### Validation

- Run focused unit and integration tests while iterating.
- Run the full unit and integration suites affected by scheduling and capacity.
- Run `pnpm run validate` before publishing.
- Perform a manual responsive check at phone, portrait tablet, landscape tablet, and desktop
  widths, including keyboard navigation and touch-sized targets.
- Verify the hard-cap lock with two independent connections to local PostgreSQL: race two bookings
  for the final place and assert exactly one succeeds, then race a booking against a limit change
  and assert the committed result is valid. PGlite tests cover functional behavior but cannot
  prove PostgreSQL row-lock semantics.

## Delivery sequence

1. Generate the schema migration.
2. Add shared resolver, range loading, eligibility, and locking helpers with tests.
3. Update every booking and availability path to use effective limits.
4. Add protected limit and slot-duration actions with audit logging.
5. Refactor the location tabs and build the responsive Limits interface.
6. Add translations and component/integration coverage.
7. Run focused and full validation.
8. Search the repository for direct uses of `parcels_max_per_day` and confirm each remaining use is
   a stored-default display rather than a date-specific decision.
9. Perform a second devil's-advocate review of the completed diff, address findings, rerun affected
   checks, and only then commit, push, and open the pull request.

## Explicitly out of scope

- weekly limits
- recurring weekday capacity rules
- linked date groups or ranges
- split opening-hour sessions
- automatically cancelling, moving, or wait-listing existing parcels
- public/household self-service booking changes
