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
    labelKey: string;
    icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
    {
        section: "privacy-policy",
        labelKey: "nav.privacyPolicy",
        icon: <IconFileText size={18} stroke={1.5} />,
    },
    {
        section: "enrollment-checklist",
        labelKey: "nav.enrollmentChecklist",
        icon: <IconChecklist size={18} stroke={1.5} />,
    },
    {
        section: "parcel-threshold",
        labelKey: "nav.parcelThreshold",
        icon: <IconPackage size={18} stroke={1.5} />,
    },
    {
        section: "noshow-followup",
        labelKey: "nav.noshowFollowup",
        icon: <IconAlertTriangle size={18} stroke={1.5} />,
    },
];

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
                                label={t(item.labelKey)}
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
                            label={t(item.labelKey)}
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
