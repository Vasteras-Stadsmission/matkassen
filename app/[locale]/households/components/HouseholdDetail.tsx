"use client";

import { Card, Title, Text, Group, Badge, Box, SimpleGrid, Paper, ThemeIcon } from "@mantine/core";
import {
    IconUser,
    IconPhone,
    IconCalendarEvent,
    IconClock,
    IconBuilding,
    IconMars,
    IconVenus,
    IconGenderBigender,
    IconLanguage,
    IconUserCheck,
} from "@tabler/icons-react";
import CommentSection from "@/components/CommentSection";
import { Comment } from "@/app/[locale]/households/enroll/types";
import { useTranslations, useLocale } from "next-intl";
import { getLanguageName as getLanguageNameFromLocale } from "@/app/constants/languages";
import { formatPhoneForDisplay } from "@/app/utils/validation/phone-validation";

interface HouseholdDetailProps {
    householdDetail: {
        household: {
            first_name: string;
            last_name: string;
            phone_number: string;
            locale: string;
            created_by: string | null;
        };
        members: Array<{
            id?: string;
            age: number;
            sex: string;
        }>;
        dietaryRestrictions: Array<{
            id: string;
            name: string;
            color?: string | null;
        }>;
        additionalNeeds: Array<{
            id: string;
            need: string;
            color?: string | null;
        }>;
        pets: Array<{
            id?: string;
            species: string;
            speciesName?: string;
            color?: string | null;
        }>;
        foodParcels: {
            pickupLocationId: string;
            parcels: Array<{
                id?: string;
                pickupDate: Date | string;
                pickupEarliestTime: Date | string;
                pickupLatestTime: Date | string;
                isPickedUp?: boolean;
            }>;
        };
        pickupLocation: {
            id: string;
            name: string;
            address?: string;
        } | null;
        comments?: Comment[];
    };
    onAddComment?: (comment: string) => Promise<Comment | null | undefined>;
    onDeleteComment?: (commentId: string) => Promise<void>;
}

export default function InternationalizedHouseholdDetail({
    householdDetail,
    onAddComment,
    onDeleteComment,
}: HouseholdDetailProps) {
    const t = useTranslations("householdDetail");
    const tWeekdays = useTranslations("weekdays");
    const currentLocale = useLocale();

    // Format date for display
    const formatDate = (date: Date | string | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleDateString("sv-SE");
    };

    // Format time for display
    const formatTime = (date: Date | string | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    // Get weekday name
    const getWeekdayName = (date: Date | string | null | undefined) => {
        if (!date) return "";

        // Get the weekday index (0 = Sunday, 1 = Monday, etc.)
        const dayIndex = new Date(date).getDay();

        // Map from day index to translation key
        const dayKeys = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
        ] as const;

        // Return translated weekday name using a properly typed key
        return tWeekdays(dayKeys[dayIndex]);
    };

    // Check if date is in the past
    const isDateInPast = (date: Date | string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const compareDate = new Date(date);
        compareDate.setHours(0, 0, 0, 0);
        return compareDate < today;
    };

    // Get unique pet species with counts and color
    const uniquePetsWithCount = () => {
        const petMap = new Map<string, { count: number; color?: string | null }>();

        householdDetail.pets.forEach(pet => {
            const species = pet.speciesName || pet.species;
            const existing = petMap.get(species);
            petMap.set(species, {
                count: (existing?.count || 0) + 1,
                color: existing?.color ?? pet.color,
            });
        });

        const uniquePets: { species: string; count: number; color?: string | null }[] = [];
        petMap.forEach(({ count, color }, species) => {
            uniquePets.push({ species, count, color });
        });

        return uniquePets;
    };

    // Get language name using the proper function from constants
    const getLanguageName = (locale: string): string => {
        return getLanguageNameFromLocale(locale, currentLocale);
    };

    return (
        <Card withBorder p="md" radius="md" shadow="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                {/* Left Column - All sections except Matkassar */}
                <Box>
                    {/* Household Info */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {t("basics")}
                        </Title>
                        <Group gap="xs" mb="xs">
                            <ThemeIcon size="md" variant="light" color="blue">
                                <IconUser size={16} />
                            </ThemeIcon>
                            <Text>
                                {householdDetail.household.first_name}{" "}
                                {householdDetail.household.last_name}
                            </Text>
                        </Group>
                        <Group gap="xs" mb="xs">
                            <ThemeIcon size="md" variant="light" color="blue">
                                <IconPhone size={16} />
                            </ThemeIcon>
                            <Text>
                                {formatPhoneForDisplay(householdDetail.household.phone_number)}
                            </Text>
                        </Group>
                        <Group gap="xs" mb="xs">
                            <ThemeIcon size="md" variant="light" color="blue">
                                <IconLanguage size={16} />
                            </ThemeIcon>
                            <Text>{getLanguageName(householdDetail.household.locale)}</Text>
                        </Group>
                        {householdDetail.household.created_by && (
                            <Group gap="xs" mb="xs">
                                <ThemeIcon size="md" variant="light" color="blue">
                                    <IconUserCheck size={16} />
                                </ThemeIcon>
                                <Text>
                                    {t("createdBy", {
                                        username: householdDetail.household.created_by,
                                    })}
                                </Text>
                            </Group>
                        )}
                    </Paper>

                    {/* Household Members */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {t("members", { count: String(householdDetail.members.length) })}
                        </Title>
                        {householdDetail.members.length > 0 ? (
                            <Group gap="xs" wrap="wrap">
                                {householdDetail.members.map((member, index) => {
                                    // Choose appropriate icon and color based on age and gender
                                    let iconColor = "gray";
                                    let genderIcon;

                                    // Gender icons
                                    if (member.sex === "male") {
                                        iconColor = "blue";
                                        genderIcon = <IconMars size={24} strokeWidth={2} />;
                                    } else if (member.sex === "female") {
                                        iconColor = "pink";
                                        genderIcon = <IconVenus size={24} strokeWidth={2} />;
                                    } else {
                                        iconColor = "grape";
                                        genderIcon = (
                                            <IconGenderBigender size={24} strokeWidth={2} />
                                        );
                                    }

                                    return (
                                        <Paper
                                            key={member.id || index}
                                            radius="md"
                                            p="xs"
                                            withBorder
                                            shadow="xs"
                                            style={{ minWidth: "auto" }}
                                        >
                                            <Group gap="xs" wrap="nowrap">
                                                <Badge
                                                    size="md"
                                                    radius="xl"
                                                    variant="light"
                                                    color={iconColor}
                                                    style={{ width: 30, height: 30, padding: 0 }}
                                                >
                                                    {genderIcon}
                                                </Badge>
                                                <Text size="m">
                                                    {member.age} {t("ageUnit")}
                                                </Text>
                                            </Group>
                                        </Paper>
                                    );
                                })}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="m">
                                {t("noMembers")}
                            </Text>
                        )}
                    </Paper>

                    {/* Pets */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {t("pets", { count: String(householdDetail.pets.length) })}
                        </Title>
                        {householdDetail.pets.length > 0 ? (
                            <Group wrap="wrap" gap="xs">
                                {uniquePetsWithCount().map((pet, index) => (
                                    <Paper
                                        key={index}
                                        radius="md"
                                        p="xs"
                                        withBorder
                                        shadow="xs"
                                        style={{ minWidth: "auto" }}
                                    >
                                        <Group gap="xs" wrap="nowrap">
                                            <Badge
                                                size="md"
                                                radius="xl"
                                                variant="light"
                                                color={pet.color ?? "blue"}
                                            >
                                                {pet.count}
                                            </Badge>
                                            <Text size="m">{pet.species}</Text>
                                        </Group>
                                    </Paper>
                                ))}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="sm">
                                {t("noPets")}
                            </Text>
                        )}
                    </Paper>

                    {/* Dietary Restrictions */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {t("dietaryRestrictions", {
                                count: String(householdDetail.dietaryRestrictions.length),
                            })}
                        </Title>
                        {householdDetail.dietaryRestrictions.length > 0 ? (
                            <Group gap="xs">
                                {householdDetail.dietaryRestrictions.map(restriction => (
                                    <Badge
                                        key={restriction.id}
                                        color={restriction.color ?? "blue"}
                                        variant="filled"
                                        size="lg"
                                    >
                                        {restriction.name}
                                    </Badge>
                                ))}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="md">
                                {t("noDietaryRestrictions")}
                            </Text>
                        )}
                    </Paper>

                    {/* Additional Needs */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {t("additionalNeeds", {
                                count: String(householdDetail.additionalNeeds.length),
                            })}
                        </Title>
                        {householdDetail.additionalNeeds.length > 0 ? (
                            <Group gap="xs">
                                {householdDetail.additionalNeeds.map(need => (
                                    <Badge
                                        key={need.id}
                                        color={need.color ?? "cyan"}
                                        variant="filled"
                                        size="lg"
                                    >
                                        {need.need}
                                    </Badge>
                                ))}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="md">
                                {t("noAdditionalNeeds")}
                            </Text>
                        )}
                    </Paper>

                    {/* Comments Section */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {t("comments.title", {
                                count: String(householdDetail.comments?.length || 0),
                            })}
                        </Title>
                        <CommentSection
                            comments={householdDetail.comments || []}
                            onAddComment={onAddComment}
                            onDeleteComment={onDeleteComment}
                            showTitle={false}
                            entityType="household"
                        />
                    </Paper>
                </Box>

                {/* Right Column - Only Matkassar */}
                <Box>
                    {/* Food Parcels */}
                    <Paper withBorder p="md" radius="md" h="100%" mb="md">
                        <Title order={5} mb="sm">
                            {t("foodParcels", {
                                count: String(householdDetail.foodParcels.parcels?.length || 0),
                            })}
                        </Title>

                        {/* Location info */}
                        {householdDetail.pickupLocation ? (
                            <Group mb="md" gap="xs">
                                <ThemeIcon size="md" variant="light" color="grape">
                                    <IconBuilding size={16} />
                                </ThemeIcon>
                                <Text size="md" fw={500}>
                                    {householdDetail.pickupLocation.name}
                                </Text>
                            </Group>
                        ) : null}

                        {/* Parcels list */}
                        {householdDetail.foodParcels.parcels &&
                        householdDetail.foodParcels.parcels.length > 0 ? (
                            <div>
                                {householdDetail.foodParcels.parcels.map((parcel, index) => {
                                    const isPast = isDateInPast(parcel.pickupDate);
                                    const isPickedUp = Boolean(parcel.isPickedUp);

                                    return (
                                        <Paper
                                            key={parcel.id || index}
                                            withBorder
                                            p="xs"
                                            radius="sm"
                                            mb={
                                                index ===
                                                householdDetail.foodParcels.parcels.length - 1
                                                    ? 0
                                                    : "xs"
                                            }
                                            bg={isPast ? "gray.0" : undefined}
                                        >
                                            <Group justify="space-between" wrap="nowrap">
                                                <Group gap="xs">
                                                    <ThemeIcon
                                                        size="md"
                                                        variant="light"
                                                        color={isPast ? "gray" : "indigo"}
                                                    >
                                                        <IconCalendarEvent size={16} />
                                                    </ThemeIcon>
                                                    <div>
                                                        <Text fw={500} size="md">
                                                            {getWeekdayName(parcel.pickupDate)}
                                                        </Text>
                                                        <Text fw={500} size="md">
                                                            {formatDate(parcel.pickupDate)}
                                                        </Text>
                                                    </div>
                                                </Group>
                                                <Group gap="xs">
                                                    <ThemeIcon
                                                        size="md"
                                                        variant="light"
                                                        color={isPast ? "gray" : "indigo"}
                                                    >
                                                        <IconClock size={16} />
                                                    </ThemeIcon>
                                                    <Text fw={500} size="md">
                                                        {formatTime(parcel.pickupEarliestTime)}–
                                                        {formatTime(parcel.pickupLatestTime)}
                                                    </Text>
                                                </Group>
                                            </Group>

                                            {/* Status badges */}
                                            <Group mt="xs" gap="xs">
                                                {isPickedUp ? (
                                                    <Badge color="green" variant="light">
                                                        {t("status.pickedUp")}
                                                    </Badge>
                                                ) : isPast ? (
                                                    <Badge color="red" variant="light">
                                                        {t("status.notPickedUp")}
                                                    </Badge>
                                                ) : (
                                                    <Badge color="blue" variant="light">
                                                        {t("status.upcoming")}
                                                    </Badge>
                                                )}
                                            </Group>
                                        </Paper>
                                    );
                                })}
                            </div>
                        ) : (
                            <Text c="dimmed" size="sm">
                                {t("noFoodParcels")}
                            </Text>
                        )}
                    </Paper>
                </Box>
            </SimpleGrid>
        </Card>
    );
}
