"use client";

import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/app/i18n/navigation";
import Image from "next/image";
import styles from "./LanguageSwitcher.module.css";
import { useTranslations } from "next-intl";

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("languages");

    const switchLanguage = (newLocale: string) => {
        router.replace(pathname, { locale: newLocale });
    };

    return (
        <Group gap={5}>
            <Tooltip label={t("swedish")} position="bottom" withArrow>
                <ActionIcon
                    variant={locale === "sv" ? "filled" : "subtle"}
                    color={locale === "sv" ? "blue" : "gray"}
                    aria-label={t("switchTo", { language: t("swedish") })}
                    className={styles.flag}
                    onClick={() => switchLanguage("sv")}
                >
                    <Image src="/flags/se.svg" alt={t("swedishFlag")} width={24} height={24} />
                </ActionIcon>
            </Tooltip>

            <Tooltip label={t("english")} position="bottom" withArrow>
                <ActionIcon
                    variant={locale === "en" ? "filled" : "subtle"}
                    color={locale === "en" ? "blue" : "gray"}
                    aria-label={t("switchTo", { language: t("english") })}
                    className={styles.flag}
                    onClick={() => switchLanguage("en")}
                >
                    <Image src="/flags/gb.svg" alt={t("britishFlag")} width={24} height={24} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
}
