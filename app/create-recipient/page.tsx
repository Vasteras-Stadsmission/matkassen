"use client";

import { useState, useEffect } from "react";
import {
    Container,
    Title,
    Stepper,
    Group,
    Button,
    Card,
    rem,
    Loader,
    Center,
    Text,
    Alert,
} from "@mantine/core";
import { IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import HouseholdForm from "./components/HouseholdForm";
import MembersForm from "./components/MembersForm";
import DietaryRestrictionsForm from "./components/DietaryRestrictionsForm";
import AdditionalNeedsForm from "./components/AdditionalNeedsForm";
import PetsForm from "./components/PetsForm";
import FoodParcelsForm from "./components/FoodParcelsForm";
import ReviewForm from "./components/ReviewForm";
import { createHousehold } from "./actions";

// Define types for our form data
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

// Define type for submit status
interface SubmitStatus {
    type: "success" | "error";
    message: string;
}

export default function CreateRecipientPage() {
    const router = useRouter();
    const [active, setActive] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<SubmitStatus | null>(null);
    const [formData, setFormData] = useState<FormData>({
        household: {
            first_name: "",
            last_name: "",
            phone_number: "",
            locale: "sv",
            postal_code: "",
        },
        members: [],
        dietaryRestrictions: [],
        additionalNeeds: [],
        pets: [],
        foodParcels: {
            pickupLocationId: "",
            totalCount: 4,
            weekday: "1", // Monday
            repeatValue: "weekly", // weekly, bi-weekly, monthly
            startDate: new Date(),
            parcels: [],
        },
    });

    const nextStep = () => {
        // Validate current step before proceeding
        if (active === 0 && !validateHouseholdStep()) return;
        if (active === 5 && !validateFoodParcelsStep()) return;

        setActive(current => (current < 6 ? current + 1 : current));
    };

    const prevStep = () => setActive(current => (current > 0 ? current - 1 : current));

    const updateFormData = (section: keyof FormData, data: any) => {
        setFormData(prev => ({
            ...prev,
            [section]: data,
        }));
    };

    const validateHouseholdStep = () => {
        const { first_name, last_name, phone_number, postal_code } = formData.household;

        if (!first_name || first_name.trim().length < 2) {
            alert("Förnamn måste vara minst 2 tecken");
            return false;
        }

        if (!last_name || last_name.trim().length < 2) {
            alert("Efternamn måste vara minst 2 tecken");
            return false;
        }

        if (!phone_number || !/^\d{8,12}$/.test(phone_number)) {
            alert("Ange ett giltigt telefonnummer (8-12 siffror)");
            return false;
        }

        if (!postal_code || !/^\d{5}$/.test(postal_code)) {
            alert("Postnummer måste bestå av 5 siffror");
            return false;
        }

        return true;
    };

    const validateFoodParcelsStep = () => {
        const { pickupLocationId } = formData.foodParcels;

        if (!pickupLocationId) {
            alert("Välj en hämtplats");
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        try {
            setSubmitting(true);
            setSubmitStatus(null);

            // Submit data to the server
            const result = await createHousehold(formData);

            if (result.success) {
                setSubmitStatus({ type: "success", message: "Ny mottagare har skapats!" });

                // Redirect after a short delay
                setTimeout(() => {
                    router.push("/recipients");
                }, 1500);
            } else {
                setSubmitStatus({
                    type: "error",
                    message: `Ett fel uppstod: ${result.error || "Okänt fel"}`,
                });
            }
        } catch (error) {
            console.error("Error submitting form:", error);
            setSubmitStatus({
                type: "error",
                message: "Ett fel uppstod vid skapande av mottagare.",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Container size="lg" py="xl">
            <Title order={2} mb="xl" ta="center">
                Registrera ny mottagare
            </Title>

            {submitting && (
                <Center my="xl">
                    <Group>
                        <Loader size="md" />
                        <Text>Skapar ny mottagare...</Text>
                    </Group>
                </Center>
            )}

            {submitStatus && (
                <Alert
                    icon={
                        submitStatus.type === "success" ? (
                            <IconCheck size="1rem" />
                        ) : (
                            <IconAlertCircle size="1rem" />
                        )
                    }
                    title={submitStatus.type === "success" ? "Klart!" : "Fel"}
                    color={submitStatus.type === "success" ? "green" : "red"}
                    mb="lg"
                >
                    {submitStatus.message}
                </Alert>
            )}

            <Card withBorder radius="md" p="xl" mb="xl">
                <Stepper active={active} onStepClick={setActive} size="sm">
                    <Stepper.Step label="Grunduppgifter" description="Kontaktinformation">
                        <HouseholdForm
                            data={formData.household}
                            updateData={(data: Household) => updateFormData("household", data)}
                        />
                    </Stepper.Step>

                    <Stepper.Step label="Medlemmar" description="Hushållsmedlemmar">
                        <MembersForm
                            data={formData.members}
                            updateData={(data: HouseholdMember[]) =>
                                updateFormData("members", data)
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step label="Matrestriktioner" description="Specialkost">
                        <DietaryRestrictionsForm
                            data={formData.dietaryRestrictions}
                            updateData={(data: DietaryRestriction[]) =>
                                updateFormData("dietaryRestrictions", data)
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step label="Husdjur" description="Information om husdjur">
                        <PetsForm
                            data={formData.pets}
                            updateData={(data: Pet[]) => updateFormData("pets", data)}
                        />
                    </Stepper.Step>

                    <Stepper.Step label="Ytterligare behov" description="Särskilda behov">
                        <AdditionalNeedsForm
                            data={formData.additionalNeeds}
                            updateData={(data: AdditionalNeed[]) =>
                                updateFormData("additionalNeeds", data)
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step label="Matkassar" description="Schemaläggning">
                        <FoodParcelsForm
                            data={formData.foodParcels}
                            updateData={(data: FoodParcels) => updateFormData("foodParcels", data)}
                        />
                    </Stepper.Step>

                    <Stepper.Completed>
                        <ReviewForm formData={formData} onSubmit={handleSubmit} />
                    </Stepper.Completed>
                </Stepper>

                {active !== 6 && (
                    <Group justify="center" mt={rem(30)}>
                        {active !== 0 && (
                            <Button variant="default" onClick={prevStep}>
                                Tillbaka
                            </Button>
                        )}
                        <Button onClick={nextStep}>Nästa steg</Button>
                    </Group>
                )}
            </Card>
        </Container>
    );
}
