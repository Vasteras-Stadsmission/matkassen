"use client";

import { useState, useEffect, useRef } from "react";
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
    Modal,
    Stack,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconCheck,
    IconAlertCircle,
    IconArrowRight,
    IconArrowLeft,
    IconPackage,
    IconX,
} from "@tabler/icons-react";
import { useRouter } from "@/app/i18n/navigation";
import { useDisclosure } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import React from "react";

// Helper function to check if upcoming parcels exist for a household
async function checkHouseholdUpcomingParcels(householdId: string): Promise<boolean> {
    try {
        const response = await fetch(
            `/api/admin/parcels/upcoming?householdId=${encodeURIComponent(householdId)}`,
        );

        if (!response.ok) {
            // Log HTTP errors with status and response details for debugging
            const responseText = await response.text().catch(() => "Unable to read response");
            console.error(
                `Failed to check upcoming parcels for household ${householdId}:`,
                `HTTP ${response.status} ${response.statusText}`,
                responseText,
            );
            return false; // Assume no parcels on error to be safe
        }

        const upcomingParcels = await response.json();
        // Since we're filtering server-side, any result means there are upcoming parcels
        return upcomingParcels.length > 0;
    } catch (error) {
        console.error("Error checking upcoming parcels:", error);
        return false; // Assume no parcels on error to be safe
    }
}

// Helper function to determine if we should show the add parcels dialog
async function shouldShowAddParcelsDialog(
    mode: "create" | "edit",
    resultHouseholdId: string | undefined,
    editHouseholdId: string | undefined,
    formData: FormData,
): Promise<{ show: boolean; householdId?: string }> {
    if (mode === "create" && resultHouseholdId) {
        // For create mode, check if form has any parcels
        const hasExistingParcels =
            formData.foodParcels?.parcels && formData.foodParcels.parcels.length > 0;
        return {
            show: !hasExistingParcels,
            householdId: resultHouseholdId,
        };
    } else if (mode === "edit" && editHouseholdId) {
        // For edit mode, check if household has upcoming parcels in the database
        const hasUpcomingParcels = await checkHouseholdUpcomingParcels(editHouseholdId);
        return {
            show: !hasUpcomingParcels,
            householdId: editHouseholdId,
        };
    }

    return { show: false };
}

// Import form components
import HouseholdForm from "@/app/[locale]/households/enroll/components/HouseholdForm";
import MembersForm from "@/app/[locale]/households/enroll/components/MembersForm";
import DietaryRestrictionsForm from "@/app/[locale]/households/enroll/components/DietaryRestrictionsForm";
import AdditionalNeedsForm from "@/app/[locale]/households/enroll/components/AdditionalNeedsForm";
import PetsForm from "@/app/[locale]/households/enroll/components/PetsForm";
import VerificationForm from "@/app/[locale]/households/enroll/components/VerificationForm";
import ReviewForm from "@/app/[locale]/households/enroll/components/ReviewForm";

// Import types
import {
    FormData,
    Household,
    HouseholdMember,
    DietaryRestriction,
    AdditionalNeed,
    Comment,
} from "@/app/[locale]/households/enroll/types";

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
    // Household ID (used for edit mode to check upcoming parcels)
    householdId?: string;
    // Title to display at the top (optional, will use default if not provided)
    title?: string | React.ReactNode;
    // Submit function (different for enrollment vs editing)
    onSubmit?: (
        data: FormData,
    ) => Promise<{ success: boolean; error?: string; householdId?: string }>;
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
    householdId,
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
    const [validationError, setValidationError] = useState<ValidationError | null>(null);
    const [showError, { open: openError, close: closeError }] = useDisclosure(false);
    const [showAddParcelsModal, setShowAddParcelsModal] = useState(false);
    const [createdHouseholdId, setCreatedHouseholdId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Verification questions state (only for create mode)
    const [checkedVerifications, setCheckedVerifications] = useState<Set<string>>(new Set());
    const [hasVerificationQuestions, setHasVerificationQuestions] = useState(false);
    const [verificationQuestionsError, setVerificationQuestionsError] = useState<string | null>(
        null,
    );
    const [retryTrigger, setRetryTrigger] = useState(0);

    // AbortController to prevent race conditions
    const abortControllerRef = useRef<AbortController | null>(null);

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

        // Validate verification step (step 5, only in create mode with questions)
        if (active === 5 && mode === "create" && hasVerificationQuestions) {
            // Fetch required questions and check if all are checked
            fetch(`/api/admin/verification-questions`)
                .then(res => res.json())
                .then(questions => {
                    // Defensive filtering: only check active required questions
                    const activeQuestions = questions.filter(
                        (q: { is_active: boolean }) => q.is_active,
                    );
                    const requiredQuestions = activeQuestions.filter(
                        (q: { is_required: boolean }) => q.is_required,
                    );
                    const allChecked = requiredQuestions.every((q: { id: string }) =>
                        checkedVerifications.has(q.id),
                    );

                    if (!allChecked) {
                        setValidationError({
                            field: "verification",
                            message: t("validation.verificationIncomplete"),
                        });
                        openError();
                        return;
                    }

                    // Validation passed, move to next step
                    const maxSteps = hasVerificationQuestions ? 6 : 5;
                    setActive(current => (current < maxSteps ? current + 1 : current));
                })
                .catch(err => {
                    console.error("Error validating verification questions:", err);
                });
            return;
        }

        // If all validations pass, move to the next step
        const maxSteps = mode === "create" && hasVerificationQuestions ? 6 : 5;
        setActive(current => (current < maxSteps ? current + 1 : current));
    };

    const prevStep = () => setActive(current => (current > 0 ? current - 1 : current));

    const updateFormData = (section: keyof FormData, data: unknown) => {
        setFormData(prev => ({
            ...prev,
            [section]: data,
        }));
    };

    // Handle verification checkbox changes
    const handleVerificationCheck = (questionId: string, checked: boolean) => {
        setCheckedVerifications(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(questionId);
            } else {
                newSet.delete(questionId);
            }
            return newSet;
        });
    };

    // Fetch global verification questions when in create mode
    useEffect(() => {
        if (mode !== "create") {
            setHasVerificationQuestions(false);
            setVerificationQuestionsError(null);
            return;
        }

        // Cancel any in-flight request to prevent race conditions
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const fetchQuestions = async () => {
            try {
                const response = await fetch(`/api/admin/verification-questions`, {
                    signal: abortControllerRef.current!.signal,
                });
                if (!response.ok) {
                    // SECURITY: Fail closed - treat API errors as critical
                    const errorText = await response.text().catch(() => "Unknown error");
                    console.error(
                        `Failed to load verification questions (HTTP ${response.status}): ${errorText}`,
                    );
                    setVerificationQuestionsError(t("error.verificationQuestionsLoadFailed"));
                    setHasVerificationQuestions(false);
                    return;
                }
                const questions = await response.json();
                // Defensive filtering: only count active questions
                const activeQuestions = questions.filter(
                    (q: { is_active: boolean }) => q.is_active,
                );
                setHasVerificationQuestions(activeQuestions.length > 0);
                setVerificationQuestionsError(null);
            } catch (error) {
                // Ignore aborted requests - they're intentional cancellations
                if (error instanceof Error && error.name === "AbortError") {
                    return;
                }
                // SECURITY: Fail closed - treat network errors as critical
                console.error("Network error loading verification questions:", error);
                setVerificationQuestionsError(t("error.verificationQuestionsLoadFailed"));
                setHasVerificationQuestions(false);
            }
        };

        fetchQuestions();
    }, [mode, t, retryTrigger]);

    // Cleanup: abort any pending requests on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const handleSubmit = async () => {
        if (!onSubmit || isSubmitting) return;

        // Defense-in-depth: Verify all required verification questions are checked before submit
        if (mode === "create" && hasVerificationQuestions) {
            try {
                const response = await fetch(`/api/admin/verification-questions`);
                const questions = await response.json();
                // Defensive filtering: only check active required questions
                const activeQuestions = questions.filter(
                    (q: { is_active: boolean }) => q.is_active,
                );
                const requiredQuestions = activeQuestions.filter(
                    (q: { is_required: boolean }) => q.is_required,
                );
                const allChecked = requiredQuestions.every((q: { id: string }) =>
                    checkedVerifications.has(q.id),
                );

                if (!allChecked) {
                    notifications.show({
                        title: t("error.title"),
                        message: t("validation.verificationIncomplete"),
                        color: "red",
                        icon: React.createElement(IconX, { size: "1.1rem" }),
                    });
                    return;
                }
            } catch (error) {
                console.error("Error validating verification questions:", error);
                notifications.show({
                    title: t("error.title"),
                    message: t("error.general"),
                    color: "red",
                    icon: React.createElement(IconX, { size: "1.1rem" }),
                });
                return;
            }
        }

        setIsSubmitting(true);
        try {
            // Submit data using the provided onSubmit function
            const result = await onSubmit(formData);

            if (result.success) {
                // Check if we should show the add parcels dialog
                const shouldShowDialog = await shouldShowAddParcelsDialog(
                    mode,
                    result.householdId,
                    householdId,
                    formData,
                );

                if (shouldShowDialog.show) {
                    // Show the add parcels modal (no notification yet)
                    setCreatedHouseholdId(shouldShowDialog.householdId!);
                    setShowAddParcelsModal(true);
                    return; // Don't navigate yet
                }

                // Navigate directly with success parameters for standard success flow
                const url = new URL("/households", window.location.origin);
                url.searchParams.set("success", "true");
                const successMessage =
                    mode === "create" ? t("success.created") : t("success.updated");
                url.searchParams.set("message", successMessage);
                url.searchParams.set("title", t("success.title"));
                router.push(url.pathname + url.search);
            } else {
                // Show error notification and stay on page
                notifications.show({
                    title: t("error.title"),
                    message: `${t("error.general")}: ${result.error || t("error.unknown")}`,
                    color: "red",
                    icon: React.createElement(IconX, { size: "1.1rem" }),
                });
            }
        } catch (error) {
            console.error(
                "Error %s household:",
                mode === "create" ? "creating" : "updating",
                error,
            );

            // Show error notification
            notifications.show({
                title: t("error.title"),
                message: mode === "create" ? t("error.create") : t("error.update"),
                color: "red",
                icon: React.createElement(IconX, { size: "1.1rem" }),
            });
        } finally {
            setIsSubmitting(false);
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

    // SECURITY: Block progress if verification questions failed to load in create mode
    // This ensures we fail closed rather than skipping required validation
    if (mode === "create" && verificationQuestionsError) {
        return (
            <Container size="lg" py="md">
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title={t("error.title")}
                    color="red"
                    mb="md"
                >
                    <Stack gap="sm">
                        <Text>{t("error.verificationQuestionsLoadFailed")}</Text>
                        <Text size="sm" c="dimmed">
                            {verificationQuestionsError}
                        </Text>
                    </Stack>
                </Alert>
                <Group justify="center" mt="md">
                    <Button
                        onClick={() => {
                            // Reset error and trigger re-fetch by incrementing retryTrigger
                            setVerificationQuestionsError(null);
                            setRetryTrigger(prev => prev + 1);
                        }}
                    >
                        {t("error.retry")}
                    </Button>
                    <Button variant="outline" onClick={() => router.push("/households")}>
                        {t("backToHouseholds")}
                    </Button>
                </Group>
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
                <Stepper
                    active={active}
                    onStepClick={setActive}
                    size="sm"
                    allowNextStepsSelect={false}
                >
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

                    {/* Verification step - only shown in create mode with questions */}
                    {mode === "create" && hasVerificationQuestions && (
                        <Stepper.Step
                            label={t("steps.verification.label")}
                            description={t("steps.verification.description")}
                        >
                            <VerificationForm
                                checkedQuestions={checkedVerifications}
                                onUpdateChecked={handleVerificationCheck}
                            />
                        </Stepper.Step>
                    )}

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

                {/* Calculate the final step index dynamically */}
                {(() => {
                    const finalStepIndex = mode === "create" && hasVerificationQuestions ? 6 : 5;
                    const isOnFinalStep = active === finalStepIndex;

                    return (
                        <>
                            {!isOnFinalStep && (
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
                                    <Button
                                        onClick={nextStep}
                                        rightSection={<IconArrowRight size="1rem" />}
                                    >
                                        {t("navigation.next")}
                                    </Button>
                                </Group>
                            )}

                            {isOnFinalStep && (
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
                                        rightSection={<IconCheck size="1rem" />}
                                        loading={isSubmitting}
                                        disabled={isSubmitting}
                                    >
                                        {submitButtonText || defaultSubmitButtonText}
                                    </Button>
                                </Group>
                            )}
                        </>
                    );
                })()}
            </Card>

            {/* Modal for adding parcels to newly created household */}
            <Modal
                opened={showAddParcelsModal}
                onClose={() => {
                    setShowAddParcelsModal(false);
                    setCreatedHouseholdId(null);
                    // Navigate with success parameters when closing modal
                    const url = new URL("/households", window.location.origin);
                    url.searchParams.set("success", "true");
                    const successMessage =
                        mode === "create" ? t("success.created") : t("success.updated");
                    url.searchParams.set("message", successMessage);
                    url.searchParams.set("title", t("success.title"));
                    router.push(url.pathname + url.search);
                }}
                title={t("addParcels.title")}
                centered
            >
                <Stack gap="md">
                    <Text>{t("addParcels.message")}</Text>
                    <Group justify="flex-end">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowAddParcelsModal(false);
                                setCreatedHouseholdId(null);
                                // Navigate with success parameters when selecting "Later"
                                const url = new URL("/households", window.location.origin);
                                url.searchParams.set("success", "true");
                                const successMessage =
                                    mode === "create" ? t("success.created") : t("success.updated");
                                url.searchParams.set("message", successMessage);
                                url.searchParams.set("title", t("success.title"));
                                router.push(url.pathname + url.search);
                            }}
                        >
                            {t("addParcels.later")}
                        </Button>
                        <Button
                            leftSection={<IconPackage size="1rem" />}
                            onClick={() => {
                                setShowAddParcelsModal(false);
                                setCreatedHouseholdId(null);
                                if (createdHouseholdId) {
                                    // Navigate to parcels page without success params - user will see success there
                                    router.push(`/households/${createdHouseholdId}/parcels`);
                                } else {
                                    // Fallback: navigate to households with success params
                                    const url = new URL("/households", window.location.origin);
                                    url.searchParams.set("success", "true");
                                    const successMessage =
                                        mode === "create"
                                            ? t("success.created")
                                            : t("success.updated");
                                    url.searchParams.set("message", successMessage);
                                    url.searchParams.set("title", t("success.title"));
                                    router.push(url.pathname + url.search);
                                }
                            }}
                        >
                            {t("addParcels.addNow")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}
