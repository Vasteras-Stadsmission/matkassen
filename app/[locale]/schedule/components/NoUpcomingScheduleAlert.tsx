"use client";

import { Alert, Text, List, ThemeIcon, Stack, Modal, Button } from "@mantine/core";
import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import type { TranslationFunction } from "../../types";

export function NoUpcomingScheduleAlert() {
    const t = useTranslations("schedule") as TranslationFunction;
    const [opened, { open, close }] = useDisclosure(false);

    return (
        <>
            <Alert
                icon={<IconAlertTriangle size={16} />}
                color="yellow"
                variant="light"
                style={{ cursor: "pointer" }}
                onClick={open}
            >
                <Text size="sm" fw={500}>
                    {t("hub.noUpcomingSchedule")}
                </Text>
            </Alert>

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
