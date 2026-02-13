# Household Detail Page Components

This directory contains the refactored household detail page with reusable components.

## Component Structure

### Main Component

- **HouseholdDetailsPage.tsx** (448 lines) - Main orchestration component

### Reusable Sub-Components

#### HouseholdInfoCard.tsx

Displays basic household information (name, phone, language).

**Props:**

- `firstName`, `lastName`, `phoneNumber`, `locale`
- `getLanguageName`: Function to translate locale codes to language names

**Usage:**

```tsx
<HouseholdInfoCard
    firstName={household.first_name}
    lastName={household.last_name}
    phoneNumber={household.phone_number}
    locale={household.locale}
    getLanguageName={getLanguageName}
/>
```

---

#### HouseholdMembersCard.tsx

Displays household members with gender icons and ages.

**Props:**

- `members`: Array of `{ id?, age, sex }` objects

**Usage:**

```tsx
<HouseholdMembersCard members={householdData.members} />
```

---

#### ParcelCard.tsx ⭐ **REUSABLE**

Generic parcel card component that can be used anywhere parcels are displayed.

**Props:**

- `parcel`: ParcelCardData object
- `onClick?`: Optional click handler
- `status`: "upcoming" | "pickedUp" | "notPickedUp" | "cancelled"
- `statusLabel`: Translated status text
- `getWeekdayName`, `formatDate`, `formatTime`: Formatting functions
- `deletedLabel?`, `byLabel?`: Optional labels for cancelled parcels

**Features:**

- Visual status indicators (colors, icons)
- Hover effects with `.hover-card` class
- Cancelled parcel styling
- Past-due highlighting

**Usage:**

```tsx
<ParcelCard
    parcel={parcel}
    onClick={() => handleClick(parcel.id)}
    status="upcoming"
    statusLabel="Upcoming"
    getWeekdayName={getWeekdayName}
    formatDate={formatDate}
    formatTime={formatTime}
/>
```

---

#### ParcelList.tsx ⭐ **REUSABLE**

Renders a list of parcels using ParcelCard. Handles empty states and status calculations.

**Props:**

- `parcels`: Array of ParcelCardData
- `onParcelClick?`: Optional click handler (receives parcelId)
- `emptyMessage?`: Message when no parcels
- `getWeekdayName`, `formatDate`, `formatTime`, `isDateInPast`: Utility functions
- `statusLabels`: Object with translated status labels
- `deletedLabel?`, `byLabel?`: Optional cancelled parcel labels

**Usage:**

```tsx
<ParcelList
    parcels={parcels}
    onParcelClick={handleParcelClick}
    emptyMessage={t("noFoodParcels")}
    getWeekdayName={getWeekdayName}
    formatDate={formatDate}
    formatTime={formatTime}
    isDateInPast={isDateInPast}
    statusLabels={{
        pickedUp: t("status.pickedUp"),
        notPickedUp: t("status.notPickedUp"),
        upcoming: t("status.upcoming"),
        cancelled: t("status.cancelled"),
    }}
/>
```

---

#### HouseholdDetailsPageSkeleton.tsx

Loading skeleton that mirrors the household detail page layout.

**Usage:**

```tsx
<Suspense fallback={<HouseholdDetailsPageSkeleton />}>
    <HouseholdDetailsPage ... />
</Suspense>
```

---

## Future Reuse Opportunities

### ParcelCard + ParcelList

These components are designed to be used in:

- **SMS Dashboard** - Display parcels with SMS status
- **Schedule Page** - Show upcoming parcels
- **Reports** - List parcels by date range
- **Admin Dashboard** - Quick parcel overview

### Example: Using in Another Page

```tsx
import { ParcelList, type ParcelCardData } from "@/app/[locale]/households/[id]/components";

function MyComponent() {
    const parcels: ParcelCardData[] = [...];

    return (
        <ParcelList
            parcels={parcels}
            onParcelClick={(id) => router.push(`/parcels/${id}`)}
            getWeekdayName={getWeekdayName}
            formatDate={formatDate}
            formatTime={formatTime}
            isDateInPast={isDateInPast}
            statusLabels={{ ... }}
        />
    );
}
```

## TypeScript Types

### ParcelCardData

```typescript
interface ParcelCardData {
    id: string;
    pickupDate: Date | string;
    pickupEarliestTime: Date | string;
    pickupLatestTime: Date | string;
    isPickedUp?: boolean | null;
    deletedAt?: Date | string | null;
    deletedBy?: string | null;
}
```

## Styling Notes

- Uses global `.hover-card` class for consistent hover effects
- All components use Mantine v8 components
- Responsive design with `base`, `sm`, `md`, `lg` breakpoints
- Consistent color scheme: blue (info), green (success), red (error), gray (cancelled)

## Performance Considerations

- All sub-components are functional components with React hooks
- No unnecessary re-renders (proper use of `useCallback`, `useMemo`)
- Loading states handled at page level
- Efficient list rendering with proper key usage
