"use client";

import { ActionIcon, Tooltip, rem } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { Link } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";

export function SettingsDropdown() {
    const t = useTranslations("settings");

    return (
        <Tooltip label={t("settings")} position="bottom" withArrow>
            <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                aria-label={t("settings")}
                component={Link}
                href="/settings"
            >
                <IconSettings style={{ width: rem(18), height: rem(18) }} stroke={1.5} />
            </ActionIcon>
        </Tooltip>
    );
}
