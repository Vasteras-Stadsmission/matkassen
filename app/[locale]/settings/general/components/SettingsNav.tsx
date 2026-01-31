"use client";

import { useState, useEffect } from "react";
import { NavLink, Stack, ScrollArea, Box } from "@mantine/core";
import {
    IconFileText,
    IconChecklist,
    IconPackage,
    IconAlertTriangle,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export type SettingsSection =
    | "privacy-policy"
    | "enrollment-checklist"
    | "parcel-threshold"
    | "noshow-followup";

interface SettingsNavProps {
    activeSection: SettingsSection;
    onSectionChange: (section: SettingsSection) => void;
}

interface NavItem {
    section: SettingsSection;
    icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
    {
        section: "privacy-policy",
        icon: <IconFileText size={18} stroke={1.5} />,
    },
    {
        section: "enrollment-checklist",
        icon: <IconChecklist size={18} stroke={1.5} />,
    },
    {
        section: "parcel-threshold",
        icon: <IconPackage size={18} stroke={1.5} />,
    },
    {
        section: "noshow-followup",
        icon: <IconAlertTriangle size={18} stroke={1.5} />,
    },
];

// Use explicit translation keys to satisfy TypeScript's strict type checking
function getNavLabel(
    t: ReturnType<typeof useTranslations<"settings">>,
    section: SettingsSection,
): string {
    switch (section) {
        case "privacy-policy":
            return t("nav.privacyPolicy");
        case "enrollment-checklist":
            return t("nav.enrollmentChecklist");
        case "parcel-threshold":
            return t("nav.parcelThreshold");
        case "noshow-followup":
            return t("nav.noshowFollowup");
    }
}

export function SettingsNav({ activeSection, onSectionChange }: SettingsNavProps) {
    const t = useTranslations("settings");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent hydration mismatch by not rendering active state until mounted
    if (!mounted) {
        return (
            <Box>
                <ScrollArea>
                    <Stack gap={4}>
                        {NAV_ITEMS.map(item => (
                            <NavLink
                                key={item.section}
                                label={getNavLabel(t, item.section)}
                                leftSection={item.icon}
                            />
                        ))}
                    </Stack>
                </ScrollArea>
            </Box>
        );
    }

    return (
        <Box>
            <ScrollArea>
                <Stack gap={4}>
                    {NAV_ITEMS.map(item => (
                        <NavLink
                            key={item.section}
                            label={getNavLabel(t, item.section)}
                            leftSection={item.icon}
                            active={activeSection === item.section}
                            onClick={() => onSectionChange(item.section)}
                            style={{ borderRadius: "var(--mantine-radius-md)" }}
                        />
                    ))}
                </Stack>
            </ScrollArea>
        </Box>
    );
}
