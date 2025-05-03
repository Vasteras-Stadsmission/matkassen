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
import { useRouter } from "@/app/i18n/navigation";
import { useDisclosure } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

// Import form components
import HouseholdForm from "@/app/[locale]/households/enroll/components/HouseholdForm";
import MembersForm from "@/app/[locale]/households/enroll/components/MembersForm";
import DietaryRestrictionsForm from "@/app/[locale]/households/enroll/components/DietaryRestrictionsForm";
import AdditionalNeedsForm from "@/app/[locale]/households/enroll/components/AdditionalNeedsForm";
import PetsForm from "@/app/[locale]/households/enroll/components/PetsForm";
import FoodParcelsForm from "@/app/[locale]/households/enroll/components/FoodParcelsForm";
import ReviewForm from "@/app/[locale]/households/enroll/components/ReviewForm";

// Import types
import {
    FormData,
    Household,
    HouseholdMember,
    DietaryRestriction,
    AdditionalNeed,
    FoodParcels,
    Comment,
} from "@/app/[locale]/households/enroll/types";

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
    // Title to display at the top (optional, will use default if not provided)
    title?: string | React.ReactNode;
    // Submit function (different for enrollment vs editing)
    onSubmit?: (data: FormData) => Promise<{ success: boolean; error?: string }>;
    // Optional function to add comments (passed from the parent for edit mode)
    onAddComment?: (comment: string) => Promise<Comment | undefined>;
    // Optional function to delete comments (passed from the parent for edit mode)
    onDeleteComment?: (commentId: string) => Promise<void>;
    // Initial loading state
    isLoading?: boolean;
    // Error message if initial data loading failed
    loadError?: string | null;
    // Button color for final submit button
    submitButtonColor?: string;
    // Text for the submit button (optional, will use default if not provided)
    submitButtonText?: string;
}

export function HouseholdWizard({
    mode,
    initialData,
    title,
    onSubmit,
    onAddComment,
    onDeleteComment,
    isLoading = false,
    loadError = null,
    submitButtonColor = "green",
    submitButtonText,
}: HouseholdWizardProps) {
    const t = useTranslations("wizard");
    const locale = useLocale();
    const router = useRouter();
    const [active, setActive] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<SubmitStatus | null>(null);
    const [validationError, setValidationError] = useState<ValidationError | null>(null);
    const [showError, { open: openError, close: closeError }] = useDisclosure(false);

    // Use localized default values if not provided
    const defaultTitle = mode === "create" ? t("createHousehold") : t("editHousehold");
    const defaultSubmitButtonText = mode === "create" ? t("saveHousehold") : t("updateHousehold");

    // Initialize form data, either from props or with default empty values
    const [formData, setFormData] = useState<FormData>(
        initialData || {
            household: {
                first_name: "",
                last_name: "",
                phone_number: "",
                locale: locale,
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
            comments: [],
        },
    );

    // Update form data if initialData changes (e.g. when data finishes loading in edit mode)
    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    // Function to handle navigation between steps with appropriate validation
    const nextStep = () => {
        // Clear any previous validation errors
        setValidationError(null);
        closeError();

        // Check if we need to validate the current step
        if (active === 0) {
            // Validate household step
            const { first_name, last_name, phone_number, postal_code } = formData.household;

            // Check first name
            if (!first_name || first_name.trim().length < 2) {
                setValidationError({
                    field: "first_name",
                    message: t("validation.firstNameLength"),
                });
                openError();
                return;
            }

            // Check last name
            if (!last_name || last_name.trim().length < 2) {
                setValidationError({
                    field: "last_name",
                    message: t("validation.lastNameLength"),
                });
                openError();
                return;
            }

            // Check phone number
            if (!phone_number || !/^\d{8,12}$/.test(phone_number)) {
                setValidationError({
                    field: "phone_number",
                    message: t("validation.phoneNumberFormat"),
                });
                openError();
                return;
            }

            // Check postal code
            const cleanPostalCode = postal_code.replace(/\s/g, "");
            if (!cleanPostalCode || !/^\d{5}$/.test(cleanPostalCode)) {
                setValidationError({
                    field: "postal_code",
                    message: t("validation.postalCodeFormat"),
                });
                openError();
                return;
            }
        }

        // For food parcels step, validate pickup location
        if (active === 5) {
            const { pickupLocationId } = formData.foodParcels;
            if (!pickupLocationId) {
                setValidationError({
                    field: "pickupLocationId",
                    message: t("validation.pickupLocation"),
                });
                openError();
                return;
            }
        }

        // If all validations pass, move to the next step
        setActive(current => (current < 6 ? current + 1 : current));
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

    const handleSubmit = async () => {
        if (!onSubmit) return;

        try {
            setSubmitting(true);
            setSubmitStatus(null);

            // Submit data using the provided onSubmit function
            const result = await onSubmit(formData);

            if (result.success) {
                setSubmitStatus({
                    type: "success",
                    message: mode === "create" ? t("success.created") : t("success.updated"),
                });

                // Navigate to destination with success message in query params
                router.push(
                    `/households?success=true&action=${mode}&householdName=${encodeURIComponent(
                        formData.household.first_name + " " + formData.household.last_name,
                    )}`,
                );
            } else {
                setSubmitStatus({
                    type: "error",
                    message: `${t("error.general")}: ${result.error || t("error.unknown")}`,
                });
                setSubmitting(false); // Only stop the spinner if there's an error
            }
        } catch (error) {
            console.error(`Error ${mode === "create" ? "creating" : "updating"} household:`, error);
            setSubmitStatus({
                type: "error",
                message: mode === "create" ? t("error.create") : t("error.update"),
            });
            setSubmitting(false);
        }
    };

    // Function to handle adding comments through the parent handler if provided
    const handleAddComment = async (comment: string) => {
        if (onAddComment) {
            return await onAddComment(comment);
        }
        return undefined;
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
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title={t("error.title")}
                    color="red"
                    mb="md"
                >
                    {loadError}
                </Alert>
                <Button onClick={() => router.push("/households")}>{t("backToHouseholds")}</Button>
            </Container>
        );
    }

    return (
        <Container size="lg" py="md">
            <Box mb="md">
                <Title order={2} ta="center" component="div">
                    {title || defaultTitle}
                </Title>
            </Box>

            {submitting && (
                <Center my="md">
                    <Group>
                        <Loader size="md" />
                        <Text>
                            {mode === "create" ? t("submitting.create") : t("submitting.update")}
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
                    title={submitStatus.type === "success" ? t("success.title") : t("error.title")}
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
                    title={t("validation.title")}
                    mb="md"
                    onClose={closeError}
                >
                    {validationError.message}
                </Notification>
            )}

            <Card withBorder radius="md" p="md" mb="md">
                <Stepper active={active} onStepClick={setActive} size="sm">
                    <Stepper.Step
                        label={t("steps.basics.label")}
                        description={t("steps.basics.description")}
                    >
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

                    <Stepper.Step
                        label={t("steps.members.label")}
                        description={t("steps.members.description")}
                    >
                        <MembersForm
                            data={formData.members}
                            updateData={(data: HouseholdMember[]) =>
                                updateFormData("members", data)
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step
                        label={t("steps.diet.label")}
                        description={t("steps.diet.description")}
                    >
                        <DietaryRestrictionsForm
                            data={formData.dietaryRestrictions}
                            updateData={(data: DietaryRestriction[]) =>
                                updateFormData("dietaryRestrictions", data)
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step
                        label={t("steps.pets.label")}
                        description={t("steps.pets.description")}
                    >
                        <PetsForm
                            data={formData.pets}
                            updateData={data => updateFormData("pets", data)}
                        />
                    </Stepper.Step>

                    <Stepper.Step
                        label={t("steps.needs.label")}
                        description={t("steps.needs.description")}
                    >
                        <AdditionalNeedsForm
                            data={formData.additionalNeeds}
                            updateData={(data: AdditionalNeed[]) =>
                                updateFormData("additionalNeeds", data)
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step
                        label={t("steps.parcels.label")}
                        description={t("steps.parcels.description")}
                    >
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

                    <Stepper.Step
                        label={t("steps.review.label")}
                        description={t("steps.review.description")}
                    >
                        <ReviewForm
                            formData={formData}
                            isEditing={mode === "edit"}
                            onAddComment={handleAddComment}
                            onDeleteComment={onDeleteComment}
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
                                {t("navigation.back")}
                            </Button>
                        )}
                        <Button onClick={nextStep} rightSection={<IconArrowRight size="1rem" />}>
                            {t("navigation.next")}
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
                            {t("navigation.back")}
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            color={submitButtonColor}
                            loading={submitting}
                            rightSection={<IconCheck size="1rem" />}
                        >
                            {submitButtonText || defaultSubmitButtonText}
                        </Button>
                    </Group>
                )}
            </Card>
        </Container>
    );
}
