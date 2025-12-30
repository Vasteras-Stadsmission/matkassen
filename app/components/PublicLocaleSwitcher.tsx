"use client";

import { useMemo, useTransition } from "react";
import { Menu, Button, Text } from "@mantine/core";
import { IconLanguage, IconChevronDown } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface LocaleOption {
    value: string;
    label: string;
}

interface PublicLocaleSwitcherProps {
    ariaLabel: string;
    menuLabel: string;
    currentValue: string;
    options: LocaleOption[];
}

// Native language names - what users actually recognize
const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
    sv: "Svenska",
    en: "English",
    ar: "العربية",
    fa: "فارسی",
    ku: "Kurdî",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    el: "Ελληνικά",
    sw: "Kiswahili",
    so: "Soomaali",
    so_so: "Soomaali (Koonfur)",
    uk: "Українська",
    ru: "Русский",
    ka: "ქართული",
    fi: "Suomi",
    it: "Italiano",
    th: "ไทย",
    vi: "Tiếng Việt",
    pl: "Polski",
};

function getNativeLanguageName(locale: string): string {
    return NATIVE_LANGUAGE_NAMES[locale] || locale;
}

export function PublicLocaleSwitcher({
    ariaLabel,
    menuLabel,
    currentValue,
    options,
}: PublicLocaleSwitcherProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const nativeOptions = useMemo(
        () =>
            options
                .map(option => ({
                    value: option.value,
                    label: getNativeLanguageName(option.value),
                }))
                .sort((a, b) => a.label.localeCompare(b.label, "en")),
        [options],
    );

    const currentLanguageName = getNativeLanguageName(currentValue);

    const handleLanguageChange = (newValue: string) => {
        const params = new URLSearchParams(searchParams ? searchParams.toString() : undefined);

        if (newValue) {
            params.set("lang", newValue);
        } else {
            params.delete("lang");
        }

        startTransition(() => {
            const query = params.toString();
            const nextUrl = query ? `${pathname}?${query}` : pathname;
            router.replace(nextUrl, { scroll: false });
        });
    };

    return (
        <Menu shadow="md" width={200} disabled={isPending} position="bottom-end">
            <Menu.Target>
                <Button
                    variant="light"
                    size="sm"
                    leftSection={<IconLanguage size={16} />}
                    rightSection={<IconChevronDown size={14} />}
                    loading={isPending}
                    aria-label={ariaLabel}
                >
                    {currentLanguageName}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>{menuLabel}</Menu.Label>
                {nativeOptions.map(option => (
                    <Menu.Item
                        key={option.value}
                        onClick={() => handleLanguageChange(option.value)}
                        style={{
                            backgroundColor:
                                option.value === currentValue
                                    ? "var(--mantine-color-blue-light)"
                                    : undefined,
                        }}
                    >
                        <Text size="sm">{option.label}</Text>
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}
