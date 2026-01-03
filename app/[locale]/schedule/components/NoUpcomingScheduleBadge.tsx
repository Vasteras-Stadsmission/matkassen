"use client";

import { Badge, Modal, Button, Stack, Text, List, ThemeIcon } from "@mantine/core";
import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import type { TranslationFunction } from "../../types";

export function NoUpcomingScheduleBadge() {
    const t = useTranslations("schedule") as TranslationFunction;
    const [opened, { open, close }] = useDisclosure(false);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        open();
    };

    return (
        <>
            <Badge
                color="yellow"
                variant="light"
                size="sm"
                leftSection={<IconAlertTriangle size={12} />}
                style={{ cursor: "pointer" }}
                onClick={handleClick}
            >
                {t("hub.noUpcomingSchedule")}
            </Badge>

            <Modal
                opened={opened}
                onClose={close}
                title={
                    <Text fw={600} size="lg">
                        {t("noUpcomingSchedule.title")}
                    </Text>
                }
                centered
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {t("noUpcomingSchedule.description")}
                    </Text>

                    <div>
                        <Text size="sm" fw={500} mb="xs">
                            {t("noUpcomingSchedule.whatThisMeans")}
                        </Text>
                        <List
                            size="sm"
                            spacing="xs"
                            icon={
                                <ThemeIcon color="yellow" size={20} radius="xl" variant="light">
                                    <IconX size={12} />
                                </ThemeIcon>
                            }
                        >
                            <List.Item>{t("noUpcomingSchedule.consequence1")}</List.Item>
                            <List.Item>{t("noUpcomingSchedule.consequence2")}</List.Item>
                        </List>
                    </div>

                    <Text size="sm" c="dimmed">
                        {t("noUpcomingSchedule.callToAction")}
                    </Text>

                    <Button onClick={close} fullWidth>
                        {t("noUpcomingSchedule.understand")}
                    </Button>
                </Stack>
            </Modal>
        </>
    );
}
