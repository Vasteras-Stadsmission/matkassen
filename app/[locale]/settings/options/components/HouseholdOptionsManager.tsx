"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Container,
    Title,
    Text,
    Button,
    Stack,
    Card,
    Group,
    ActionIcon,
    Modal,
    TextInput,
    LoadingOverlay,
    Badge,
    Alert,
    Tabs,
    Tooltip,
} from "@mantine/core";
import { IconPlus, IconEdit, IconTrash, IconInfoCircle } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import {
    listDietaryRestrictions,
    createDietaryRestriction,
    updateDietaryRestriction,
    deleteDietaryRestriction,
    listPetSpecies,
    createPetSpecies,
    updatePetSpecies,
    deletePetSpecies,
    listAdditionalNeeds,
    createAdditionalNeed,
    updateAdditionalNeed,
    deleteAdditionalNeed,
    type OptionWithUsage,
} from "../actions";

type OptionType = "dietaryRestrictions" | "petTypes" | "additionalNeeds";

interface OptionFormData {
    name: string;
}

const ERROR_TRANSLATIONS = {
    FETCH_FAILED: "notifications.errors.FETCH_FAILED",
    VALIDATION_ERROR: "notifications.errors.VALIDATION_ERROR",
    DUPLICATE_NAME: "notifications.errors.DUPLICATE_NAME",
    CREATE_FAILED: "notifications.errors.CREATE_FAILED",
    UPDATE_FAILED: "notifications.errors.UPDATE_FAILED",
    NOT_FOUND: "notifications.errors.NOT_FOUND",
    DELETE_FAILED: "notifications.errors.DELETE_FAILED",
    OPTION_IN_USE: "notifications.errors.OPTION_IN_USE",
} as const;

type KnownErrorCode = keyof typeof ERROR_TRANSLATIONS;

const isKnownErrorCode = (code: string): code is KnownErrorCode => code in ERROR_TRANSLATIONS;

export function HouseholdOptionsManager() {
    const t = useTranslations("settings.householdOptions");

    const getErrorMessage = useCallback(
        (error: { code: string; message: string }): string => {
            if (isKnownErrorCode(error.code)) {
                return t(ERROR_TRANSLATIONS[error.code]);
            }
            return t("notifications.errors.UNKNOWN");
        },
        [t],
    );

    const [activeTab, setActiveTab] = useState<OptionType>("dietaryRestrictions");
    const [dietaryOptions, setDietaryOptions] = useState<OptionWithUsage[]>([]);
    const [petOptions, setPetOptions] = useState<OptionWithUsage[]>([]);
    const [needsOptions, setNeedsOptions] = useState<OptionWithUsage[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
        useDisclosure(false);
    const [editingOption, setEditingOption] = useState<OptionWithUsage | null>(null);
    const [deletingOption, setDeletingOption] = useState<OptionWithUsage | null>(null);
    const [formData, setFormData] = useState<OptionFormData>({ name: "" });

    const loadAllOptions = useCallback(async () => {
        setLoading(true);
        try {
            const [dietaryResult, petResult, needsResult] = await Promise.all([
                listDietaryRestrictions(),
                listPetSpecies(),
                listAdditionalNeeds(),
            ]);

            if (dietaryResult.success) setDietaryOptions(dietaryResult.data);
            if (petResult.success) setPetOptions(petResult.data);
            if (needsResult.success) setNeedsOptions(needsResult.data);

            if (!dietaryResult.success || !petResult.success || !needsResult.success) {
                notifications.show({
                    title: t("notifications.error"),
                    message: t("notifications.loadError"),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.loadError"),
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadAllOptions();
    }, [loadAllOptions]);

    const getCurrentOptions = (): OptionWithUsage[] => {
        switch (activeTab) {
            case "dietaryRestrictions":
                return dietaryOptions;
            case "petTypes":
                return petOptions;
            case "additionalNeeds":
                return needsOptions;
            default:
                return [];
        }
    };

    const handleAddOption = () => {
        setEditingOption(null);
        setFormData({ name: "" });
        openModal();
    };

    const handleEditOption = (option: OptionWithUsage) => {
        setEditingOption(option);
        setFormData({ name: option.name });
        openModal();
    };

    const handleDeleteOption = async (option: OptionWithUsage) => {
        // Refresh the option's usage count to handle concurrent changes
        // (another admin may have added this option to a household since page load)
        let freshOption: OptionWithUsage | undefined = option;

        try {
            let result;
            switch (activeTab) {
                case "dietaryRestrictions":
                    result = await listDietaryRestrictions();
                    break;
                case "petTypes":
                    result = await listPetSpecies();
                    break;
                case "additionalNeeds":
                    result = await listAdditionalNeeds();
                    break;
            }

            if (result?.success && result.data) {
                freshOption = result.data.find(o => o.id === option.id);
                // Update the local state with fresh data
                switch (activeTab) {
                    case "dietaryRestrictions":
                        setDietaryOptions(result.data);
                        break;
                    case "petTypes":
                        setPetOptions(result.data);
                        break;
                    case "additionalNeeds":
                        setNeedsOptions(result.data);
                        break;
                }
            }
        } catch {
            // If refresh fails, proceed with existing data
        }

        setDeletingOption(freshOption ?? option);
        openDeleteModal();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            let result;
            const data = { name: formData.name };

            if (editingOption) {
                // Update
                switch (activeTab) {
                    case "dietaryRestrictions":
                        result = await updateDietaryRestriction(editingOption.id, data);
                        break;
                    case "petTypes":
                        result = await updatePetSpecies(editingOption.id, data);
                        break;
                    case "additionalNeeds":
                        result = await updateAdditionalNeed(editingOption.id, data);
                        break;
                }
            } else {
                // Create
                switch (activeTab) {
                    case "dietaryRestrictions":
                        result = await createDietaryRestriction(data);
                        break;
                    case "petTypes":
                        result = await createPetSpecies(data);
                        break;
                    case "additionalNeeds":
                        result = await createAdditionalNeed(data);
                        break;
                }
            }

            if (result.success) {
                notifications.show({
                    title: t("notifications.success"),
                    message: editingOption ? t("notifications.updated") : t("notifications.created"),
                    color: "green",
                });
                closeModal();
                loadAllOptions();
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: getErrorMessage(result.error),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.saveError"),
                color: "red",
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingOption) return;

        setDeleting(true);
        try {
            let result;
            switch (activeTab) {
                case "dietaryRestrictions":
                    result = await deleteDietaryRestriction(deletingOption.id);
                    break;
                case "petTypes":
                    result = await deletePetSpecies(deletingOption.id);
                    break;
                case "additionalNeeds":
                    result = await deleteAdditionalNeed(deletingOption.id);
                    break;
            }

            if (result.success) {
                notifications.show({
                    title: t("notifications.success"),
                    message: t("notifications.deleted"),
                    color: "green",
                });
                closeDeleteModal();
                setDeletingOption(null);
                loadAllOptions();
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: getErrorMessage(result.error),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.deleteError"),
                color: "red",
            });
        } finally {
            setDeleting(false);
        }
    };

    const currentOptions = getCurrentOptions();

    return (
        <Container size="md" py="md">
            <Stack gap="lg">
                <Group justify="space-between">
                    <div>
                        <Title order={2}>{t("title")}</Title>
                        <Text c="dimmed" mt="xs">
                            {t("description")}
                        </Text>
                    </div>
                    <Button leftSection={<IconPlus size={16} />} onClick={handleAddOption}>
                        {t("addButton")}
                    </Button>
                </Group>

                <Tabs
                    value={activeTab}
                    onChange={value => setActiveTab(value as OptionType)}
                >
                    <Tabs.List>
                        <Tabs.Tab value="dietaryRestrictions">
                            {t("tabs.dietaryRestrictions")}
                        </Tabs.Tab>
                        <Tabs.Tab value="petTypes">{t("tabs.petTypes")}</Tabs.Tab>
                        <Tabs.Tab value="additionalNeeds">{t("tabs.additionalNeeds")}</Tabs.Tab>
                    </Tabs.List>
                </Tabs>

                <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                    {t("infoAlert")}
                </Alert>

                <div style={{ position: "relative" }}>
                    <LoadingOverlay visible={loading} />

                    {currentOptions.length === 0 && !loading ? (
                        <Alert icon={<IconInfoCircle size={16} />} color="gray">
                            {t(`emptyState.${activeTab}`)}
                        </Alert>
                    ) : (
                        <Stack gap="md">
                            {currentOptions.map(option => (
                                <Card key={option.id} shadow="sm" padding="md" withBorder>
                                    <Group justify="space-between" wrap="nowrap">
                                        <Group gap="md" style={{ flex: 1 }}>
                                            <Text fw={500}>{option.name}</Text>
                                            <Badge
                                                size="sm"
                                                color={option.usageCount > 0 ? "blue" : "gray"}
                                                variant="light"
                                            >
                                                {t("usageCount", { count: option.usageCount })}
                                            </Badge>
                                        </Group>

                                        <Group gap="xs">
                                            <ActionIcon
                                                variant="subtle"
                                                color="blue"
                                                onClick={() => handleEditOption(option)}
                                            >
                                                <IconEdit size={16} />
                                            </ActionIcon>
                                            {option.usageCount > 0 ? (
                                                <Tooltip label={t("delete.cannotDeleteTooltip")}>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="gray"
                                                        disabled
                                                    >
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            ) : (
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="red"
                                                    onClick={() => handleDeleteOption(option)}
                                                >
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            )}
                                        </Group>
                                    </Group>
                                </Card>
                            ))}
                        </Stack>
                    )}
                </div>
            </Stack>

            {/* Add/Edit Modal */}
            <Modal
                opened={modalOpened}
                onClose={closeModal}
                title={
                    editingOption
                        ? t(`form.editTitle.${activeTab}`)
                        : t(`form.addTitle.${activeTab}`)
                }
                size="md"
            >
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label={t("form.nameLabel")}
                            placeholder={t(`form.namePlaceholder.${activeTab}`)}
                            required
                            maxLength={100}
                            value={formData.name}
                            onChange={e => setFormData({ name: e.target.value })}
                        />

                        {editingOption && editingOption.usageCount > 0 && (
                            <Alert color="yellow" variant="light">
                                {t("form.editWarning", { count: String(editingOption.usageCount) })}
                            </Alert>
                        )}

                        <Group justify="flex-end" gap="sm">
                            <Button variant="subtle" onClick={closeModal}>
                                {t("buttons.cancel")}
                            </Button>
                            <Button type="submit" loading={submitting}>
                                {t("buttons.save")}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title={t(`delete.title.${activeTab}`)}
                size="md"
            >
                <Stack gap="md">
                    <Text>{t("delete.confirmMessage", { name: deletingOption?.name ?? "" })}</Text>
                    {deletingOption && (
                        <Card withBorder padding="sm" bg="gray.0">
                            <Text fw={500} size="sm">
                                {deletingOption.name}
                            </Text>
                        </Card>
                    )}
                    {deletingOption && deletingOption.usageCount > 0 && (
                        <Alert color="red" variant="light">
                            {t("delete.cannotDelete", { count: String(deletingOption.usageCount) })}
                        </Alert>
                    )}
                    <Group justify="flex-end" gap="sm">
                        <Button variant="subtle" onClick={closeDeleteModal} disabled={deleting}>
                            {t("buttons.cancel")}
                        </Button>
                        <Button
                            color="red"
                            onClick={handleConfirmDelete}
                            loading={deleting}
                            disabled={deletingOption ? deletingOption.usageCount > 0 : true}
                        >
                            {t("buttons.delete")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}
