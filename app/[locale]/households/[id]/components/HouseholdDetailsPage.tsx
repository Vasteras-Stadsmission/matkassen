"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/app/i18n/navigation";
import {
    Container,
    Title,
    Text,
    Group,
    Button,
    Stack,
    Box,
    SimpleGrid,
    Paper,
    ThemeIcon,
    Badge,
    LoadingOverlay,
    Collapse,
    ActionIcon,
    Alert,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
    IconArrowLeft,
    IconEdit,
    IconPackage,
    IconBuilding,
    IconChevronDown,
    IconChevronUp,
    IconTrash,
    IconAlertCircle,
} from "@tabler/icons-react";
import { useTranslations, useLocale } from "next-intl";
import { ParcelAdminDialog } from "@/components/ParcelAdminDialog";
import CommentSection from "@/components/CommentSection";
import { getHouseholdDetails, addHouseholdComment, deleteHouseholdComment } from "../../actions";
import { getLanguageName as getLanguageNameFromLocale } from "@/app/constants/languages";
import { HouseholdInfoCard } from "./HouseholdInfoCard";
import { HouseholdMembersCard } from "./HouseholdMembersCard";
import { ParcelList } from "./ParcelList";
import { RemoveHouseholdDialog } from "./RemoveHouseholdDialog";
import type { ParcelCardData } from "./ParcelCard";

interface HouseholdDetailsPageProps {
    householdId: string;
    initialData: Awaited<ReturnType<typeof getHouseholdDetails>>;
    testMode: boolean;
    warningData?: {
        shouldWarn: boolean;
        parcelCount: number;
        threshold: number | null;
    };
}

export default function HouseholdDetailsPage({
    householdId,
    initialData,
    testMode: isTestMode,
    warningData,
}: HouseholdDetailsPageProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const t = useTranslations("householdDetail");
    const tNav = useTranslations("navigation");
    const tWeekdays = useTranslations("weekdays");
    const tSms = useTranslations("sms");
    const currentLocale = useLocale();

    const [householdData, setHouseholdData] = useState(initialData);
    const [loading, setLoading] = useState(false);
    const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
    const [parcelDialogOpened, parcelDialogHandlers] = useDisclosure(false);
    const [cancelledOpened, cancelledHandlers] = useDisclosure(false);
    const [removeDialogOpened, removeDialogHandlers] = useDisclosure(false);

    const householdName = householdData
        ? `${householdData.household.first_name} ${householdData.household.last_name}`
        : "";

    // Watch URL for parcel parameter
    useEffect(() => {
        const parcelId = searchParams.get("parcel");
        if (parcelId) {
            setSelectedParcelId(parcelId);
            parcelDialogHandlers.open();
        } else {
            parcelDialogHandlers.close();
            setSelectedParcelId(null);
        }
    }, [searchParams, parcelDialogHandlers]);

    // Auto-expand cancelled section if there are cancelled parcels
    useEffect(() => {
        if (householdData?.deletedParcels && householdData.deletedParcels.length > 0) {
            cancelledHandlers.open();
        }
    }, [householdData?.deletedParcels, cancelledHandlers]);

    // Refresh household data
    const refreshHouseholdData = useCallback(async () => {
        setLoading(true);
        try {
            const updatedData = await getHouseholdDetails(householdId);
            if (updatedData) {
                setHouseholdData(updatedData);
            }
        } catch {
            // Error refreshing household data
        } finally {
            setLoading(false);
        }
    }, [householdId]);

    // Handle parcel click
    const handleParcelClick = useCallback(
        (parcelId: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("parcel", parcelId);
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [searchParams, pathname, router],
    );

    // Handle parcel dialog close
    const handleParcelDialogClose = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("parcel");
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.replace(newUrl, { scroll: false });
    }, [searchParams, pathname, router]);

    // Handle parcel update (pickup, delete, etc)
    const handleParcelUpdated = useCallback(async () => {
        // Always refresh - parcel cards display pickup status badges that need to update
        await refreshHouseholdData();
    }, [refreshHouseholdData]);

    // Handle adding a comment
    const handleAddComment = async (comment: string) => {
        if (!comment.trim()) return null;

        try {
            setLoading(true);
            const result = await addHouseholdComment(householdId, comment);
            await refreshHouseholdData();
            return result.success ? result.data : null;
        } catch {
            // Error adding comment
            return null;
        } finally {
            setLoading(false);
        }
    };

    // Handle deleting a comment
    const handleDeleteComment = async (commentId: string): Promise<void> => {
        try {
            setLoading(true);
            await deleteHouseholdComment(commentId);
            await refreshHouseholdData();
        } catch {
            // Error deleting comment
        } finally {
            setLoading(false);
        }
    };

    // Utility functions
    const formatDate = (date: Date | string | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleDateString("sv-SE");
    };

    const formatTime = (date: Date | string | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    const getWeekdayName = (date: Date | string | null | undefined) => {
        if (!date) return "";
        const dayIndex = new Date(date).getDay();
        const dayKeys = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
        ] as const;
        return tWeekdays(dayKeys[dayIndex]);
    };

    // Helper: Check if date is in the past
    // NOTE: This checks DATE only, not time. Same-day parcels always count as "upcoming"
    // even if the pickup window has passed, because households may arrive at different
    // times and we don't want to prematurely show "not picked up" while staff are still
    // processing arrivals throughout the day.
    const isDateInPast = (date: Date | string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const compareDate = new Date(date);
        compareDate.setHours(0, 0, 0, 0);
        return compareDate < today;
    };

    const getLanguageName = (locale: string): string => {
        return getLanguageNameFromLocale(locale, currentLocale);
    };

    const countPetsBySpecies = () => {
        if (!householdData?.pets) return new Map<string, { count: number; color?: string | null }>();
        const petMap = new Map<string, { count: number; color?: string | null }>();
        householdData.pets.forEach(pet => {
            const species = pet.speciesName || pet.species;
            const existing = petMap.get(species);
            petMap.set(species, {
                count: (existing?.count || 0) + 1,
                color: existing?.color ?? pet.color,
            });
        });
        return petMap;
    };

    if (!householdData) {
        return null;
    }

    const activeParcels = householdData.foodParcels.parcels || [];
    const deletedParcels = householdData.deletedParcels || [];

    return (
        <Container size="xl" py="xl">
            <LoadingOverlay visible={loading} />

            {/* Header */}
            <Stack gap="lg" mb="xl">
                <Group justify="space-between" align="flex-start">
                    <Box>
                        <Button
                            variant="subtle"
                            leftSection={<IconArrowLeft size="1rem" />}
                            onClick={() => router.push("/households")}
                            mb="sm"
                        >
                            {tNav("households")}
                        </Button>
                        <Title order={1} size="h2">
                            {householdName}
                        </Title>
                    </Box>
                    <Group>
                        <Button
                            variant="light"
                            leftSection={<IconEdit size="1rem" />}
                            onClick={() => router.push(`/households/${householdId}/edit`)}
                        >
                            {t("editHousehold")}
                        </Button>
                        <Button
                            variant="light"
                            leftSection={<IconPackage size="1rem" />}
                            onClick={() => router.push(`/households/${householdId}/parcels`)}
                        >
                            {t("manageParcels")}
                        </Button>
                        <Button
                            variant="light"
                            color="red"
                            leftSection={<IconTrash size="1rem" />}
                            onClick={removeDialogHandlers.open}
                        >
                            {t("removeHousehold")}
                        </Button>
                    </Group>
                </Group>
            </Stack>

            {/* Test Mode Warning Banner */}
            {isTestMode && (
                <Alert variant="light" color="yellow" mb="md">
                    {tSms("testModeWarning")}
                </Alert>
            )}

            {/* Parcel Count Warning Banner */}
            {warningData?.shouldWarn && warningData.threshold !== null && (
                <Alert variant="light" color="orange" icon={<IconAlertCircle />} mb="md">
                    {t("warnings.parcelCountHigh", {
                        count: String(warningData.parcelCount),
                        threshold: String(warningData.threshold),
                    })}
                </Alert>
            )}

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                {/* Left Column - Household Info */}
                <Stack gap="md">
                    {/* Basic Info */}
                    <HouseholdInfoCard
                        firstName={householdData.household.first_name}
                        lastName={householdData.household.last_name}
                        phoneNumber={householdData.household.phone_number}
                        locale={householdData.household.locale}
                        createdBy={householdData.household.created_by}
                        createdAt={householdData.household.created_at}
                        creatorGithubData={householdData.creatorGithubData}
                        enrollmentSmsDelivered={householdData.enrollmentSmsDelivered}
                        primaryPickupLocationName={householdData.primaryPickupLocation?.name}
                        getLanguageName={getLanguageName}
                    />

                    {/* Household Members */}
                    <HouseholdMembersCard members={householdData.members} />

                    {/* Pets */}
                    {householdData.pets.length > 0 && (
                        <Paper withBorder p="lg" radius="md">
                            <Title order={3} size="h4" mb="md">
                                {t("pets", { count: String(householdData.pets.length) })}
                            </Title>
                            <Group gap="sm">
                                {Array.from(countPetsBySpecies()).map(
                                    ([species, { count, color }]) => (
                                        <Paper key={species} radius="md" p="sm" withBorder>
                                            <Group gap="xs">
                                                <Badge
                                                    size="lg"
                                                    variant="light"
                                                    color={color ?? "blue"}
                                                >
                                                    {count}
                                                </Badge>
                                                <Text size="sm">{species}</Text>
                                            </Group>
                                        </Paper>
                                    ),
                                )}
                            </Group>
                        </Paper>
                    )}

                    {/* Dietary Restrictions */}
                    {householdData.dietaryRestrictions.length > 0 && (
                        <Paper withBorder p="lg" radius="md">
                            <Title order={3} size="h4" mb="md">
                                {t("dietaryRestrictions", {
                                    count: String(householdData.dietaryRestrictions.length),
                                })}
                            </Title>
                            <Group gap="xs">
                                {householdData.dietaryRestrictions.map(restriction => (
                                    <Badge
                                        key={restriction.id}
                                        color={restriction.color ?? "blue"}
                                        size="lg"
                                    >
                                        {restriction.name}
                                    </Badge>
                                ))}
                            </Group>
                        </Paper>
                    )}

                    {/* Additional Needs */}
                    {householdData.additionalNeeds.length > 0 && (
                        <Paper withBorder p="lg" radius="md">
                            <Title order={3} size="h4" mb="md">
                                {t("additionalNeeds", {
                                    count: String(householdData.additionalNeeds.length),
                                })}
                            </Title>
                            <Group gap="xs">
                                {householdData.additionalNeeds.map(need => (
                                    <Badge
                                        key={need.id}
                                        color={need.color ?? "cyan"}
                                        size="lg"
                                    >
                                        {need.need}
                                    </Badge>
                                ))}
                            </Group>
                        </Paper>
                    )}

                    {/* Comments Section */}
                    <Paper withBorder p="lg" radius="md">
                        <Title order={3} size="h4" mb="md">
                            {t("comments.title", {
                                count: String(householdData.comments?.length || 0),
                            })}
                        </Title>
                        <CommentSection
                            comments={householdData.comments || []}
                            onAddComment={handleAddComment}
                            onDeleteComment={handleDeleteComment}
                            showTitle={false}
                            entityType="household"
                        />
                    </Paper>
                </Stack>

                {/* Right Column - Parcels */}
                <Stack gap="md">
                    {/* Active Parcels */}
                    <Paper withBorder p="lg" radius="md">
                        <Group justify="space-between" mb="md">
                            <Title order={3} size="h4">
                                {t("foodParcels", { count: String(activeParcels.length) })}
                            </Title>
                            {householdData.pickupLocation && (
                                <Group gap="xs">
                                    <ThemeIcon size="md" variant="light" color="grape">
                                        <IconBuilding size={16} />
                                    </ThemeIcon>
                                    <Text size="sm" fw={500}>
                                        {householdData.pickupLocation.name}
                                    </Text>
                                </Group>
                            )}
                        </Group>

                        <ParcelList
                            parcels={activeParcels as ParcelCardData[]}
                            onParcelClick={handleParcelClick}
                            emptyMessage={t("noFoodParcels")}
                            getWeekdayName={getWeekdayName}
                            formatDate={formatDate}
                            formatTime={formatTime}
                            isDateInPast={isDateInPast}
                            statusLabels={{
                                pickedUp: t("status.pickedUp"),
                                notPickedUp: t("status.notPickedUp"),
                                noShow: t("status.noShow"),
                                upcoming: t("status.upcoming"),
                                cancelled: t("status.cancelled"),
                            }}
                        />
                    </Paper>

                    {/* Cancelled Parcels */}
                    {deletedParcels.length > 0 && (
                        <Paper withBorder p="lg" radius="md">
                            <Group
                                justify="space-between"
                                mb={cancelledOpened ? "md" : 0}
                                style={{ cursor: "pointer" }}
                                onClick={cancelledHandlers.toggle}
                            >
                                <Group gap="xs">
                                    <Title order={3} size="h4">
                                        {t("cancelledParcels")}
                                    </Title>
                                    <Badge size="md" variant="light" color="gray">
                                        {deletedParcels.length}
                                    </Badge>
                                </Group>
                                <ActionIcon variant="subtle" size="lg">
                                    {cancelledOpened ? (
                                        <IconChevronUp size={20} />
                                    ) : (
                                        <IconChevronDown size={20} />
                                    )}
                                </ActionIcon>
                            </Group>

                            <Collapse in={cancelledOpened}>
                                <ParcelList
                                    parcels={deletedParcels as ParcelCardData[]}
                                    onParcelClick={handleParcelClick}
                                    emptyMessage={t("noCancelledParcels")}
                                    getWeekdayName={getWeekdayName}
                                    formatDate={formatDate}
                                    formatTime={formatTime}
                                    isDateInPast={isDateInPast}
                                    statusLabels={{
                                        pickedUp: t("status.pickedUp"),
                                        notPickedUp: t("status.notPickedUp"),
                                        noShow: t("status.noShow"),
                                        upcoming: t("status.upcoming"),
                                        cancelled: t("status.cancelled"),
                                    }}
                                    deletedLabel={t("deletedOn")}
                                    byLabel={t("by")}
                                />
                            </Collapse>
                        </Paper>
                    )}
                </Stack>
            </SimpleGrid>

            {/* Parcel Admin Dialog */}
            {selectedParcelId && (
                <ParcelAdminDialog
                    parcelId={selectedParcelId}
                    opened={parcelDialogOpened}
                    onClose={handleParcelDialogClose}
                    onParcelUpdated={handleParcelUpdated}
                />
            )}

            {/* Remove Household Dialog */}
            <RemoveHouseholdDialog
                opened={removeDialogOpened}
                onClose={removeDialogHandlers.close}
                householdId={householdId}
                householdLastName={householdData?.household.last_name || ""}
            />
        </Container>
    );
}
