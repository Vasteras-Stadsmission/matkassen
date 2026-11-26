"use client";

import { useState, useSyncExternalStore } from "react";
import { Alert, Text, Stack, CloseButton, Group, Anchor } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { Link } from "@/app/i18n/navigation";

// localStorage key used to remember that the user has dismissed the first-login
// welcome banner on this device. Using a simple string flag (not a timestamp)
// keeps it trivial to clear — just remove the key from DevTools.
const DISMISSED_STORAGE_KEY = "matkassen.welcomeBanner.dismissed";

// The banner doesn't follow dismissals made in other tabs
const subscribeToNothing = () => () => {};

function readDismissed(): boolean {
    try {
        return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === "1";
    } catch {
        // localStorage can throw in private mode or when storage is full.
        // Fail open (show the banner) — worst case is a minor repeated nag.
        return false;
    }
}

// The server can't read localStorage, so it renders the banner as dismissed
const readDismissedOnServer = () => true;

interface WelcomeBannerProps {
    /** User role from the server session. Banner only renders for handout_staff. */
    userRole?: string;
}

/**
 * One-time welcome banner shown to new handout_staff on their first visit to
 * the schedule hub. Dismissed state is kept in localStorage so it never returns
 * on the same device after the user clicks the close button.
 *
 * Admin users never see this banner — it's specifically for orienting staff
 * who just completed the sign-in onboarding flow.
 *
 * SSR-safe: renders nothing until the client has read localStorage,
 * which prevents a flash of the banner on navigations after a prior dismiss.
 */
export function WelcomeBanner({ userRole }: WelcomeBannerProps) {
    const t = useTranslations("schedule.welcomeBanner");
    const storedDismissed = useSyncExternalStore(
        subscribeToNothing,
        readDismissed,
        readDismissedOnServer,
    );
    const [dismissed, setDismissed] = useState(false);
    const visible = userRole === "handout_staff" && !storedDismissed && !dismissed;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            window.localStorage.setItem(DISMISSED_STORAGE_KEY, "1");
        } catch {
            // If we can't persist, that's fine — the banner still hides for
            // this session; it just won't stay hidden across reloads.
        }
    };

    if (!visible) {
        return null;
    }

    return (
        <Alert
            color="blue"
            variant="light"
            icon={<IconInfoCircle size={20} />}
            withCloseButton={false}
        >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} style={{ flex: 1 }}>
                    <Text fw={600}>{t("title")}</Text>
                    <Text size="sm">{t("body")}</Text>
                    <Anchor component={Link} href="/help/handout-staff" size="sm" fw={500}>
                        {t("readManual")}
                    </Anchor>
                </Stack>
                <CloseButton
                    onClick={handleDismiss}
                    aria-label={t("dismissAria")}
                    title={t("dismiss")}
                />
            </Group>
        </Alert>
    );
}
