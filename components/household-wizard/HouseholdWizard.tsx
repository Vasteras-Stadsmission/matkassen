"use client";

import { useState, useEffect } from "react";
import {
    Container,
    Title,
    Stepper,
    Group,
    Button,
    Card,
    Loader,
    Center,
    Text,
    Alert,
    Notification,
    Box,
} from "@mantine/core";
import { IconCheck, IconAlertCircle, IconArrowRight, IconArrowLeft } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useDisclosure } from "@mantine/hooks";

// Import form components
import HouseholdForm from "@/app/households/enroll/components/HouseholdForm";
import MembersForm from "@/app/households/enroll/components/MembersForm";
import DietaryRestrictionsForm from "@/app/households/enroll/components/DietaryRestrictionsForm";
import AdditionalNeedsForm from "@/app/households/enroll/components/AdditionalNeedsForm";
import PetsForm from "@/app/households/enroll/components/PetsForm";
import FoodParcelsForm from "@/app/households/enroll/components/FoodParcelsForm";
import ReviewForm from "@/app/households/enroll/components/ReviewForm";

// Import types
import {
    FormData,
    Household,
    HouseholdMember,
    DietaryRestriction,
    AdditionalNeed,
    FoodParcels,
} from "@/app/households/enroll/types";

// Define type for submit status
interface SubmitStatus {
    type: "success" | "error";
    message: string;
}

// Define type for validation errors
interface ValidationError {
    field: string;
    message: string;
}

// Define props for the HouseholdWizard component
interface HouseholdWizardProps {
    // Mode: "create" for enrollment, "edit" for editing
    mode: "create" | "edit";
    // Initial data (empty for enrollment, pre-populated for editing)
    initialData?: FormData;
    // Household ID (only needed for edit mode)
    householdId?: string;
    // Title to display at the top
    title: string | React.ReactNode;
    // Submit function (different for enrollment vs editing)
    onSubmit: (data: FormData) => Promise<{ success: boolean; error?: string }>;
    // Initial loading state
    isLoading?: boolean;
    // Error message if initial data loading failed
    loadError?: string | null;
    // Button color for final submit button
    submitButtonColor?: string;
    // Text for the submit button
    submitButtonText?: string;
}

export default function HouseholdWizard({
    mode,
    initialData,
    title,
    onSubmit,
    isLoading = false,
    loadError = null,
    submitButtonColor = "green",
    submitButtonText = "Spara hushåll",
}: HouseholdWizardProps) {
    const router = useRouter();
    const [active, setActive] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<SubmitStatus | null>(null);
    const [validationError, setValidationError] = useState<ValidationError | null>(null);
    const [showError, { open: openError, close: closeError }] = useDisclosure(false);

    // Initialize form data, either from props or with default empty values
    const [formData, setFormData] = useState<FormData>(
        initialData || {
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
        },
    );

    // Update form data if initialData changes (e.g. when data finishes loading in edit mode)
    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const nextStep = () => {
        // Clear any previous validation errors
        setValidationError(null);
        closeError();

        // Validate current step before proceeding
        if (active === 0 && !validateHouseholdStep()) return;
        if (active === 5 && !validateFoodParcelsStep()) return;

        setActive(current => (current < 7 ? current + 1 : current));
    };

    const prevStep = () => setActive(current => (current > 0 ? current - 1 : current));

    const updateFormData = (section: keyof FormData, data: unknown) => {
        setFormData(prev => ({
            ...prev,
            [section]: data,
        }));

        // Clear validation error when pickup location is updated
        if (
            section === "foodParcels" &&
            (data as FoodParcels).pickupLocationId &&
            validationError?.field === "pickupLocationId"
        ) {
            setValidationError(null);
            closeError();
        }
    };

    const validateHouseholdStep = () => {
        const { first_name, last_name, phone_number, postal_code } = formData.household;

        if (!first_name || first_name.trim().length < 2) {
            setValidationError({
                field: "first_name",
                message: "Förnamn måste vara minst 2 tecken",
            });
            openError();
            return false;
        }

        if (!last_name || last_name.trim().length < 2) {
            setValidationError({
                field: "last_name",
                message: "Efternamn måste vara minst 2 tecken",
            });
            openError();
            return false;
        }

        if (!phone_number || !/^\d{8,12}$/.test(phone_number)) {
            setValidationError({
                field: "phone_number",
                message: "Ange ett giltigt telefonnummer (8-12 siffror)",
            });
            openError();
            return false;
        }

        if (!postal_code || !/^\d{5}$/.test(postal_code)) {
            setValidationError({
                field: "postal_code",
                message: "Postnummer måste bestå av 5 siffror",
            });
            openError();
            return false;
        }

        return true;
    };

    const validateFoodParcelsStep = () => {
        const { pickupLocationId } = formData.foodParcels;

        if (!pickupLocationId) {
            setValidationError({
                field: "pickupLocationId",
                message: "Välj en hämtplats",
            });
            openError();
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        try {
            setSubmitting(true);
            setSubmitStatus(null);

            // Submit data using the provided onSubmit function
            const result = await onSubmit(formData);

            if (result.success) {
                setSubmitStatus({
                    type: "success",
                    message:
                        mode === "create"
                            ? "Nytt hushåll har registrerats!"
                            : "Hushållet har uppdaterats!",
                });

                // Redirect after a short delay
                setTimeout(() => {
                    router.push("/households");
                }, 1500);
            } else {
                setSubmitStatus({
                    type: "error",
                    message: `Ett fel uppstod: ${result.error || "Okänt fel"}`,
                });
            }
        } catch (error) {
            console.error(`Error ${mode === "create" ? "creating" : "updating"} household:`, error);
            setSubmitStatus({
                type: "error",
                message:
                    mode === "create"
                        ? "Ett fel uppstod vid registrering av hushåll."
                        : "Ett fel uppstod vid uppdatering av hushåll.",
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Handle initial loading and error states
    if (isLoading) {
        return (
            <Container size="lg" py="md">
                <Center style={{ height: "300px" }}>
                    <Loader size="lg" />
                </Center>
            </Container>
        );
    }

    if (loadError) {
        return (
            <Container size="lg" py="md">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Fel" color="red" mb="md">
                    {loadError}
                </Alert>
                <Button onClick={() => router.push("/households")}>
                    Tillbaka till hushållslistan
                </Button>
            </Container>
        );
    }

    return (
        <Container size="lg" py="md">
            <Box mb="md">
                <Title order={2} ta="center" component="div">
                    {title}
                </Title>
            </Box>

            {submitting && (
                <Center my="md">
                    <Group>
                        <Loader size="md" />
                        <Text>
                            {mode === "create" ? "Skapar nytt hushåll..." : "Uppdaterar hushåll..."}
                        </Text>
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
                    mb="md"
                >
                    {submitStatus.message}
                </Alert>
            )}

            {showError && validationError && (
                <Notification
                    icon={<IconAlertCircle size="1.1rem" />}
                    color="red"
                    title="Valideringsfel"
                    mb="md"
                    onClose={closeError}
                >
                    {validationError.message}
                </Notification>
            )}

            <Card withBorder radius="md" p="md" mb="md">
                <Stepper active={active} onStepClick={setActive} size="sm">
                    <Stepper.Step label="Grunduppgifter" description="Kontaktinformation">
                        <HouseholdForm
                            data={formData.household}
                            updateData={(data: Household) => updateFormData("household", data)}
                            error={
                                validationError?.field === "first_name" ||
                                validationError?.field === "last_name" ||
                                validationError?.field === "phone_number" ||
                                validationError?.field === "postal_code"
                                    ? validationError
                                    : null
                            }
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
                            updateData={data => updateFormData("pets", data)}
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
                            error={
                                validationError?.field === "pickupLocationId"
                                    ? validationError
                                    : null
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step label="Sammanfattning" description="Granska och skicka">
                        <ReviewForm
                            formData={formData}
                            onSubmit={handleSubmit}
                            isEditing={mode === "edit"}
                        />
                    </Stepper.Step>
                </Stepper>

                {active !== 6 && (
                    <Group justify="center" mt="md">
                        {active !== 0 && (
                            <Button
                                variant="default"
                                onClick={prevStep}
                                leftSection={<IconArrowLeft size="1rem" />}
                            >
                                Tillbaka
                            </Button>
                        )}
                        <Button onClick={nextStep} rightSection={<IconArrowRight size="1rem" />}>
                            Nästa steg
                        </Button>
                    </Group>
                )}

                {active === 6 && (
                    <Group justify="center" mt="md">
                        <Button
                            variant="default"
                            onClick={prevStep}
                            leftSection={<IconArrowLeft size="1rem" />}
                        >
                            Tillbaka
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            color={submitButtonColor}
                            loading={submitting}
                            rightSection={<IconCheck size="1rem" />}
                        >
                            {submitButtonText}
                        </Button>
                    </Group>
                )}
            </Card>
        </Container>
    );
}
