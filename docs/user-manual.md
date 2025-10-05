# Matkassen - User Manual

**Reading time: ~30 minutes (or read specific sections as needed)**

This manual provides detailed information about all Matkassen features. For a quick introduction, see the [Quick Start Guide](./quick-start.md).

---

## Table of Contents

- [Household Management](#household-management)
- [Parcel Scheduling](#parcel-scheduling)
- [SMS Dashboard](#sms-dashboard)
- [Pickup Location Management](#pickup-location-management)
- [Recipient Experience](#recipient-experience)
- [Troubleshooting](#troubleshooting)

---

## Household Management

### Overview

Households are the central registry of families/individuals receiving food parcels. Each household record contains contact information, household composition, dietary needs, and parcel history.

### Creating Households

The enrollment wizard has 7 steps:

1. **Basics**

    - First name, last name (required)
    - Phone number in Swedish format: +46XXXXXXXXX or 07XXXXXXXX (required)
    - Street address, postal code, city (optional but recommended)
    - Pickup location (required - determines where parcels can be scheduled)

2. **Members**

    - Add household members with names and birthdates
    - Helps with parcel planning and statistics
    - All fields optional

3. **Diet**

    - Select from: Vegetarian, Vegan, Lactose-free, Gluten-free, Halal, Kosher, etc.
    - Multiple selections allowed
    - Used for food parcel planning

4. **Pets**

    - Add pets with species and names
    - Relevant for certain food items or allergen considerations

5. **Needs**

    - Special requirements: Wheelchair access, Interpreter needed, etc.
    - Multiple selections allowed
    - Helps staff prepare for pickup

6. **Parcels** (optional)

    - Schedule initial food parcels directly from wizard
    - Or skip and schedule later from schedule page

7. **Review**
    - Confirm all information before submitting
    - Validation errors shown in red

After submission, household appears in the households list and is immediately available for parcel scheduling.

### Viewing and Editing Households

**Households Table**:

- Shows: Name, phone, location, member count, parcel count
- Click any row to open details dialog
- Search box filters by name (first or last)
- Column headers sort (click to toggle)

**Household Details Dialog**:

- Complete household information
- Parcel history (upcoming and past)
- Comment thread
- Actions: Edit Household, Manage Parcels

**Editing**:

- Opens same wizard with pre-filled data
- Navigate to step you want to change
- Changes save when you click "Update Household"
- Phone number changes affect future SMS (already-sent SMS unaffected)

### Comments

Add notes to household records for communication tracking:

- Type comment → Click "Add Comment"
- Shows your username and timestamp
- Visible to all admin staff
- Can be deleted but not edited

**Use comments for**:

- Recording phone conversations
- Documenting special circumstances
- Sharing information with other staff
- Tracking communication history

### Managing Parcels from Household

From household details dialog, click "Manage Parcels" to:

- See all upcoming parcels for this household
- Add multiple parcels at once
- Change pickup location (affects all future parcels)
- Delete unwanted future parcels

Changes trigger appropriate SMS notifications automatically.

---

## Parcel Scheduling

### Overview

Parcels represent scheduled food pickups at specific dates/times. The scheduling system has two main views optimized for different tasks.

### Schedule Hub

Central dashboard showing all pickup locations:

- Each location card shows today's count (completed/total)
- Click location to view its schedule
- Favorite locations (⭐) get "Today's Handouts" shortcut in navigation

### Today's Handouts View

Optimized for daily operations:

- Shows only today's parcels at selected location
- Grouped by time slots
- Progress indicator (X completed / Y total)
- Pull-to-refresh on mobile
- Manual refresh button
- Click parcel row to open details

**Status indicators**:

- 🟢 **Upcoming**: Future parcel, not picked up
- ✅ **Picked Up**: Collected (shows timestamp and admin who marked it)

**Best for**: Daily pickup operations, marking parcels as picked up.

### Weekly View

Optimized for planning:

- Calendar grid showing entire week
- Week navigation (arrows or date picker)
- See capacity across multiple days
- Drag-and-drop rescheduling (if supported)

**Best for**: Forward planning, seeing patterns, managing capacity.

### Creating Parcels

Parcels can be created from:

1. Schedule page (weekly view)
2. Household wizard (step 6)
3. Household details (Manage Parcels)

**Required information**:

- Household (must exist first)
- Pickup location
- Date and time window (start → end)

**Validation rules**:

- Pickup time must be in future
- Cannot double-book same household at same time/location
- Location capacity checked (soft limit - warns but allows)
- Household must have valid phone number

**Automatic SMS**:
When parcel created, SMS queues with **5-minute grace period**:

- Sends 5 minutes before pickup start time
- If you edit within grace period, old SMS cancelled, new one queued
- Prevents sending incorrect information

### Marking Parcels as Picked Up

1. Open parcel details dialog
2. Click "Mark as Picked Up"
3. Records: timestamp, admin username
4. Status changes immediately
5. Dialog stays open (can add comments)

**To undo**: Click "Undo Pickup" in same dialog. Clears all pickup information.

**Why mark pickups**:

- Accurate statistics and reporting
- Progress tracking in today's view
- Historical record of completed distributions

### Rescheduling Parcels

**Manual reschedule**:

1. Open parcel dialog → Click "Reschedule"
2. Select new date and time
3. Confirm change

**Drag-and-drop** (if available):

1. Drag parcel card to new slot in weekly view
2. Confirm in dialog
3. Shows capacity warnings if slot is full

**SMS behavior**:

- **Within grace period**: Old SMS cancelled, new SMS queued (one SMS total)
- **After SMS sent**: Update SMS sent with new information (two SMS total)

**Constraints**:

- Can only reschedule to same location
- Cannot reschedule past parcels
- Cannot reschedule already picked-up parcels

### Deleting Parcels

1. Open parcel dialog
2. Click "Delete Parcel" (bottom left)
3. Confirmation warns about SMS impact
4. Confirm deletion

**SMS behavior**:

- **Before SMS sent**: SMS cancelled, recipient never notified
- **After SMS sent**: Cancellation SMS queued (1-minute grace period)

Cancellation SMS informs recipient not to come.

**Cannot delete**:

- Already picked-up parcels
- Past parcels (pickup time passed)

Deleted parcels are soft-deleted (marked deleted_at, remain in database for audit trail).

### Parcel Details and History

Parcel dialog shows:

- Household information
- Pickup details (location, date, time)
- Status and pickup information
- SMS history (all notifications sent)
- Comments (admin notes)
- QR code (for public page)
- Action buttons

From here you can:

- Mark/unmark as picked up
- Add comments
- Reschedule or delete
- Copy public link or QR code

### Sharing Parcels with Recipients

Two methods:

1. **Automatic SMS**: Sent automatically when parcel created
2. **Manual sharing**: Copy link or show QR code from dialog

Public link format: `https://matkassen.org/p/[parcelId]`

Recipient can open link to see pickup details and QR code (no login required).

### Favorite Locations

Set one location as favorite for quick access:

1. Click ⭐ icon next to location name
2. Confirm in dialog
3. "Today's Handouts" shortcut appears in navigation

Favorite persists across sessions. Change by clicking star on different location.

---

## SMS Dashboard

### Overview

SMS Dashboard monitors all SMS notifications related to food parcel pickups. Has two separate views for different purposes:

1. **Default view** (active parcels): Your operational work queue
2. **Cancelled view** (toggle ON): Audit trail of cancelled parcels

**Design principle**: SMS follows parcel state automatically. You manage parcels in schedule, and SMS updates accordingly. Dashboard is for monitoring and recovery.

### Two-View System

The dashboard shows either active or cancelled parcels, never both:

**Active Parcels View** (default):

- Shows SMS for parcels that are NOT deleted/cancelled
- Your day-to-day operational work queue
- What needs attention right now
- Toggle OFF or omitted

**Cancelled Parcels View** (toggle ON):

- Shows SMS for parcels that ARE deleted/cancelled
- Audit trail of cancellations
- Verify households were notified (`pickup_cancelled` SMS)
- Historical record of what was cancelled

Switch between views using the **Show cancelled parcels** toggle in the filters section.

### Dashboard Layout

Date-grouped list view:

- Groups: "TODAY", "TOMORROW", specific dates
- Each SMS entry shows:
    - Household name
    - Pickup time and location
    - SMS status badge
    - Action button (context-aware)
    - Three-dot menu
- Click row to open parcel admin dialog

### SMS Status Meanings

- 🕒 **Queued**: Waiting to send (shows scheduled send time)
- 📤 **Sending**: Currently being sent
- ✅ **Sent**: Successfully delivered
- 🔄 **Retrying**: Auto-retry after temporary failure
- ⚠️ **Failed**: Send failed, needs attention
- ⏸️ **Cancelled**: Parcel was deleted

### Filtering and Search

Available filters:

- **Location**: Show SMS for specific pickup location
- **Status**: Filter by SMS status
- **Search**: Find by household name
- **Show cancelled parcels**: Toggle between active/cancelled views

Filters sync to URL for sharing and refresh persistence.

Clear all filters with "Clear Filters" button (note: cancelled toggle separate).

### Viewing Cancelled Parcels

To see SMS for cancelled/deleted parcels:

1. Toggle **Show cancelled parcels** switch ON
2. Dashboard switches to show ONLY cancelled parcels
3. All other filters still work (location, status, search)
4. Toggle OFF to return to active parcels view

**Common use cases**:

- Verify a household received cancellation notification
- Audit what parcels were cancelled this week
- Check if `pickup_cancelled` SMS sent successfully
- Review historical cancellations

**Important**: The two views are mutually exclusive. You see either active parcels OR cancelled parcels, never both together. This keeps the operational view clean and focused.

### SMS Actions

**Context-aware send button**:

- Failed SMS: "Try Again"
- Sent SMS: "Send Again"
- Queued SMS: "Send Now"

Clicking sends immediately, bypassing grace period.

**Three-dot menu**:

- Send SMS (context-aware)
- View Household
- View Parcel

### Handling Failed SMS

1. Failed SMS shows error message in English
2. Common issues:
    - Invalid phone number
    - Insufficient account balance
    - Technical issues
3. Fix underlying issue (usually phone number)
4. Click "Try Again" to resend

SMS Dashboard shows failure count in navigation badge for quick awareness.

### Understanding Automatic SMS

**When parcel created**:

- SMS queues with intent: `pickup_reminder`
- 5-minute grace period before sending
- Edits within grace period cancel old SMS, queue new one

**When parcel edited** (after SMS sent):

- Update SMS queues with intent: `pickup_updated`
- Informs recipient of changes
- 5-minute grace period applies

**When parcel deleted** (after SMS sent):

- Cancellation SMS queues with intent: `pickup_cancelled`
- 1-minute grace period (allows quick undo)
- Informs recipient not to come

**Multiple edits within grace period**:

- Each edit cancels previous SMS
- Only final version sends
- Prevents SMS spam to recipients

### Sending Urgent SMS

Use "Send Now" to bypass grace period:

- SMS sends immediately
- No confirmation dialog
- Use for time-sensitive situations

**When to use**:

- Recipient called asking about parcel
- Last-minute parcel additions
- Emergency changes

### Investigating Delivery Issues

If recipient reports not receiving SMS:

1. Search for their name in dashboard
2. Check status:
    - **Queued**: Hasn't sent yet (check scheduled time)
    - **Failed**: Check error message
    - **Sent**: SMS was delivered successfully
3. View parcel details for full SMS history
4. Use "Send Again" if needed
5. Alternatively, share public link directly

---

## Pickup Location Management

### Overview

Pickup locations are physical sites where households collect food parcels. Each location has its own schedule configuration and capacity limits.

### Creating Locations

1. Go to Pickup Locations page
2. Click "Add Location"
3. Fill in form:
    - **Name**: Short, clear identifier (e.g., "Centrum", "Väster")
    - **Street address**: Full street address
    - **Postal code**: Swedish format (5 digits)
    - **City**: City name
    - **Capacity**: Max parcels per time slot (optional)
4. Click "Create Location"

Location immediately available for scheduling.

**Naming best practices**:

- Keep short (appears in dropdowns)
- Use recognizable landmarks or areas
- Be consistent
- Avoid addresses in name (use address field)

### Location Details Page

Tabbed interface with one tab per location:

- Click tab to view/edit location
- Shows location form with current values
- Schedule configuration section below

### Editing Locations

1. Select location tab
2. Update any field
3. Click "Update Location"

**Impact of changes**:

- Name: Affects all references (use caution)
- Address: Doesn't affect already-sent SMS
- Capacity: Only affects future scheduling

**Cannot delete** locations with upcoming parcels. Must reschedule or delete parcels first.

### Configuring Schedules

Schedule defines when location is open and what time slots are available:

1. Select location tab
2. Go to "Opening Hours and Schedule" section
3. For each day of week:
    - Toggle on/off
    - Set opening and closing time
    - Set time slot duration (30, 60, 120 minutes, or custom)
4. Preview shows example time slots
5. Click "Save Schedule"

**Slot duration options**:

- 30 minutes: High traffic locations
- 60 minutes: Standard (recommended)
- 120 minutes: Flexible pickup windows

Schedule affects available time slots for **new parcels only**. Existing parcels unchanged.

### Capacity Management

Capacity = maximum parcels per time slot.

**How it works**:

- Counts total parcels in slot (upcoming + picked up)
- Warns when limit reached
- Does NOT prevent scheduling (soft limit)

**Setting capacity**:

- Leave empty for unlimited
- Set based on physical space and staffing
- Typical: 10-20 parcels per hour slot

**Capacity warnings**:

- Shows when creating/rescheduling parcels
- Helps avoid overcrowding
- Admin can override if necessary

### Location Statistics

Some locations may show usage statistics:

- Total parcels scheduled
- Weekly/monthly counts
- Peak hours
- Completion rates

Use for planning staffing and optimizing schedules.

---

## Recipient Experience

### Overview

Recipients interact with Matkassen through SMS and public parcel pages. No login or account required.

### SMS Notifications

Recipients receive SMS automatically:

**Pickup reminder** (5 min before pickup):

```
Matpaket: [date] [time]
Plats: [location], [address]
Detaljer: [link]
```

**Update notification** (if parcel rescheduled):

```
Uppdatering! Matpaket: [new date] [new time]
Plats: [location], [address]
Detaljer: [link]
```

**Cancellation** (if parcel deleted):

```
Matpaketet [date] [time] är inställt.
```

All SMS in Swedish (primary language). Link leads to public page with 20+ language options.

### Public Parcel Page

Accessible at: `https://matkassen.org/p/[parcelId]`

**What recipients see**:

- Parcel status badge
- Date and time
- Location name and address
- Map buttons (Google Maps, Apple Maps)
- QR code (if pickup upcoming)
- Language switcher

**Supported languages** (20+):
Swedish, English, Arabic, German, Greek, Spanish, Persian, Finnish, French, Armenian, Italian, Georgian, Kurdish, Polish, Russian, Somali, Swahili, Thai, Ukrainian, Vietnamese

Language auto-detected from phone settings, can be manually changed.

**Status meanings**:

- 🟢 **Upcoming**: Ready for pickup at scheduled time
- ✅ **Picked Up**: Already collected (shows timestamp)
- ❌ **Cancelled**: Pickup cancelled, don't come
- ⏰ **Expired**: Pickup time passed, contact organization

### QR Code Workflow

1. Recipient opens public page (from SMS link)
2. Page shows large QR code (240×240 pixels)
3. Recipient arrives at location
4. Shows phone screen to admin
5. Admin scans QR code with phone camera
6. Admin system opens parcel details (requires login)
7. Admin marks parcel as picked up

QR code contains: `https://matkassen.org/schedule?parcel=[parcelId]`

Scanning opens admin schedule page with parcel dialog automatically opened.

### Privacy and Access

**Recipients CAN see**:

- Their own parcel details
- Location information
- QR code for verification

**Recipients CANNOT see**:

- Other recipients' information
- Admin interface
- Other parcels
- Any system data beyond their specific parcel

Public pages not indexed by search engines. Links are unique per parcel (hard to guess but shareable).

### Sharing Parcel Information

Recipients can share public link with family members:

- Copy URL from browser
- Share via WhatsApp, SMS, email, etc.
- Anyone with link can view details
- QR code works regardless of who presents it

Useful if primary recipient cannot attend pickup.

### Troubleshooting for Recipients

**Link doesn't work**:

- Check internet connection
- Try different browser
- Verify complete URL copied

**Wrong information showing**:

- Refresh page
- Contact organization if incorrect

**QR code won't scan**:

- Increase screen brightness
- Clean phone screen
- Admin can manually find parcel instead

**Want to change pickup time**:

- Contact organization (phone/email)
- Changes cannot be made through public page

---

## Troubleshooting

### Household Issues

**Can't find household just created**

- Refresh page
- Clear search box (may be filtered)
- Check spelling

**Phone number validation fails**

- Use Swedish format: +46XXXXXXXXX or 07XXXXXXXX
- Remove spaces or dashes
- System adds formatting automatically

**Cannot delete household**

- Households cannot be deleted (data integrity)
- Add comment marking inactive instead
- Contact tech support if absolutely necessary

**Wizard shows validation errors**

- Red text shows what's invalid
- Common: phone number format, first name too short
- Go back to step and fix error

### Parcel Scheduling Issues

**Can't create parcel for yesterday**

- Parcels must have future pickup times
- System rejects past dates

**Capacity warning but slot looks empty**

- Counts all parcels including already picked up
- Check weekly view for complete picture

**Can't delete parcel**

- May be already picked up (cannot delete)
- May be in past (cannot delete)
- Check parcel status

**Drag-and-drop doesn't work**

- Trying to drag to past date (not allowed)
- Parcel already picked up (cannot move)
- Different location (must delete and recreate)
- Use "Reschedule" button instead

**Want to move parcel to different location**

- Cannot change location directly
- Must delete parcel and create new one at different location
- Triggers cancellation SMS if original was sent

### SMS Issues

**SMS shows queued but time passed**

- Refresh page (may have already sent)
- SMS processes every minute
- Check SMS Dashboard for current status

**Recipient says didn't receive SMS**

- Check SMS Dashboard status
- **Failed**: Fix phone number and retry
- **Sent**: SMS was delivered (recipient may have missed it)
- Use "Send Again" to resend
- Or share public link directly

**SMS Dashboard shows English error message**

- Read error message for specific issue
- Common: invalid phone number, balance insufficient
- Fix underlying issue and retry

**Want to prevent SMS from sending**

- If still queued within grace period: Delete parcel
- If already sent: Cannot recall SMS
- Send cancellation by deleting parcel

**Multiple SMS sent to same recipient**

- Parcel edited after SMS sent (triggers update SMS)
- Both original and update SMS delivered
- This is intentional behavior

### Location Issues

**Can't delete location**

- Location has upcoming parcels
- Must reschedule or delete all parcels first
- Then try deletion again

**Location doesn't appear in dropdown**

- Refresh page
- Clear browser cache
- Verify location was created successfully

**Schedule configuration lost**

- Must save before navigating away
- Click "Save Schedule" button
- If lost, reconfigure and save again

**Capacity warnings ignored**

- Capacity is soft limit (warning only)
- Currently by design
- Admins should respect warnings manually

### Public Page Issues

**Recipient's link doesn't work**

- Verify complete URL (starts with https://matkassen.org/p/)
- Check parcel still exists in system
- Try different browser

**Wrong language showing**

- Use language switcher at top of page
- Select preferred language from dropdown

**QR code won't scan**

- Increase phone brightness to maximum
- Clean phone screen
- Try admin's phone camera
- Admin can manually type parcel ID from URL

**Want to change pickup time via public page**

- Not possible through public page
- Recipient must contact organization
- Admin reschedules in system

### General Issues

**Browser performance slow**

- Clear browser cache
- Close unused tabs
- Try incognito/private mode
- Contact tech support if persists

**Changes don't appear**

- Refresh page (F5)
- Check internet connection
- Changes save immediately but display may lag

**Need to undo action**

- Mark pickup: Use "Undo Pickup" button
- Delete parcel: Cannot undo easily (1-min grace period)
- Edit household: Make another edit to correct

**Data appears incorrect**

- Verify you're looking at correct household/parcel
- Check for recent edits by other admins
- Contact tech support if data is genuinely wrong

---

## Getting Help

**For common tasks**: See [Quick Start Guide](./quick-start.md)

**For technical issues**: Contact tech support with:

- Description of problem
- What you were trying to do
- Screenshot of error (if applicable)
- Household/parcel ID (if relevant)

**For training**: Review this manual and practice with test data in development environment.
