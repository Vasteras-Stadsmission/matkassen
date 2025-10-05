# Matkassen - Quick Start Guide

**Reading time: 10-15 minutes**

This guide covers the essential tasks to get you productive with Matkassen immediately. For detailed information, see the [Reference Manual](./user-manual.md).

---

## System Overview (1 min)

Matkassen manages food parcel distribution across pickup locations. The workflow:

1. **Register households** → 2. **Schedule parcels** → 3. **SMS sent automatically** → 4. **Recipients view details** → 5. **Mark as picked up**

---

## Household Management

### Create New Household

1. Click **Households** in navigation
2. Click **New Household** button
3. Fill in the wizard (7 steps):
    - **Basics**: Name, phone, address, pickup location
    - **Members**: Add household members
    - **Diet**: Select dietary restrictions
    - **Pets**: Add pets if relevant
    - **Needs**: Additional needs (wheelchair, interpreter, etc.)
    - **Parcels**: Optionally schedule initial parcels
    - **Review**: Confirm and submit
4. System saves household and queues SMS if parcels were added

**Required fields**: First name, last name, phone number, pickup location.

### View Household Details

1. Click **Households** in navigation
2. Click any household row
3. Dialog shows: contact info, members, dietary needs, parcel history, comments

### Edit Household

1. Open household details dialog
2. Click **Edit Household**
3. Navigate through wizard to make changes
4. Click **Update Household** to save

---

## Parcel Scheduling

### View Today's Handouts

1. Click **Schedule** in navigation → Select location
2. Click **Today's Handouts** tab
3. See all parcels for today grouped by time
4. Click parcel row to open details
5. Use refresh button to update list

**Tip**: Set a favorite location (click ⭐) to get quick access via **Today's Handouts** shortcut in navigation.

### Mark Parcel as Picked Up

1. Find parcel in today's view
2. Click the parcel row
3. Dialog opens with parcel details
4. Click **Mark as Picked Up** button
5. Status changes immediately

**To undo**: Click **Undo Pickup** button in same dialog.

### Create Parcel

**Method A - From Schedule:**

1. Go to **Schedule** → Select location → **Weekly View**
2. Click **Add Parcel** button
3. Select household, date, and time window
4. Click **Create Parcel**

**Method B - From Household:**

1. Open household details → Click **Manage Parcels**
2. Select location and add date/time slots
3. Click **Save Parcels**

SMS queues automatically with 5-minute grace period (allows you to fix mistakes before it sends).

### Reschedule or Delete Parcel

1. Click parcel to open details dialog
2. To reschedule: Click **Reschedule** → Select new time → Confirm
3. To delete: Click **Delete Parcel** → Confirm

**SMS behavior**:

- Reschedule within 5 minutes of creation: Old SMS cancelled, new one queued
- Reschedule after SMS sent: Update SMS sent to recipient
- Delete after SMS sent: Cancellation SMS sent (1-minute grace period)

### Switch Between Views

- **Today's View**: Best for daily operations, mark pickups
- **Weekly View**: Best for planning ahead, see capacity, drag-and-drop reschedule

Both views accessible via tabs at the location schedule page.

---

## SMS Dashboard

### Monitor SMS Status

1. Click **SMS** in navigation
2. Dashboard shows all upcoming SMS for **active parcels** grouped by date
3. Check for **Failed** badges (red)
4. Click refresh button to update
5. Toggle **Show cancelled parcels** to view SMS for deleted/cancelled parcels

**Two views**:

- **Default**: Shows SMS for active, operational parcels (your work queue)
- **Cancelled toggle ON**: Shows SMS for cancelled parcels (audit trail)

**Navigation badge**: Shows count of failed SMS. No badge = all OK.

### Fix Failed SMS

1. Failed SMS shows error message in English
2. Click **⋮** menu → **View Household**
3. Fix the issue (usually phone number)
4. Return to SMS Dashboard
5. Click **⋮** menu → **Try Again**

**Common issues**: Invalid phone number, insufficient account balance.

### Send SMS Immediately

1. Find SMS in dashboard (use search if needed)
2. Click **⋮** menu → **Send Now**
3. SMS sends immediately, bypassing grace period

**Use when**: Recipient called asking, last-minute changes, time-sensitive situations.

### View Cancelled Parcels

1. Toggle **Show cancelled parcels** switch ON
2. Dashboard switches to show SMS for deleted/cancelled parcels only
3. Verify households were notified about cancellations
4. Check if `pickup_cancelled` SMS were sent successfully

**Use when**: Auditing cancellations, verifying recipients were informed, checking historical cancellations.

**Note**: Active and cancelled parcels are shown in separate views (mutually exclusive).

---

## Pickup Location Management

### Create Pickup Location

1. Click **Pickup Locations** in navigation
2. Click **Add Location**
3. Fill in: Name, street address, postal code, city, capacity (optional)
4. Click **Create Location**

Location immediately available for scheduling parcels.

### Configure Location Schedule

1. Go to **Pickup Locations** → Select location tab
2. Scroll to **Opening Hours and Schedule** section
3. For each day: Toggle on/off, set hours, set slot duration
4. Click **Save Schedule**

Schedule determines available time slots for new parcels.

### Edit Location Details

1. Go to **Pickup Locations** → Select location tab
2. Update any field (name, address, capacity)
3. Click **Update Location**

**Note**: Cannot delete locations with upcoming parcels. Reschedule parcels first.

---

## Recipient Experience

### How Recipients Receive Parcels

1. **SMS sent automatically** 5 minutes before parcel pickup time:
    - Contains date, time, location, and link
2. **Recipient clicks link** in SMS
3. **Public page opens** (no login required):
    - Shows pickup details
    - Location with map buttons
    - QR code to present at pickup
4. **Language auto-detected** from phone (20+ languages supported)
5. **Recipient arrives** and shows QR code
6. **Admin scans QR** (or manually finds parcel) and marks as picked up

### What Recipients Can See

**Recipients can**:

- View their parcel details (date, time, location)
- See location on map (Google Maps/Apple Maps links)
- Switch language (20+ options)
- Show QR code for verification

**Recipients cannot**:

- See other recipients' information
- Access admin features
- Modify parcel details
- See any other system data

The public page shows only their specific parcel information in their preferred language.

### Parcel Status for Recipients

Recipients see one of these statuses:

- **Upcoming** (green): Ready for pickup at scheduled time
- **Picked Up** (gray): Already collected
- **Cancelled** (red): Pickup cancelled, don't come
- **Expired** (orange): Pickup time passed, contact organization

---

## Common Issues

### "I can't find a household I just created"

Refresh the page. Check search box isn't filtering results.

### "SMS shows as queued but time has passed"

Refresh SMS Dashboard. SMS processes every minute and may have already sent.

### "Recipient says they didn't get SMS"

Check SMS Dashboard for status. If failed, check phone number and retry. If sent, SMS was delivered (recipient may have missed it). Use **Send Again** to resend.

### "Can't delete parcel"

Parcel may be already picked up or in the past. These cannot be deleted.

### "Capacity warning when creating parcel"

Soft limit warning - you can still proceed but location may be overcrowded. Consider different time slot.

### "Drag-and-drop doesn't work"

You may be trying to drag to a past date, different location, or parcel is already picked up. Use **Reschedule** button instead.

---

## Quick Tips

- **Set a favorite location** for fast access to today's handouts
- **Use search** everywhere - faster than scrolling
- **Grace periods protect you** from mistakes (5 min for new parcels, 1 min for cancellations)
- **Refresh regularly** in today's view to see real-time updates
- **Add comments** to households for special circumstances or important notes
- **Check SMS Dashboard daily** to catch any failed notifications

---

## Need More Help?

See the [Reference Manual](./user-manual.md) for:

- Detailed workflow explanations
- Advanced features
- Complete troubleshooting guide
- Edge cases and special scenarios
