# Household Parcel Count Warning System - Implementation Plan

## Overview
Implement a warning system that alerts administrators when a household exceeds a configurable threshold of food parcels. The warning is **non-blocking** but requires acknowledgment when adding more parcels.

## Core Requirement
- **Threshold Logic**: If threshold is set to `10`, warnings appear when parcel count is `11` or higher (strictly greater than threshold)
- **Scope**: Counts ALL parcels (past and future), excluding soft-deleted ones
- **Global Setting**: Single threshold applies to all locations (not per-location)

---

## Phase 1: Database Schema

### 1.1 Create Global Settings Table

**File**: `app/db/schema.ts`

Add after `cspViolations` table (around line 424):

```typescript
// Global settings for system-wide configuration
export const globalSettings = pgTable("global_settings", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    key: text("key").notNull().unique(), // e.g., "parcel_warning_threshold"
    value: text("value"), // Nullable - null means disabled. Store as string, parse as needed
    updated_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    updated_by: varchar("updated_by", { length: 50 }), // GitHub username who last updated
});
```

### 1.2 Generate Migration

```bash
pnpm run db:generate
```

This will create a new migration file in `migrations/`. Review it before proceeding.

---

## Phase 2: Core Utility Functions

### 2.1 Create Parcel Warning Utilities

**File**: `app/utils/parcel-warnings.ts` (NEW FILE)

```typescript
import { db } from "@/app/db/drizzle";
import { globalSettings, foodParcels } from "@/app/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const PARCEL_WARNING_THRESHOLD_KEY = "parcel_warning_threshold";

/**
 * Get the current parcel warning threshold.
 * Returns null if not set (warnings disabled).
 */
export async function getParcelWarningThreshold(): Promise<number | null> {
    const [setting] = await db
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.key, PARCEL_WARNING_THRESHOLD_KEY));

    if (!setting?.value) {
        return null;
    }

    const threshold = parseInt(setting.value, 10);
    return isNaN(threshold) ? null : threshold;
}

/**
 * Get the total count of parcels for a household (both past and future, excluding soft-deleted).
 */
export async function getHouseholdParcelCount(householdId: string): Promise<number> {
    const parcels = await db
        .select()
        .from(foodParcels)
        .where(and(eq(foodParcels.household_id, householdId), isNull(foodParcels.deleted_at)));

    return parcels.length;
}

/**
 * Check if a household should show a parcel warning.
 * Returns an object with warning status and relevant data.
 */
export async function shouldShowParcelWarning(householdId: string): Promise<{
    shouldWarn: boolean;
    parcelCount: number;
    threshold: number | null;
}> {
    const [threshold, parcelCount] = await Promise.all([
        getParcelWarningThreshold(),
        getHouseholdParcelCount(householdId),
    ]);

    // Warning shows when parcel count is GREATER THAN threshold (not equal)
    const shouldWarn = threshold !== null && parcelCount > threshold;

    return {
        shouldWarn,
        parcelCount,
        threshold,
    };
}
```

---

## Phase 3: Settings Page for Threshold Configuration

### 3.1 Create Settings Actions

**File**: `app/[locale]/settings/parcels/actions.ts` (NEW FILE)

```typescript
"use server";

import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import { globalSettings } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "@/app/db/schema";
import { revalidatePath } from "next/cache";
import { routing } from "@/app/i18n/routing";
import { logError } from "@/app/utils/logger";

const PARCEL_WARNING_THRESHOLD_KEY = "parcel_warning_threshold";

/**
 * Revalidates the settings/parcels page for all supported locales.
 */
function revalidateSettingsPage() {
    routing.locales.forEach(locale => {
        revalidatePath(`/${locale}/settings/parcels`, "page");
    });
}

export interface ParcelThresholdSetting {
    threshold: number | null; // null means disabled
}

/**
 * Get the current parcel warning threshold setting.
 */
export const getParcelWarningThreshold = protectedAction(
    async (): Promise<ActionResult<ParcelThresholdSetting>> => {
        try {
            const [setting] = await db
                .select()
                .from(globalSettings)
                .where(eq(globalSettings.key, PARCEL_WARNING_THRESHOLD_KEY));

            const threshold = setting?.value ? parseInt(setting.value, 10) : null;

            return success({ threshold });
        } catch (error) {
            logError("Error fetching parcel warning threshold", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch parcel warning threshold",
            });
        }
    },
);

/**
 * Update the parcel warning threshold setting.
 * Pass null to disable warnings.
 */
export const updateParcelWarningThreshold = protectedAction(
    async (session, threshold: number | null): Promise<ActionResult<ParcelThresholdSetting>> => {
        try {
            // Validate threshold if provided
            if (threshold !== null) {
                if (!Number.isInteger(threshold) || threshold < 1) {
                    return failure({
                        code: "VALIDATION_ERROR",
                        message: "Threshold must be a positive integer",
                    });
                }
            }

            const value = threshold !== null ? threshold.toString() : null;

            // Upsert the setting
            const [existingSetting] = await db
                .select()
                .from(globalSettings)
                .where(eq(globalSettings.key, PARCEL_WARNING_THRESHOLD_KEY));

            if (existingSetting) {
                await db
                    .update(globalSettings)
                    .set({
                        value,
                        updated_at: new Date(),
                        updated_by: session.user?.githubUsername,
                    })
                    .where(eq(globalSettings.key, PARCEL_WARNING_THRESHOLD_KEY));
            } else {
                await db.insert(globalSettings).values({
                    id: nanoid(8),
                    key: PARCEL_WARNING_THRESHOLD_KEY,
                    value,
                    updated_by: session.user?.githubUsername,
                });
            }

            revalidateSettingsPage();
            return success({ threshold });
        } catch (error) {
            logError("Error updating parcel warning threshold", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update parcel warning threshold",
            });
        }
    },
);
```

### 3.2 Create Settings UI Component

**File**: `app/[locale]/settings/parcels/components/ParcelThresholdSettings.tsx` (NEW FILE)

```typescript
"use client";

import { useState, useEffect } from "react";
import { Container, Title, Text, Button, Stack, Card, NumberInput, Alert } from "@mantine/core";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { getParcelWarningThreshold, updateParcelWarningThreshold } from "../actions";

export function ParcelThresholdSettings() {
    const t = useTranslations("settings.parcelThreshold");
    const [threshold, setThreshold] = useState<number | string>("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Load current threshold on mount
    useEffect(() => {
        async function loadThreshold() {
            setLoading(true);
            const result = await getParcelWarningThreshold();
            if (result.success) {
                setThreshold(result.data.threshold ?? "");
            } else {
                notifications.show({
                    title: t("errors.loadFailedTitle"),
                    message: t("errors.loadFailedMessage"),
                    color: "red",
                });
            }
            setLoading(false);
        }
        loadThreshold();
    }, [t]);

    const handleSave = async () => {
        setSaving(true);
        const thresholdValue = threshold === "" ? null : Number(threshold);

        const result = await updateParcelWarningThreshold(thresholdValue);
        if (result.success) {
            notifications.show({
                title: t("success.savedTitle"),
                message: t("success.savedMessage"),
                color: "green",
            });
        } else {
            notifications.show({
                title: t("errors.saveFailedTitle"),
                message: result.error?.message || t("errors.saveFailedMessage"),
                color: "red",
            });
        }
        setSaving(false);
    };

    const handleClear = () => {
        setThreshold("");
    };

    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                <div>
                    <Title order={1}>{t("title")}</Title>
                    <Text c="dimmed" mt="xs">
                        {t("description")}
                    </Text>
                </div>

                <Alert icon={<IconInfoCircle />} color="blue" variant="light">
                    {t("infoMessage")}
                </Alert>

                <Card shadow="sm" padding="lg" withBorder>
                    <Stack gap="md">
                        <NumberInput
                            label={t("thresholdLabel")}
                            description={t("thresholdDescription")}
                            placeholder={t("thresholdPlaceholder")}
                            value={threshold}
                            onChange={setThreshold}
                            min={1}
                            disabled={loading || saving}
                            allowNegative={false}
                            allowDecimal={false}
                            hideControls={false}
                        />

                        {threshold !== "" && (
                            <Alert icon={<IconAlertCircle />} color="orange" variant="light">
                                {t("warningPreview", { threshold: Number(threshold) })}
                            </Alert>
                        )}

                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <Button onClick={handleSave} loading={saving} disabled={loading}>
                                {t("saveButton")}
                            </Button>
                            <Button
                                onClick={handleClear}
                                variant="outline"
                                disabled={loading || saving || threshold === ""}
                            >
                                {t("clearButton")}
                            </Button>
                        </div>
                    </Stack>
                </Card>
            </Stack>
        </Container>
    );
}
```

### 3.3 Create Settings Page

**File**: `app/[locale]/settings/parcels/page.tsx` (NEW FILE)

```typescript
import { AuthProtection } from "@/components/AuthProtection";
import { ParcelThresholdSettings } from "./components/ParcelThresholdSettings";

export default async function ParcelSettingsPage() {
    return (
        <AuthProtection>
            <ParcelThresholdSettings />
        </AuthProtection>
    );
}
```

### 3.4 Update Settings Dropdown Menu

**File**: `components/SettingsDropdown/SettingsDropdown.tsx`

1. Add `IconPackage` to imports (line 4):
```typescript
import { IconSettings, IconAdjustments, IconMapPin, IconPackage } from "@tabler/icons-react";
```

2. Add new menu item after "Locations" (after line 51):
```typescript
<Menu.Item
    leftSection={
        <IconPackage
            style={{ width: rem(14), height: rem(14) }}
            aria-hidden="true"
        />
    }
    component={Link}
    href="/settings/parcels"
>
    {t("parcels")}
</Menu.Item>
```

---

## Phase 4: Warning Display - Household Details Page

### 4.1 Update Household Details Page Component

**File**: `app/[locale]/households/[id]/components/HouseholdDetailsPage.tsx`

1. Add `IconAlertCircle` to imports (line 32):
```typescript
import {
    // ... existing icons
    IconAlertCircle,
} from "@tabler/icons-react";
```

2. Update interface to accept warning data (around line 45):
```typescript
interface HouseholdDetailsPageProps {
    householdId: string;
    initialData: Awaited<ReturnType<typeof getHouseholdDetails>>;
    testMode: boolean;
    warningData?: {
        shouldWarn: boolean;
        parcelCount: number;
        threshold: number | null;
    };
}

export default function HouseholdDetailsPage({
    householdId,
    initialData,
    testMode: isTestMode,
    warningData,
}: HouseholdDetailsPageProps) {
```

3. Add warning banner after test mode warning (after line 279):
```typescript
{/* Test Mode Warning Banner */}
{isTestMode && (
    <Alert variant="light" color="yellow">
        {tSms("testModeWarning")}
    </Alert>
)}

{/* Parcel Count Warning Banner */}
{warningData?.shouldWarn && warningData.threshold !== null && (
    <Alert variant="light" color="orange" icon={<IconAlertCircle />}>
        {t("warnings.parcelCountHigh", {
            count: warningData.parcelCount,
            threshold: warningData.threshold,
        })}
    </Alert>
)}
```

### 4.2 Update Household Page to Fetch Warning Data

**File**: `app/[locale]/households/[id]/page.tsx`

1. Add import (line 10):
```typescript
import { shouldShowParcelWarning } from "@/app/utils/parcel-warnings";
```

2. Fetch warning data before return (around line 62):
```typescript
// Check if we should show parcel warning
const warningData = await shouldShowParcelWarning(id);

return (
    <AuthProtection>
        <Suspense fallback={<HouseholdDetailsPageSkeleton />}>
            <HouseholdDetailsPage
                householdId={id}
                initialData={householdDetails}
                testMode={testMode}
                warningData={warningData}
            />
        </Suspense>
    </AuthProtection>
);
```

---

## Phase 5: Warning Modal - Parcel Management Form

### 5.1 Create Warning Modal Component

**File**: `components/ParcelManagementForm/ParcelWarningModal.tsx` (NEW FILE)

```typescript
"use client";

import { Modal, Text, Button, Group, Checkbox, Alert, Stack } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

interface ParcelWarningModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: () => void;
    parcelCount: number;
    threshold: number;
    householdName: string;
}

export function ParcelWarningModal({
    opened,
    onClose,
    onConfirm,
    parcelCount,
    threshold,
    householdName,
}: ParcelWarningModalProps) {
    const t = useTranslations("parcelWarning");
    const [acknowledged, setAcknowledged] = useState(false);

    const handleConfirm = () => {
        onConfirm();
        setAcknowledged(false); // Reset for next time
    };

    const handleClose = () => {
        onClose();
        setAcknowledged(false); // Reset checkbox when closing
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={t("modal.title")}
            centered
            size="md"
            closeOnClickOutside={false}
        >
            <Stack gap="md">
                <Alert icon={<IconAlertTriangle />} color="orange" variant="light">
                    <Text size="sm">
                        {t("modal.message", {
                            householdName,
                            count: parcelCount,
                            threshold,
                        })}
                    </Text>
                </Alert>

                <Text size="sm" c="dimmed">
                    {t("modal.explanation")}
                </Text>

                <Checkbox
                    checked={acknowledged}
                    onChange={event => setAcknowledged(event.currentTarget.checked)}
                    label={t("modal.acknowledgmentLabel")}
                />

                <Group justify="flex-end" mt="md">
                    <Button variant="outline" onClick={handleClose}>
                        {t("modal.cancelButton")}
                    </Button>
                    <Button onClick={handleConfirm} disabled={!acknowledged} color="orange">
                        {t("modal.confirmButton")}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
```

### 5.2 Update Parcel Management Form

**File**: `components/ParcelManagementForm/ParcelManagementForm.tsx`

1. Add import (line 12):
```typescript
import { ParcelWarningModal } from "./ParcelWarningModal";
```

2. Update interface (around line 14):
```typescript
interface ParcelManagementFormProps {
    householdName: string;
    householdId?: string; // Added for warning check
    initialData?: FoodParcels;
    onSubmit?: (data: FoodParcels) => Promise<ActionResult<void>>;
    isLoading?: boolean;
    loadError?: string | null;
    warningData?: {
        shouldWarn: boolean;
        parcelCount: number;
        threshold: number | null;
    };
}

export function ParcelManagementForm({
    householdName,
    householdId,
    initialData,
    onSubmit,
    isLoading = false,
    loadError = null,
    warningData,
}: ParcelManagementFormProps) {
```

3. Add state for modal (after line 41):
```typescript
const [isSubmitting, setIsSubmitting] = useState(false);
const [showWarningModal, setShowWarningModal] = useState(false);
const [warningAcknowledged, setWarningAcknowledged] = useState(false);
```

4. Add warning confirmation handler (after updateFormData, around line 67):
```typescript
// Handle warning modal confirmation
const handleWarningConfirm = () => {
    setWarningAcknowledged(true);
    setShowWarningModal(false);
    // Trigger submit again now that warning is acknowledged
    setTimeout(() => handleSubmit(), 0);
};
```

5. Update handleSubmit to check for warnings (around line 78):
```typescript
// Handle form submission
const handleSubmit = async () => {
    if (isSubmitting) return;

    // Clear previous status
    setValidationError(null);
    setValidationErrors([]);

    // Validate pickup location
    if (!formData.pickupLocationId) {
        setValidationError({
            field: "pickupLocationId",
            message: t("validation.pickupLocation"),
            code: "REQUIRED_FIELD",
        });
        return;
    }

    // Check if we need to show warning modal
    if (warningData?.shouldWarn && !warningAcknowledged) {
        setShowWarningModal(true);
        return;
    }

    if (!onSubmit) return;

    // ... rest of submit logic
```

6. Add modal to render (in return statement, before breadcrumb around line 215):
```typescript
return (
    <Container size="lg" py="md">
        {/* Warning Modal */}
        {warningData?.shouldWarn && warningData.threshold !== null && (
            <ParcelWarningModal
                opened={showWarningModal}
                onClose={() => setShowWarningModal(false)}
                onConfirm={handleWarningConfirm}
                parcelCount={warningData.parcelCount}
                threshold={warningData.threshold}
                householdName={householdName}
            />
        )}

        {/* Breadcrumb */}
        {/* ... rest of component */}
```

### 5.3 Update Parcel Management Client

**File**: `app/[locale]/households/[id]/parcels/ParcelManagementClient.tsx`

Update to pass warning data:

```typescript
interface ParcelManagementClientProps {
    householdId: string;
    householdName: string;
    initialData?: FoodParcels;
    warningData?: {
        shouldWarn: boolean;
        parcelCount: number;
        threshold: number | null;
    };
}

export function ParcelManagementClient({
    householdId,
    householdName,
    initialData,
    warningData,
}: ParcelManagementClientProps) {
    const handleSubmit = async (data: FoodParcels) => {
        return await updateHouseholdParcels(householdId, data);
    };

    return (
        <ParcelManagementForm
            householdId={householdId}
            householdName={householdName}
            initialData={initialData}
            onSubmit={handleSubmit}
            warningData={warningData}
        />
    );
}
```

### 5.4 Update Parcel Management Page

**File**: `app/[locale]/households/[id]/parcels/page.tsx`

1. Add import (line 7):
```typescript
import { shouldShowParcelWarning } from "@/app/utils/parcel-warnings";
```

2. Fetch and pass warning data (around line 40):
```typescript
const householdData = result.data;
const householdName = `${householdData.household.first_name} ${householdData.household.last_name}`;

// Check if we should show parcel warning
const warningData = await shouldShowParcelWarning(householdId);

return (
    <AuthProtection>
        <ParcelManagementClient
            householdId={householdId}
            householdName={householdName}
            initialData={householdData.foodParcels}
            warningData={warningData}
        />
    </AuthProtection>
);
```

---

## Phase 6: Translations

### 6.1 English Translations

**File**: `messages/en.json`

Add to `"settings"` object (around line 1060):
```json
"parcels": "Parcel Limits",
```

Add new section before `"smsTemplates"` (around line 1131):
```json
"parcelThreshold": {
    "title": "Parcel Warning Threshold",
    "description": "Set the number of parcels after which to warn administrators about high household usage",
    "infoMessage": "When a household exceeds this number of parcels, a warning will appear on the household details page and when adding more parcels. This helps identify households that may need additional support or review.",
    "thresholdLabel": "Warning Threshold",
    "thresholdDescription": "Number of parcels before warning appears",
    "thresholdPlaceholder": "e.g., 10",
    "warningPreview": "Warnings will appear for households with more than {threshold} parcels",
    "saveButton": "Save",
    "clearButton": "Clear (Disable Warnings)",
    "success": {
        "savedTitle": "Saved",
        "savedMessage": "Parcel warning threshold has been updated"
    },
    "errors": {
        "loadFailedTitle": "Error",
        "loadFailedMessage": "Failed to load parcel warning threshold",
        "saveFailedTitle": "Error",
        "saveFailedMessage": "Failed to save parcel warning threshold"
    }
},
```

Add new top-level sections (at end, before closing brace):
```json
"parcelWarning": {
    "modal": {
        "title": "High Parcel Count Warning",
        "message": "{householdName} has received {count} food parcels (threshold: {threshold}).",
        "explanation": "This household has exceeded the parcel limit threshold. Please verify that they have received appropriate support and assistance. You can still add more parcels, but this requires acknowledgment.",
        "acknowledgmentLabel": "I acknowledge this household may need additional review or support",
        "confirmButton": "Continue Adding Parcels",
        "cancelButton": "Cancel"
    }
},
"householdDetail": {
    "warnings": {
        "parcelCountHigh": "This household has received {count} food parcels (threshold: {threshold}). Consider reviewing their situation and providing additional support."
    }
}
```

### 6.2 Swedish Translations

**File**: `messages/sv.json`

Add to `"settings"` object (around line 1060):
```json
"parcels": "Paketgränser",
```

Add new section before `"smsTemplates"` (around line 1131):
```json
"parcelThreshold": {
    "title": "Varningsgräns för matpaket",
    "description": "Ange antalet matpaket varefter systemet ska varna administratörer om hög användning",
    "infoMessage": "När ett hushåll överskrider detta antal matpaket visas en varning på hushållets detaljsida och när fler paket läggs till. Detta hjälper till att identifiera hushåll som kan behöva ytterligare stöd eller genomgång.",
    "thresholdLabel": "Varningsgräns",
    "thresholdDescription": "Antal matpaket innan varning visas",
    "thresholdPlaceholder": "t.ex. 10",
    "warningPreview": "Varningar visas för hushåll med fler än {threshold} matpaket",
    "saveButton": "Spara",
    "clearButton": "Rensa (inaktivera varningar)",
    "success": {
        "savedTitle": "Sparat",
        "savedMessage": "Varningsgränsen för matpaket har uppdaterats"
    },
    "errors": {
        "loadFailedTitle": "Fel",
        "loadFailedMessage": "Kunde inte ladda varningsgräns för matpaket",
        "saveFailedTitle": "Fel",
        "saveFailedMessage": "Kunde inte spara varningsgräns för matpaket"
    }
},
```

Add new top-level sections (at end, before closing brace):
```json
"parcelWarning": {
    "modal": {
        "title": "Varning för högt antal matpaket",
        "message": "{householdName} har mottagit {count} matpaket (gräns: {threshold}).",
        "explanation": "Detta hushåll har överskridit varningsgränsen för matpaket. Vänligen verifiera att de har fått lämpligt stöd och hjälp. Du kan fortfarande lägga till fler paket, men detta kräver bekräftelse.",
        "acknowledgmentLabel": "Jag bekräftar att detta hushåll kan behöva ytterligare genomgång eller stöd",
        "confirmButton": "Fortsätt lägga till matpaket",
        "cancelButton": "Avbryt"
    }
},
"householdDetail": {
    "warnings": {
        "parcelCountHigh": "Detta hushåll har mottagit {count} matpaket (gräns: {threshold}). Överväg att granska deras situation och erbjuda ytterligare stöd."
    }
}
```

---

## Testing Checklist

### Manual Testing Steps

1. **Database Migration**
   ```bash
   pnpm dev  # Will auto-run migrations
   ```
   - Verify `global_settings` table exists in database
   - Check migration was applied successfully

2. **Settings Page**
   - Navigate to ⚙️ Settings → Parcel Limits
   - Set threshold to 10
   - Save and verify success notification
   - Clear threshold and verify warnings are disabled
   - Refresh page and verify value persists

3. **Household Details Warning**
   - Find or create a household with 11+ parcels
   - Navigate to household details page
   - Verify orange warning banner appears
   - Verify banner shows correct count and threshold
   - Check a household with ≤10 parcels has no warning

4. **Parcel Management Modal**
   - Go to household with 11+ parcels
   - Click "Manage Parcels"
   - Try to add a new parcel
   - Verify modal appears before submission
   - Try to submit without checking acknowledgment (should be disabled)
   - Check acknowledgment checkbox
   - Click "Continue Adding Parcels"
   - Verify form submits successfully

5. **Edge Cases**
   - Test with threshold = 0 (should warn at 1+)
   - Test with threshold = null (no warnings)
   - Test with exactly threshold parcels (should NOT warn)
   - Test with threshold + 1 parcels (SHOULD warn)

### TypeScript Check

After dev server starts (which generates translation types):
```bash
pnpm typecheck
```

Should pass with no errors.

---

## Important Notes

### Warning Threshold Logic
⚠️ **CRITICAL**: Warnings trigger when `parcelCount > threshold` (strictly greater than)
- Threshold = 10 → Warns at 11 or more
- Threshold = 5 → Warns at 6 or more
- This is intentional and by design

### Parcel Counting
- Counts ALL parcels (past and future dates)
- EXCLUDES soft-deleted parcels (`deleted_at IS NULL`)
- No distinction between picked up vs not picked up

### Translation Types
- Translation types are auto-generated when dev server starts
- TypeScript errors about translation keys are expected until after first `pnpm dev`
- Don't worry about these during implementation

### Session User Field
- Use `session.user?.githubUsername` (NOT `session.user.username`)
- The optional chaining is important for type safety

---

## Files Summary

### New Files (8)
1. `app/utils/parcel-warnings.ts`
2. `app/[locale]/settings/parcels/actions.ts`
3. `app/[locale]/settings/parcels/components/ParcelThresholdSettings.tsx`
4. `app/[locale]/settings/parcels/page.tsx`
5. `components/ParcelManagementForm/ParcelWarningModal.tsx`
6. Migration file (auto-generated)

### Modified Files (8)
1. `app/db/schema.ts` - Add globalSettings table
2. `components/SettingsDropdown/SettingsDropdown.tsx` - Add menu item
3. `app/[locale]/households/[id]/page.tsx` - Fetch warning data
4. `app/[locale]/households/[id]/components/HouseholdDetailsPage.tsx` - Display banner
5. `app/[locale]/households/[id]/parcels/page.tsx` - Fetch warning for form
6. `app/[locale]/households/[id]/parcels/ParcelManagementClient.tsx` - Pass warning data
7. `components/ParcelManagementForm/ParcelManagementForm.tsx` - Modal integration
8. `messages/en.json` & `messages/sv.json` - Translations

---

## Implementation Order

Follow phases in order:
1. Phase 1 (Database) - Must be first
2. Phase 2 (Utilities) - Needed by all other phases
3. Phase 3 (Settings) - Can test threshold configuration
4. Phase 4 (Details Page) - Visual confirmation warnings work
5. Phase 5 (Modal) - Most complex part
6. Phase 6 (Translations) - Can be done alongside other phases

Good luck! 🚀
