"use client";

import { NavLink, Stack, ScrollArea, Box, Text } from "@mantine/core";
import {
    IconMapPin,
    IconListDetails,
    IconChecklist,
    IconPackage,
    IconAlertTriangle,
    IconUsers,
    IconUserCheck,
    IconFileText,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/app/i18n/navigation";

interface NavItem {
    href: string;
    labelKey: string;
    icon: React.ReactNode;
}

interface NavGroup {
    groupKey: string;
    items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
    {
        groupKey: "operations",
        items: [
            {
                href: "/settings/locations",
                labelKey: "locations",
                icon: <IconMapPin size={18} stroke={1.5} />,
            },
            {
                href: "/settings/options",
                labelKey: "householdOptions",
                icon: <IconListDetails size={18} stroke={1.5} />,
            },
            {
                href: "/settings/enrollment-checklist",
                labelKey: "enrollmentChecklist",
                icon: <IconChecklist size={18} stroke={1.5} />,
            },
        ],
    },
    {
        groupKey: "reviewAndFollowUp",
        items: [
            {
                href: "/settings/parcel-limits",
                labelKey: "parcelThreshold",
                icon: <IconPackage size={18} stroke={1.5} />,
            },
            {
                href: "/settings/noshow-followup",
                labelKey: "noshowFollowup",
                icon: <IconAlertTriangle size={18} stroke={1.5} />,
            },
        ],
    },
    {
        groupKey: "administration",
        items: [
            {
                href: "/settings/users",
                labelKey: "users",
                icon: <IconUsers size={18} stroke={1.5} />,
            },
        ],
    },
    {
        groupKey: "legalAndCompliance",
        items: [
            {
                href: "/settings/user-agreement",
                labelKey: "userAgreement",
                icon: <IconUserCheck size={18} stroke={1.5} />,
            },
            {
                href: "/settings/privacy-policy",
                labelKey: "privacyPolicy",
                icon: <IconFileText size={18} stroke={1.5} />,
            },
        ],
    },
];

// Use explicit translation keys to satisfy TypeScript's strict type checking
function getNavLabel(t: ReturnType<typeof useTranslations<"settings">>, key: string): string {
    switch (key) {
        case "locations":
            return t("nav.locations");
        case "householdOptions":
            return t("nav.householdOptions");
        case "enrollmentChecklist":
            return t("nav.enrollmentChecklist");
        case "parcelThreshold":
            return t("nav.parcelThreshold");
        case "noshowFollowup":
            return t("nav.noshowFollowup");
        case "users":
            return t("nav.users");
        case "userAgreement":
            return t("nav.userAgreement");
        case "privacyPolicy":
            return t("nav.privacyPolicy");
        default:
            return key;
    }
}

function getGroupLabel(t: ReturnType<typeof useTranslations<"settings">>, key: string): string {
    switch (key) {
        case "operations":
            return t("nav.groups.operations");
        case "reviewAndFollowUp":
            return t("nav.groups.reviewAndFollowUp");
        case "administration":
            return t("nav.groups.administration");
        case "legalAndCompliance":
            return t("nav.groups.legalAndCompliance");
        default:
            return key;
    }
}

export function SettingsNav() {
    const t = useTranslations("settings");
    const pathname = usePathname();

    return (
        <Box>
            <ScrollArea>
                <Stack gap="lg">
                    {NAV_GROUPS.map(group => (
                        <Box key={group.groupKey}>
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4} px="sm">
                                {getGroupLabel(t, group.groupKey)}
                            </Text>
                            <Stack gap={2}>
                                {group.items.map(item => (
                                    <NavLink
                                        key={item.href}
                                        label={getNavLabel(t, item.labelKey)}
                                        leftSection={item.icon}
                                        active={pathname === item.href}
                                        component={Link}
                                        href={item.href}
                                        style={{ borderRadius: "var(--mantine-radius-md)" }}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            </ScrollArea>
        </Box>
    );
}
