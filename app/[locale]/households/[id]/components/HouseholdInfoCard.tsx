"use client";

import { useEffect, useState, useTransition } from "react";
import {
    Paper,
    Title,
    Stack,
    Group,
    ThemeIcon,
    Text,
    Tooltip,
    ActionIcon,
    Select,
    Popover,
    Divider,
} from "@mantine/core";
import {
    IconUser,
    IconPhone,
    IconLanguage,
    IconUserCheck,
    IconCircleCheck,
    IconMapPin,
    IconPencil,
    IconCheck,
    IconX,
    IconInfoCircle,
} from "@tabler/icons-react";
import { useTranslations, useLocale } from "next-intl";
import { notifications } from "@mantine/notifications";
import type { GithubUserData } from "@/app/[locale]/households/enroll/types";
import { formatPhoneForDisplay } from "@/app/utils/validation/phone-validation";
import { getResponsibleStaffOptionsAction } from "../../enroll/client-actions";
import { updateResponsibleStaff } from "../edit/actions";

interface HouseholdInfoCardProps {
    householdId: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    locale: string;
    createdBy: string | null;
    createdAt: Date | string | null;
    creatorGithubData?: GithubUserData | null;
    responsibleStaffUserId?: string | null;
    responsibleStaffName?: string | null;
    responsibleStaffIsFormer?: boolean;
    enrollmentSmsDelivered?: boolean;
    primaryPickupLocationName?: string | null;
    getLanguageName: (locale: string) => string;
    onResponsibleStaffUpdated?: () => Promise<void> | void;
}

export function HouseholdInfoCard({
    householdId,
    firstName,
    lastName,
    phoneNumber,
    locale,
    createdBy,
    createdAt,
    creatorGithubData,
    responsibleStaffUserId,
    responsibleStaffName,
    responsibleStaffIsFormer,
    enrollmentSmsDelivered,
    primaryPickupLocationName,
    getLanguageName,
    onResponsibleStaffUpdated,
}: HouseholdInfoCardProps) {
    const t = useTranslations("householdDetail");
    const tForm = useTranslations("householdForm");
    const currentLocale = useLocale();
    const [isEditingResponsibleStaff, setIsEditingResponsibleStaff] = useState(false);
    const [selectedResponsibleUserId, setSelectedResponsibleUserId] = useState(
        responsibleStaffUserId || "",
    );
    const [responsibleStaffOptions, setResponsibleStaffOptions] = useState<
        Array<{ value: string; label: string }>
    >([]);
    const [isPending, startTransition] = useTransition();

    const formatDate = (date: Date | string | null) => {
        if (!date) return "";
        return new Date(date).toLocaleDateString(currentLocale, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    useEffect(() => {
        setSelectedResponsibleUserId(responsibleStaffUserId || "");
    }, [responsibleStaffUserId]);

    useEffect(() => {
        getResponsibleStaffOptionsAction(responsibleStaffUserId || null)
            .then(options => {
                setResponsibleStaffOptions(
                    options.map(option => ({
                        value: option.id,
                        label: option.isFormer
                            ? tForm("responsibleStaffFormerOption", { name: option.displayName })
                            : option.displayName,
                    })),
                );
            })
            .catch(() => {
                setResponsibleStaffOptions([]);
            });
    }, [responsibleStaffUserId, tForm]);

    const creatorName = creatorGithubData?.name || createdBy;
    const shouldShowInfoIcon = Boolean(createdBy || createdAt);

    const handleSaveResponsibleStaff = () => {
        if (!selectedResponsibleUserId || selectedResponsibleUserId === responsibleStaffUserId) {
            setIsEditingResponsibleStaff(false);
            return;
        }

        startTransition(async () => {
            const result = await updateResponsibleStaff(householdId, {
                responsibleUserId: selectedResponsibleUserId,
            });

            if (result.success) {
                setIsEditingResponsibleStaff(false);
                notifications.show({
                    title: t("responsibleStaffUpdateSuccess"),
                    message: "",
                    color: "green",
                });
                await onResponsibleStaffUpdated?.();
            } else {
                notifications.show({
                    title: t("responsibleStaffUpdateError"),
                    message:
                        result.error.message === "validation.responsibleStaffRequired"
                            ? tForm("validation.responsibleStaffRequired")
                            : t("responsibleStaffUpdateErrorDescription"),
                    color: "red",
                });
            }
        });
    };

    return (
        <Paper withBorder p="lg" radius="md">
            <Title order={3} size="h4" mb="md">
                {t("basics")}
            </Title>
            <Stack gap="sm">
                <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color="blue">
                        <IconUser size={20} />
                    </ThemeIcon>
                    <Text size="md">
                        {firstName} {lastName}
                    </Text>
                </Group>
                <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color="blue">
                        <IconPhone size={20} />
                    </ThemeIcon>
                    <Text size="md">{formatPhoneForDisplay(phoneNumber)}</Text>
                    {enrollmentSmsDelivered && (
                        <Tooltip label={t("enrollmentSmsDelivered")} withArrow>
                            <ThemeIcon
                                size="sm"
                                variant="transparent"
                                color="green"
                                aria-label={t("enrollmentSmsDelivered")}
                            >
                                <IconCircleCheck size={16} />
                            </ThemeIcon>
                        </Tooltip>
                    )}
                </Group>
                <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color="blue">
                        <IconLanguage size={20} />
                    </ThemeIcon>
                    <Text size="md">{getLanguageName(locale)}</Text>
                </Group>
                {responsibleStaffName && (
                    <Group gap="sm">
                        <ThemeIcon size="lg" variant="light" color="teal">
                            <IconUserCheck size={20} />
                        </ThemeIcon>
                        <Stack gap={2} style={{ flex: 1 }}>
                            {!isEditingResponsibleStaff ? (
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text size="md">
                                        {t("responsibleStaff", {
                                            username: responsibleStaffName,
                                        })}
                                        {responsibleStaffIsFormer && (
                                            <Text span c="dimmed" size="sm">
                                                {" · "}
                                                {t("formerStaff")}
                                            </Text>
                                        )}
                                    </Text>
                                    <Group gap={4} wrap="nowrap">
                                        {shouldShowInfoIcon && (
                                            <Popover width={260} position="bottom-end" withArrow>
                                                <Popover.Target>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="gray"
                                                        aria-label={t("showSecondaryInfo")}
                                                    >
                                                        <IconInfoCircle size={16} />
                                                    </ActionIcon>
                                                </Popover.Target>
                                                <Popover.Dropdown>
                                                    <Stack gap="xs">
                                                        <Text size="sm" fw={500}>
                                                            {t("secondaryInfo")}
                                                        </Text>
                                                        {creatorName && (
                                                            <div>
                                                                <Text size="xs" c="dimmed">
                                                                    {t("createdByLabel")}
                                                                </Text>
                                                                <Text size="sm">{creatorName}</Text>
                                                            </div>
                                                        )}
                                                        {createdAt && (
                                                            <>
                                                                {creatorName && <Divider />}
                                                                <div>
                                                                    <Text size="xs" c="dimmed">
                                                                        {t("created")}
                                                                    </Text>
                                                                    <Text size="sm">
                                                                        {formatDate(createdAt)}
                                                                    </Text>
                                                                </div>
                                                            </>
                                                        )}
                                                    </Stack>
                                                </Popover.Dropdown>
                                            </Popover>
                                        )}
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            onClick={() => setIsEditingResponsibleStaff(true)}
                                            aria-label={t("editResponsibleStaff")}
                                        >
                                            <IconPencil size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Group>
                            ) : (
                                <Group gap="xs" wrap="nowrap" align="flex-start">
                                    <Select
                                        data={responsibleStaffOptions}
                                        value={selectedResponsibleUserId}
                                        onChange={value =>
                                            setSelectedResponsibleUserId(value || "")
                                        }
                                        placeholder={tForm("selectResponsibleStaff")}
                                        nothingFoundMessage={tForm("noResponsibleStaffFound")}
                                        searchable
                                        flex={1}
                                        size="sm"
                                        disabled={isPending}
                                        aria-label={t("editResponsibleStaff")}
                                    />
                                    <ActionIcon
                                        color="green"
                                        variant="light"
                                        onClick={handleSaveResponsibleStaff}
                                        loading={isPending}
                                        disabled={!selectedResponsibleUserId}
                                        aria-label={t("saveResponsibleStaff")}
                                    >
                                        <IconCheck size={16} />
                                    </ActionIcon>
                                    <ActionIcon
                                        color="gray"
                                        variant="subtle"
                                        onClick={() => {
                                            setSelectedResponsibleUserId(
                                                responsibleStaffUserId || "",
                                            );
                                            setIsEditingResponsibleStaff(false);
                                        }}
                                        disabled={isPending}
                                        aria-label={t("cancelResponsibleStaff")}
                                    >
                                        <IconX size={16} />
                                    </ActionIcon>
                                </Group>
                            )}
                        </Stack>
                    </Group>
                )}
                {primaryPickupLocationName && (
                    <Group gap="sm">
                        <ThemeIcon size="lg" variant="light" color="grape">
                            <IconMapPin size={20} />
                        </ThemeIcon>
                        <Text size="md">{primaryPickupLocationName}</Text>
                    </Group>
                )}
            </Stack>
        </Paper>
    );
}
