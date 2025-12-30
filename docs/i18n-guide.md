# Internationalization (i18n) Guide

## Overview

The project uses `next-intl` for internationalization with:

- **Swedish (sv)** as the default locale
- **English (en)** fully supported for admin UI
- **20+ languages** for public parcel pages

## Message Files

### Admin UI

- `messages/en.json` - English translations
- `messages/sv.json` - Swedish translations (default)

### Public Parcel Pages

- `messages/public-en.json`
- `messages/public-sv.json`
- `messages/public-ar.json` (Arabic)
- `messages/public-de.json` (German)
- `messages/public-el.json` (Greek)
- `messages/public-es.json` (Spanish)
- `messages/public-fa.json` (Persian)
- `messages/public-fi.json` (Finnish)
- `messages/public-fr.json` (French)
- `messages/public-it.json` (Italian)
- `messages/public-ka.json` (Georgian)
- `messages/public-ku.json` (Kurdish)
- `messages/public-pl.json` (Polish)
- `messages/public-ru.json` (Russian)
- `messages/public-so.json` (Somali)
- `messages/public-sw.json` (Swahili)
- `messages/public-th.json` (Thai)
- `messages/public-uk.json` (Ukrainian)
- `messages/public-vi.json` (Vietnamese)

## Usage Patterns

### Server Components

```typescript
import { getTranslations } from "next-intl/server";

export default async function ExamplePage() {
    const t = await getTranslations("Households");

    return (
        <div>
            <h1>{t("title")}</h1>
            <p>{t("description")}</p>
        </div>
    );
}
```

### Client Components

```typescript
"use client";
import { useTranslations } from "next-intl";

export function ExampleClient() {
    const t = useTranslations("Households");

    return (
        <div>
            <h1>{t("title")}</h1>
        </div>
    );
}
```

### With Parameters

```typescript
// Message: "Welcome, {name}!"
const t = useTranslations("Common");
<p>{t("welcome", { name: "John" })}</p>
```

### Pluralization

```typescript
// messages/en.json
{
    "parcels": {
        "count": "{count, plural, =0 {No parcels} one {1 parcel} other {# parcels}}"
    }
}

// Usage
<p>{t("parcels.count", { count: 5 })}</p>
// Output: "5 parcels"
```

### Dates and Times

```typescript
import { LocalizedDate } from "@/components/LocalizedDate";

<LocalizedDate date={new Date()} format="long" />
```

## Message Organization

### Namespaces

Group related messages by feature:

```json
{
    "Households": {
        "title": "Households",
        "addNew": "Add Household",
        "edit": "Edit Household"
    },
    "Schedule": {
        "title": "Parcel Schedule",
        "createParcel": "Create Parcel"
    },
    "Common": {
        "save": "Save",
        "cancel": "Cancel",
        "delete": "Delete"
    }
}
```

### Nested Keys

```json
{
    "Households": {
        "form": {
            "name": "Name",
            "phoneNumber": "Phone Number",
            "validation": {
                "nameRequired": "Name is required",
                "phoneInvalid": "Invalid phone number"
            }
        }
    }
}
```

Usage:

```typescript
const t = useTranslations("Households.form");
<label>{t("name")}</label>
<span>{t("validation.nameRequired")}</span>
```

## Adding New Messages

### 1. Add to English

```json
// messages/en.json
{
    "NewFeature": {
        "title": "New Feature",
        "description": "This is a new feature"
    }
}
```

### 2. Add to Swedish

```json
// messages/sv.json
{
    "NewFeature": {
        "title": "Ny funktion",
        "description": "Detta är en ny funktion"
    }
}
```

### 3. Use in Code

```typescript
const t = useTranslations("NewFeature");
<h1>{t("title")}</h1>
```

### 4. For Public Pages

Add to all `messages/public-*.json` files:

```json
// messages/public-en.json
{
    "parcelPage": {
        "newMessage": "Your new message"
    }
}

// messages/public-sv.json
{
    "parcelPage": {
        "newMessage": "Ditt nya meddelande"
    }
}

// ... repeat for all 20+ languages
```

## Navigation

### Locale-Aware Links

```typescript
import { Link } from "@/app/i18n/navigation";

// Automatically includes locale prefix
<Link href="/households">Households</Link>
// Renders: /sv/households (if Swedish)
// Renders: /en/households (if English)
```

### Programmatic Navigation

```typescript
"use client";
import { useRouter } from "@/app/i18n/navigation";

export function ExampleComponent() {
    const router = useRouter();

    const handleClick = () => {
        router.push("/households");
    };

    return <button onClick={handleClick}>Go to Households</button>;
}
```

### External Links (No Locale)

```typescript
import Link from "next/link"; // NOT from @/app/i18n/navigation

<Link href="/api/health">Health Check</Link>
// No locale prefix
```

## Language Switching

```typescript
// components/LanguageSwitcher.tsx
"use client";
import { usePathname, useRouter } from "@/app/i18n/navigation";
import { useLocale } from "next-intl";

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();

    const switchLocale = (newLocale: string) => {
        router.replace(pathname, { locale: newLocale });
    };

    return (
        <button onClick={() => switchLocale(locale === "sv" ? "en" : "sv")}>
            {locale === "sv" ? "English" : "Svenska"}
        </button>
    );
}
```

## Public Parcel Pages

**No locale prefix** - uses query parameter instead:

```typescript
// app/p/[parcelId]/page.tsx
import { getTranslations } from "next-intl/server";

export default async function ParcelPage({
    searchParams,
}: {
    searchParams: { lang?: string };
}) {
    const locale = searchParams.lang || "sv";

    // Load public messages
    const messages = await import(`@/messages/public-${locale}.json`);
    const t = await getTranslations({ locale, messages, namespace: "parcelPage" });

    return <h1>{t("title")}</h1>;
}
```

URL structure:

- `/p/abc12345` - Default (Swedish)
- `/p/abc12345?lang=en` - English
- `/p/abc12345?lang=ar` - Arabic

## TypeScript Support

Generate types from messages:

```bash
pnpm exec next-intl-type-gen
```

This creates `messages/en.d.json.ts` for type-safe keys:

```typescript
// Type-safe!
const t = useTranslations("Households");
t("title"); // ✅ Valid
t("nonExistent"); // ❌ TypeScript error
```

## Best Practices

### ✅ DO

- Use message IDs for ALL user-facing text
- Keep messages short and descriptive
- Group related messages by namespace
- Use parameters for dynamic content
- Test with both locales

### ❌ DON'T

- Hardcode strings: `<h1>Households</h1>`
- Use English text as keys: `t("Add new household")`
- Mix Swedish and English in same file
- Forget to add to both languages
- Use text content for test selectors (breaks i18n)

## Common Patterns

### Form Labels

```typescript
const t = useTranslations("Households.form");

<TextInput
    label={t("name")}
    placeholder={t("namePlaceholder")}
    error={errors.name && t("validation.nameRequired")}
/>
```

### Table Headers

```typescript
const t = useTranslations("Households.table");

<DataTable
    columns={[
        { accessor: "name", title: t("name") },
        { accessor: "phoneNumber", title: t("phoneNumber") },
        { accessor: "createdAt", title: t("createdAt") },
    ]}
/>
```

### Notifications

```typescript
const t = useTranslations("Households.notifications");

notifications.show({
    title: t("success.title"),
    message: t("success.householdCreated", { name: household.name }),
    color: "green",
});
```

## Testing

### Unit Tests

```typescript
import { NextIntlClientProvider } from "next-intl";
import { render } from "@testing-library/react";
import messages from "@/messages/en.json";

test("renders translated text", () => {
    render(
        <NextIntlClientProvider locale="en" messages={messages}>
            <ExampleComponent />
        </NextIntlClientProvider>,
    );
});
```

### E2E Tests

**Never use text content for selectors** (breaks with locale changes):

```typescript
// ❌ DON'T
await page.getByText("Households").click();

// ✅ DO
await page.locator('[data-testid="households-link"]').click();
```

## Related Documentation

- **Development**: See `docs/dev-guide.md` for project structure
- **Testing**: See `docs/testing-guide.md` for E2E test patterns
