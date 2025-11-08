"use client";

import {
    Title,
    Text,
    Card,
    Group,
    Paper,
    Box,
    SimpleGrid,
    ThemeIcon,
    Badge,
    Code,
    Loader,
} from "@mantine/core";
import { useState, useEffect } from "react";
import {
    IconUser,
    IconPhone,
    IconMailbox,
    IconMars,
    IconVenus,
    IconGenderBigender,
    IconBuilding,
    IconCalendarEvent,
    IconClock,
} from "@tabler/icons-react";
import { FormData, Comment } from "../types";
import { getPickupLocationsAction } from "../client-actions";
import CommentSection from "@/components/CommentSection";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import LocalizedDate from "@/components/LocalizedDate";

// Interface for pickup location data from DB
interface PickupLocation {
    id: string;
    name: string;
    street_address?: string;
}

interface ReviewFormProps {
    formData: FormData;
    isEditing?: boolean;
    onAddComment?: (comment: string) => Promise<Comment | null | undefined>;
    onDeleteComment?: (commentId: string) => Promise<void>;
}

export default function ReviewForm({
    formData,
    isEditing = false,
    onAddComment,
    onDeleteComment,
}: ReviewFormProps) {
    const t = useTranslations();
    const tReview = useTranslations("review");
    const tHouseholdDetail = useTranslations("householdDetail");
    const tWeekdays = useTranslations("weekdays");
    const locale = useLocale();

    const [pickupLocationName, setPickupLocationName] = useState<string>("");
    const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(false);

    // Format time for display
    const formatTime = (date: Date | string | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    // Format postal code as XXX XX
    const formatPostalCode = (postalCode?: string | null) => {
        if (!postalCode) return "";
        // Remove any non-digits
        const digits = postalCode.replace(/\D/g, "");
        if (digits.length === 5) {
            return `${digits.substring(0, 3)} ${digits.substring(3)}`;
        }
        return postalCode; // Return original if not 5 digits
    };

    // Get weekday name
    const getWeekdayName = (date: Date | string | null | undefined) => {
        if (!date) return "";
        const weekday = new Date(date).getDay();
        // Use the weekday index to get the correct translation
        const weekdayKeys = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
        ] as const;
        return tWeekdays(weekdayKeys[weekday]);
    };

    // Fetch pickup location name when the component mounts
    useEffect(() => {
        const fetchLocationName = async () => {
            if (formData.foodParcels?.pickupLocationId) {
                try {
                    setIsLoadingLocation(true);
                    const locations = await getPickupLocationsAction();

                    // Find matching location by ID
                    const location = locations.find(
                        (loc: PickupLocation) => loc.id === formData.foodParcels.pickupLocationId,
                    );

                    if (location) {
                        setPickupLocationName(location.name);
                    } else {
                        // Fallback if location not found
                        setPickupLocationName(
                            t("foodParcels.pickupLocation") +
                                ` (ID: ${formData.foodParcels.pickupLocationId})`,
                        );
                    }
                } catch {
                    // Error fetching pickup location
                    setPickupLocationName(
                        t("foodParcels.pickupLocation") +
                            ` (ID: ${formData.foodParcels.pickupLocationId})`,
                    );
                } finally {
                    setIsLoadingLocation(false);
                }
            }
        };

        fetchLocationName();
    }, [formData.foodParcels?.pickupLocationId, t]);

    return (
        <Card withBorder p="md" radius="md" shadow="sm">
            <Title order={3} mb="xs">
                {tReview("title")}
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                {isEditing ? tReview("editDescription") : tReview("createDescription")}
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                {/* Left Column - All sections except Matkassar */}
                <Box>
                    {/* Household Info */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {tHouseholdDetail("basics")}
                        </Title>
                        <Group gap="xs" mb="xs">
                            <ThemeIcon size="md" variant="light" color="blue">
                                <IconUser size={16} />
                            </ThemeIcon>
                            <Text>
                                {formData.household.first_name} {formData.household.last_name}
                            </Text>
                        </Group>
                        <Group gap="xs" mb="xs">
                            <ThemeIcon size="md" variant="light" color="blue">
                                <IconPhone size={16} />
                            </ThemeIcon>
                            <Text>{formData.household.phone_number}</Text>
                        </Group>
                        <Group gap="xs">
                            <ThemeIcon size="md" variant="light" color="blue">
                                <IconMailbox size={16} />
                            </ThemeIcon>
                            <Text>{formatPostalCode(formData.household.postal_code)}</Text>
                        </Group>
                    </Paper>

                    {/* Household Members */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {tHouseholdDetail("members", {
                                count: String(formData.members.length),
                            })}
                        </Title>
                        {formData.members.length > 0 ? (
                            <Group gap="xs">
                                {formData.members.map((member, index) => {
                                    // Choose appropriate icon and color based on age and gender
                                    let iconColor = "gray";
                                    let genderIcon;

                                    // Gender icons
                                    if (member.sex === "male") {
                                        iconColor = "blue";
                                        genderIcon = <IconMars size={20} />;
                                    } else if (member.sex === "female") {
                                        iconColor = "pink";
                                        genderIcon = <IconVenus size={20} />;
                                    } else {
                                        iconColor = "grape";
                                        genderIcon = <IconGenderBigender size={20} />;
                                    }

                                    return (
                                        <Paper
                                            key={member.id || index}
                                            radius="md"
                                            p="xs"
                                            withBorder
                                            shadow="xs"
                                        >
                                            <Group gap="xs" wrap="nowrap">
                                                <Badge
                                                    size="lg"
                                                    radius="xl"
                                                    variant="light"
                                                    color={iconColor}
                                                    rightSection={genderIcon}
                                                />
                                                <Text>
                                                    {member.age} {tHouseholdDetail("ageUnit")}
                                                </Text>
                                            </Group>
                                        </Paper>
                                    );
                                })}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="sm">
                                {tHouseholdDetail("noMembers")}
                            </Text>
                        )}
                    </Paper>

                    {/* Pets */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {tHouseholdDetail("pets", { count: String(formData.pets.length) })}
                        </Title>
                        {formData.pets.length > 0 ? (
                            <Group wrap="wrap" gap="md">
                                {formData.pets.map((pet, index) => (
                                    <Paper
                                        key={pet.id || index}
                                        radius="md"
                                        p="xs"
                                        withBorder
                                        shadow="xs"
                                    >
                                        <Group gap="xs" wrap="nowrap">
                                            <Badge
                                                size="lg"
                                                radius="xl"
                                                variant="light"
                                                color="blue"
                                            >
                                                {pet.count || 1}
                                            </Badge>
                                            <Text size="sm" fw={500}>
                                                {pet.speciesName || pet.species}
                                            </Text>
                                        </Group>
                                    </Paper>
                                ))}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="sm">
                                {tHouseholdDetail("noPets")}
                            </Text>
                        )}
                    </Paper>

                    {/* Dietary Restrictions */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {tHouseholdDetail("dietaryRestrictions", {
                                count: String(formData.dietaryRestrictions.length),
                            })}
                        </Title>
                        {formData.dietaryRestrictions.length > 0 ? (
                            <Group gap="xs">
                                {formData.dietaryRestrictions.map(restriction => (
                                    <Badge
                                        key={restriction.id}
                                        color="blue"
                                        variant="filled"
                                        size="md"
                                    >
                                        {restriction.name}
                                    </Badge>
                                ))}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="sm">
                                {tHouseholdDetail("noDietaryRestrictions")}
                            </Text>
                        )}
                    </Paper>

                    {/* Additional Needs */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            {tHouseholdDetail("additionalNeeds", {
                                count: String(formData.additionalNeeds.length),
                            })}
                        </Title>
                        {formData.additionalNeeds.length > 0 ? (
                            <Group gap="xs">
                                {formData.additionalNeeds.map(need => (
                                    <Badge key={need.id} color="cyan" variant="filled" size="md">
                                        {need.need}
                                    </Badge>
                                ))}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="sm">
                                {tHouseholdDetail("noAdditionalNeeds")}
                            </Text>
                        )}
                    </Paper>

                    {/* Comments Section - Moved to left column and wrapped in Paper */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <CommentSection
                            comments={formData.comments || []}
                            onAddComment={onAddComment}
                            onDeleteComment={onDeleteComment}
                            entityType="household"
                        />
                    </Paper>
                </Box>

                {/* Right Column - Food Parcels only */}
                <Box>
                    {/* Food Parcels */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="sm">
                            {tHouseholdDetail("foodParcels", {
                                count: String(formData.foodParcels.parcels?.length || 0),
                            })}
                        </Title>

                        {/* Location info */}
                        {isLoadingLocation ? (
                            <Group mb="md">
                                <Loader size="xs" />
                                <Text size="sm">{t("foodParcels.loadingAvailability")}</Text>
                            </Group>
                        ) : pickupLocationName ? (
                            <Group mb="md" gap="xs">
                                <ThemeIcon size="md" variant="light" color="grape">
                                    <IconBuilding size={16} />
                                </ThemeIcon>
                                <Text size="sm" fw={500}>
                                    {pickupLocationName}
                                </Text>
                            </Group>
                        ) : null}

                        {/* Parcels list */}
                        {formData.foodParcels.parcels && formData.foodParcels.parcels.length > 0 ? (
                            <div>
                                {formData.foodParcels.parcels.map((parcel, index) => (
                                    <Paper
                                        key={parcel.id || index}
                                        withBorder
                                        p="xs"
                                        radius="sm"
                                        mb={
                                            index === formData.foodParcels.parcels.length - 1
                                                ? 0
                                                : "xs"
                                        }
                                    >
                                        <Group justify="space-between" wrap="nowrap">
                                            <Group gap="xs">
                                                <ThemeIcon size="md" variant="light" color="indigo">
                                                    <IconCalendarEvent size={16} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text fw={500} size="sm">
                                                        {getWeekdayName(parcel.pickupDate)}
                                                    </Text>
                                                    <Code>
                                                        {parcel.pickupDate && (
                                                            <LocalizedDate
                                                                date={new Date(parcel.pickupDate)}
                                                            />
                                                        )}
                                                    </Code>
                                                </div>
                                            </Group>
                                            <Group gap="xs">
                                                <ThemeIcon size="md" variant="light" color="indigo">
                                                    <IconClock size={16} />
                                                </ThemeIcon>
                                                <Code>
                                                    {formatTime(parcel.pickupEarliestTime)}-
                                                    {formatTime(parcel.pickupLatestTime)}
                                                </Code>
                                            </Group>
                                        </Group>
                                    </Paper>
                                ))}
                            </div>
                        ) : (
                            <Text c="dimmed" size="sm">
                                {tHouseholdDetail("noFoodParcels")}
                            </Text>
                        )}
                    </Paper>
                </Box>
            </SimpleGrid>
        </Card>
    );
}
