"use client";

import {
    Card,
    Title,
    Text,
    Group,
    Badge,
    Box,
    Code,
    SimpleGrid,
    Paper,
    ThemeIcon,
} from "@mantine/core";
import {
    IconUser,
    IconPhone,
    IconCalendarEvent,
    IconClock,
    IconBuilding,
    IconMailbox,
    IconMars,
    IconVenus,
    IconGenderBigender,
    IconPaw,
    IconLanguage,
} from "@tabler/icons-react";

interface HouseholdDetailProps {
    householdDetail: {
        household: {
            first_name: string;
            last_name: string;
            phone_number: string;
            locale: string;
            postal_code: string;
        };
        members: Array<{
            id?: string;
            age: number;
            sex: string;
        }>;
        dietaryRestrictions: Array<{
            id: string;
            name: string;
        }>;
        additionalNeeds: Array<{
            id: string;
            need: string;
        }>;
        pets: Array<{
            id?: string;
            species: string;
            speciesName?: string;
        }>;
        foodParcels: {
            pickupLocationId: string;
            totalCount: number;
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
    };
}

export default function HouseholdDetail({ householdDetail }: HouseholdDetailProps) {
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

    // Format postal code as XXX XX
    const formatPostalCode = (postalCode: string) => {
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
        const weekdays = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
        return weekdays[new Date(date).getDay()];
    };

    // Locale code to full language name in Swedish
    const getLanguageName = (locale: string) => {
        const languageMap: Record<string, string> = {
            sv: "Svenska",
            en: "Engelska",
            de: "Tyska",
            fr: "Franska",
            es: "Spanska",
            fi: "Finska",
            no: "Norska",
            da: "Danska",
            pl: "Polska",
            ru: "Ryska",
            ar: "Arabiska",
            fa: "Persiska",
            ti: "Tigrinja",
            so: "Somaliska",
            am: "Amhariska",
            ku: "Kurdiska",
            tr: "Turkiska",
            uk: "Ukrainska",
            ro: "Rumänska",
            th: "Thailändska",
            zh: "Kinesiska",
            vi: "Vietnamesiska",
            ur: "Urdu",
            hi: "Hindi",
            bn: "Bengali",
        };

        return languageMap[locale] || locale; // Return the code itself if not found in the map
    };

    return (
        <Card withBorder p="md" radius="md" shadow="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                {/* Left Column - All sections except Matkassar */}
                <Box>
                    {/* Household Info */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            Grunduppgifter
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
                            <Text>{householdDetail.household.phone_number}</Text>
                        </Group>
                        <Group gap="xs" mb="xs">
                            <ThemeIcon size="md" variant="light" color="blue">
                                <IconMailbox size={16} />
                            </ThemeIcon>
                            <Text>{formatPostalCode(householdDetail.household.postal_code)}</Text>
                        </Group>
                        <Group gap="xs" mb="xs">
                            <ThemeIcon size="md" variant="light" color="blue">
                                <IconLanguage size={16} />
                            </ThemeIcon>
                            <Text>{getLanguageName(householdDetail.household.locale)}</Text>
                        </Group>
                    </Paper>

                    {/* Household Members */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            Medlemmar ({householdDetail.members.length})
                        </Title>
                        {householdDetail.members.length > 0 ? (
                            <Group gap="xs">
                                {householdDetail.members.map((member, index) => {
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
                                                <Text>{member.age} år</Text>
                                            </Group>
                                        </Paper>
                                    );
                                })}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="sm">
                                Inga medlemmar tillagda
                            </Text>
                        )}
                    </Paper>

                    {/* Pets */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            Husdjur ({householdDetail.pets.length})
                        </Title>
                        {householdDetail.pets.length > 0 ? (
                            <Group wrap="wrap" gap="md">
                                {householdDetail.pets.map((pet, index) => (
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
                                                <IconPaw size={12} />
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
                                Inga husdjur tillagda
                            </Text>
                        )}
                    </Paper>

                    {/* Dietary Restrictions */}
                    <Paper withBorder p="md" radius="md" mb="md">
                        <Title order={5} mb="md">
                            Matrestriktioner ({householdDetail.dietaryRestrictions.length})
                        </Title>
                        {householdDetail.dietaryRestrictions.length > 0 ? (
                            <Group gap="xs">
                                {householdDetail.dietaryRestrictions.map(restriction => (
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
                                Inga matrestriktioner tillagda
                            </Text>
                        )}
                    </Paper>

                    {/* Additional Needs */}
                    <Paper withBorder p="md" radius="md">
                        <Title order={5} mb="md">
                            Ytterligare behov ({householdDetail.additionalNeeds.length})
                        </Title>
                        {householdDetail.additionalNeeds.length > 0 ? (
                            <Group gap="xs">
                                {householdDetail.additionalNeeds.map(need => (
                                    <Badge key={need.id} color="cyan" variant="filled" size="md">
                                        {need.need}
                                    </Badge>
                                ))}
                            </Group>
                        ) : (
                            <Text c="dimmed" size="sm">
                                Inga ytterligare behov tillagda
                            </Text>
                        )}
                    </Paper>
                </Box>

                {/* Right Column - Only Matkassar */}
                <Box>
                    {/* Food Parcels */}
                    <Paper withBorder p="md" radius="md" h="100%">
                        <Title order={5} mb="sm">
                            Matkassar ({householdDetail.foodParcels.parcels?.length || 0})
                        </Title>

                        {/* Location info */}
                        {householdDetail.pickupLocation ? (
                            <Group mb="md" gap="xs">
                                <ThemeIcon size="md" variant="light" color="grape">
                                    <IconBuilding size={16} />
                                </ThemeIcon>
                                <Text size="sm" fw={500}>
                                    {householdDetail.pickupLocation.name}
                                </Text>
                            </Group>
                        ) : null}

                        {/* Parcels list */}
                        {householdDetail.foodParcels.parcels &&
                        householdDetail.foodParcels.parcels.length > 0 ? (
                            <div>
                                {householdDetail.foodParcels.parcels.map((parcel, index) => (
                                    <Paper
                                        key={parcel.id || index}
                                        withBorder
                                        p="xs"
                                        radius="sm"
                                        mb={
                                            index === householdDetail.foodParcels.parcels.length - 1
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
                                                    <Code>{formatDate(parcel.pickupDate)}</Code>
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

                                        {parcel.isPickedUp && (
                                            <Badge mt="xs" color="green" variant="light">
                                                Uthämtad
                                            </Badge>
                                        )}
                                    </Paper>
                                ))}
                            </div>
                        ) : (
                            <Text c="dimmed" size="sm">
                                Inga matkassar schemalagda
                            </Text>
                        )}
                    </Paper>
                </Box>
            </SimpleGrid>
        </Card>
    );
}
