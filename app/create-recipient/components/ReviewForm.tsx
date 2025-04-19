"use client";

import { Card, Title, Text, List, Group, Button, Divider, Badge } from "@mantine/core";
import { useRouter } from "next/navigation";

// Import all the types we defined in other components
interface Household {
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    postal_code: string;
}

interface HouseholdMember {
    id?: string;
    age: number;
    sex: string;
}

interface DietaryRestriction {
    id: string;
    name: string;
    isCustom?: boolean;
}

interface AdditionalNeed {
    id: string;
    need: string;
    isCustom?: boolean;
}

interface Pet {
    id?: string;
    species: string;
}

interface FoodParcel {
    id?: string;
    pickupDate: Date;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
}

interface FoodParcels {
    pickupLocationId: string;
    totalCount: number;
    weekday: string;
    repeatValue: string;
    startDate: Date;
    parcels: FoodParcel[];
}

interface FormData {
    household: Household;
    members: HouseholdMember[];
    dietaryRestrictions: DietaryRestriction[];
    additionalNeeds: AdditionalNeed[];
    pets: Pet[];
    foodParcels: FoodParcels;
}

interface ReviewFormProps {
    formData: FormData;
    onSubmit: () => Promise<void>;
}

export default function ReviewForm({ formData, onSubmit }: ReviewFormProps) {
    const router = useRouter();

    const handleSubmit = async () => {
        try {
            await onSubmit();
            router.push("/recipients"); // Redirect to recipients page after successful submission
        } catch (error) {
            console.error("Error submitting form:", error);
        }
    };

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

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Sammanfattning
            </Title>
            <Text color="dimmed" size="sm" mb="lg">
                Granska all information innan du skapar den nya mottagaren.
            </Text>

            <Title order={5}>Grunduppgifter</Title>
            <List spacing="xs" mb="lg">
                <List.Item>
                    <Text>
                        Namn: {formData.household.first_name} {formData.household.last_name}
                    </Text>
                </List.Item>
                <List.Item>
                    <Text>Telefon: {formData.household.phone_number}</Text>
                </List.Item>
                <List.Item>
                    <Text>Postnummer: {formData.household.postal_code}</Text>
                </List.Item>
            </List>

            <Divider my="md" />

            <Title order={5}>Medlemmar ({formData.members.length})</Title>
            {formData.members.length > 0 ? (
                <List spacing="xs" mb="lg">
                    {formData.members.map((member, index) => (
                        <List.Item key={member.id || index}>
                            <Text>
                                {member.age} år,{" "}
                                {member.sex === "male"
                                    ? "Man"
                                    : member.sex === "female"
                                      ? "Kvinna"
                                      : "Annat"}
                            </Text>
                        </List.Item>
                    ))}
                </List>
            ) : (
                <Text color="dimmed" mb="lg">
                    Inga medlemmar tillagda
                </Text>
            )}

            <Divider my="md" />

            <Title order={5}>Matrestriktioner ({formData.dietaryRestrictions.length})</Title>
            {formData.dietaryRestrictions.length > 0 ? (
                <Group mb="lg">
                    {formData.dietaryRestrictions.map(restriction => (
                        <Badge key={restriction.id} color="blue" variant="filled">
                            {restriction.name}
                        </Badge>
                    ))}
                </Group>
            ) : (
                <Text color="dimmed" mb="lg">
                    Inga matrestriktioner tillagda
                </Text>
            )}

            <Divider my="md" />

            <Title order={5}>Husdjur ({formData.pets.length})</Title>
            {formData.pets.length > 0 ? (
                <List spacing="xs" mb="lg">
                    {formData.pets.map((pet, index) => (
                        <List.Item key={pet.id || index}>
                            <Text>
                                {pet.species === "dog"
                                    ? "Hund"
                                    : pet.species === "cat"
                                      ? "Katt"
                                      : pet.species === "bunny"
                                        ? "Kanin"
                                        : pet.species === "bird"
                                          ? "Fågel"
                                          : pet.species}
                            </Text>
                        </List.Item>
                    ))}
                </List>
            ) : (
                <Text color="dimmed" mb="lg">
                    Inga husdjur tillagda
                </Text>
            )}

            <Divider my="md" />

            <Title order={5}>Ytterligare behov ({formData.additionalNeeds.length})</Title>
            {formData.additionalNeeds.length > 0 ? (
                <Group mb="lg">
                    {formData.additionalNeeds.map(need => (
                        <Badge key={need.id} color="cyan" variant="filled">
                            {need.need}
                        </Badge>
                    ))}
                </Group>
            ) : (
                <Text color="dimmed" mb="lg">
                    Inga ytterligare behov tillagda
                </Text>
            )}

            <Divider my="md" />

            <Title order={5}>Matkassar ({formData.foodParcels.parcels?.length || 0})</Title>
            <List spacing="xs" mb="lg">
                <List.Item>
                    <Text>
                        Upprepning:{" "}
                        {formData.foodParcels.repeatValue === "weekly"
                            ? "Varje vecka"
                            : formData.foodParcels.repeatValue === "biweekly"
                              ? "Varannan vecka"
                              : "Varje månad"}
                    </Text>
                </List.Item>
                {formData.foodParcels.parcels && formData.foodParcels.parcels.length > 0 && (
                    <List.Item>
                        <Text>
                            Första matkasse:{" "}
                            {formatDate(formData.foodParcels.parcels[0].pickupDate)},
                            {formatTime(formData.foodParcels.parcels[0].pickupEarliestTime)}-
                            {formatTime(formData.foodParcels.parcels[0].pickupLatestTime)}
                        </Text>
                    </List.Item>
                )}
            </List>

            <Group justify="center" mt="xl">
                <Button color="green" size="lg" onClick={handleSubmit}>
                    Skapa ny mottagare
                </Button>
            </Group>
        </Card>
    );
}
