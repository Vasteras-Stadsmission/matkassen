"use client";

import { Menu, ActionIcon, rem } from "@mantine/core";
import { IconSettings, IconAdjustments, IconMapPin } from "@tabler/icons-react";
import { Link } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";

export function SettingsDropdown() {
    const t = useTranslations("settings");

    return (
        <Menu shadow="md" width={200} position="bottom-end" withinPortal zIndex={1100}>
            <Menu.Target>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="lg"
                    aria-label={t("aria.settingsMenu")}
                >
                    <IconSettings style={{ width: rem(18), height: rem(18) }} stroke={1.5} />
                </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>{t("settings")}</Menu.Label>

                <Menu.Item
                    leftSection={
                        <IconAdjustments
                            style={{ width: rem(14), height: rem(14) }}
                            aria-hidden="true"
                        />
                    }
                    component={Link}
                    href="/settings/general"
                >
                    {t("general")}
                </Menu.Item>

                <Menu.Item
                    leftSection={
                        <IconMapPin
                            style={{ width: rem(14), height: rem(14) }}
                            aria-hidden="true"
                        />
                    }
                    component={Link}
                    href="/settings/locations"
                >
                    {t("locations")}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}
