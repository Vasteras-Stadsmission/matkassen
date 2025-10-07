# Matkassen User Journeys

This document captures high-level navigation for both staff and public visitors.

> Tip: install a Mermaid-compatible Markdown preview (e.g. "Markdown Preview Mermaid Support") to render the diagram in VS Code.

```mermaid
flowchart LR
    subgraph Public Visitors
        P0["QR / SMS link<br/>- from staff share or reminder"]
        P1["Locale detection<br/>- chooses sv/en from headers<br/>- fallback to default locale"]
        P2["Public parcel page /p/ID<br/>- status badge & pickup window<br/>- map buttons + QR canvas<br/>- PublicLocaleSwitcher for language swap"]
        P3["Directions / show QR at pickup<br/>- uses generated maps links"]
        P0 --> P1 --> P2 --> P3
        P2 -- switch locale --> P1
    end

    subgraph Staff Team
        MW["Middleware<br/>- locale detection & CSP<br/>- redirects unauthenticated -> signin"]
        SignIn["Sign-in /auth/signin<br/>- GitHub OAuth + org membership check<br/>- redirects to callback"]
        Home["Home /<br/>- AuthProtection ensures session<br/>- shows welcome copy + status"]
        Header["Header + layout<br/>- nav: Schedule / Households / Locations<br/>- LanguageSwitcher + Auth menu + Scan QR link"]
        MW -- no session --> SignIn
        MW -- session --> Home
        SignIn --> Home --> Header

        Header --> ScheduleHub
        ScheduleHub["Schedule Hub /schedule<br/>- location cards with today's counts<br/>- FavoriteStar confirmation modal<br/>- ?parcel deep-link -> redirect to location view"]
        ScheduleHub --> LocationLanding
        LocationLanding["Location landing<br/>- resolves slug to location<br/>- pick Today's handouts or Weekly view<br/>- error alert if not found"]
        LocationLanding --> TodayView
        TodayView["Today's handouts<br/>- sticky header w/ progress + favorite toggle<br/>- pull-to-refresh + manual refresh button<br/>- click parcel or ?parcel opens admin dialog"]
        TodayView --> ParcelAdminDialog
        ScheduleHub --> TodayRedirect
        TodayRedirect["Schedule /today redirect<br/>- auto jump to favorite location<br/>- fallback cards showing today's handouts"]
        TodayRedirect --> TodayView

        LocationLanding --> WeeklyView
        WeeklyView["Weekly schedule<br/>- week nav + date picker modal<br/>- drag/drop parcels with capacity warnings<br/>- open admin or reschedule flows"]
        WeeklyView --> WeekConfirmModal
        WeekConfirmModal["Drag/drop confirm modal<br/>- summarises from/to slot<br/>- confirm move or cancel"]
        WeeklyView --> RescheduleModal
        RescheduleModal["Reschedule modal<br/>- choose new date & slot within hours<br/>- refresh grid on success"]
        WeeklyView --> ParcelAdminDialog

        ParcelAdminDialog["Parcel admin dialog<br/>- household + parcel details & comments<br/>- mark picked up / undo & add notes<br/>- copy shareable QR/admin links"]
        ParcelAdminDialog -- share URL/QR --> P0

        Header --> HouseholdsList
        HouseholdsList["Households /households<br/>- searchable/sortable table<br/>- row click opens detail modal<br/>- buttons for edit or new household"]
        HouseholdsList --> HouseholdDetailModal
        HouseholdDetailModal["Household detail modal<br/>- members, needs, parcel history<br/>- comment thread add/delete via API"]
        HouseholdsList --> EnrollWizard
        EnrollWizard["Household wizard create<br/>- steps: basics → members → needs → review<br/>- submit calls enrollHousehold action<br/>- redirects to schedule page after save"]
        HouseholdsList --> EditWizard
        EditWizard["Household wizard edit<br/>- prefilled data & comment hooks<br/>- updateHousehold + add/delete comments"]

        Header --> HandoutLocationsPage
        HandoutLocationsPage["Handout locations admin<br/>- tab per location with form<br/>- notifications on create/update/delete"]
        HandoutLocationsPage --> LocationModal
        LocationModal["Add location modal<br/>- LocationForm create mode<br/>- resets after save"]
        HandoutLocationsPage --> SchedulesTab
        SchedulesTab["Schedules tab<br/>- configure opening hours & slot duration<br/>- week picker + validation helpers"]

        Header --> SmsDashboard
        SmsDashboard["SMS Dashboard /sms-dashboard<br/>- two-view system: active vs cancelled<br/>- filters: location, status, search, cancelled toggle<br/>- monitor SMS status & handle failures<br/>- Send Now / Try Again actions"]
        SmsDashboard -- view parcel --> ParcelAdminDialog
        SmsDashboard -- view household --> HouseholdDetailModal
    end
```
