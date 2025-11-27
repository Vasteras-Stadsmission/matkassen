"use client";

import { useState, useCallback } from "react";
import { Container, Title, Button, Group, Alert, Card, Loader, Center } from "@mantine/core";
import { IconArrowLeft, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useRouter } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
import FoodParcelsForm from "@/app/[locale]/households/enroll/components/FoodParcelsForm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { ActionResult } from "@/app/utils/auth/action-result";
import { ParcelWarningModal } from "./ParcelWarningModal";

interface ParcelManagementFormProps {
    householdName: string;
    initialData?: FoodParcels;
    onSubmit?: (data: FoodParcels) => Promise<ActionResult<void>>;
    isLoading?: boolean;
    loadError?: string | null;
    warningData?: {
        shouldWarn: boolean;
        parcelCount: number;
        threshold: number | null;
    };
}

interface ValidationError {
    field: string;
    message: string;
    code?: string;
}

export function ParcelManagementForm({
    householdName,
    initialData,
    onSubmit,
    isLoading = false,
    loadError = null,
    warningData,
}: ParcelManagementFormProps) {
    const t = useTranslations("wizard");
    const tParcel = useTranslations("parcelManagement");
    const router = useRouter();
    const [validationError, setValidationError] = useState<ValidationError | null>(null);
    const [validationErrors, setValidationErrors] = useState<
        Array<{ field: string; code: string; message: string; details?: Record<string, unknown> }>
    >([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [warningAcknowledged, setWarningAcknowledged] = useState(false);

    // Initialize form data with defaults
    const [formData, setFormData] = useState<FoodParcels>(
        initialData || {
            pickupLocationId: "",
            parcels: [],
        },
    );

    // Handle form data updates
    const updateFormData = useCallback((data: FoodParcels) => {
        setFormData(data);
        setValidationError(null); // Clear validation errors when data changes
        setValidationErrors([]);
    }, []);

    // Handle warning modal confirmation
    const handleWarningConfirm = useCallback(() => {
        setWarningAcknowledged(true);
        setShowWarningModal(false);
    }, []);

    // Handle form submission
    const handleSubmit = async () => {
        if (isSubmitting) return;

        // Clear previous status
        setValidationError(null);
        setValidationErrors([]);

        // Validate pickup location
        if (!formData.pickupLocationId) {
            setValidationError({
                field: "pickupLocationId",
                message: t("validation.pickupLocation"),
                code: "REQUIRED_FIELD",
            });
            return;
        }

        // Check if we need to show warning modal (only if not already acknowledged this session)
        if (warningData?.shouldWarn && !warningAcknowledged) {
            setShowWarningModal(true);
            return;
        }

        if (!onSubmit) return;

        setIsSubmitting(true);
        try {
            const result = await onSubmit(formData);

            if (result.success) {
                // Show success toast
                notifications.show({
                    title: tParcel("success.title"),
                    message: tParcel("success.parcelsUpdated"),
                    color: "green",
                    icon: <IconCheck size="1rem" />,
                });
                // Navigate to households page
                router.push("/households");
            } else {
                // Handle validation errors
                if (result.error.validationErrors && result.error.validationErrors.length > 0) {
                    setValidationErrors(result.error.validationErrors);

                    // Show error toast
                    notifications.show({
                        title: tParcel("actions.back").includes("Tillbaka")
                            ? "Kunde inte spara"
                            : "Could not save",
                        message: tParcel("actions.back").includes("Tillbaka")
                            ? "Paket kunde inte sparas på grund av valideringsfel"
                            : "Parcels could not be saved due to validation errors",
                        color: "red",
                        icon: <IconAlertCircle size="1rem" />,
                        autoClose: 5000,
                    });

                    // Scroll to first error (food parcels form area)
                    setTimeout(() => {
                        const parcelFormElement = document.querySelector("[data-parcel-form]");
                        if (parcelFormElement) {
                            parcelFormElement.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                            });
                        }
                    }, 100);

                    // Also set a simple error for pickup location if relevant
                    const locationError = result.error.validationErrors.find(
                        err => err.field === "pickupLocationId" || err.field === "capacity",
                    );
                    if (locationError) {
                        setValidationError({
                            field: locationError.field,
                            message: locationError.message,
                            code: locationError.code,
                        });
                    }
                } else {
                    // Show general error toast
                    notifications.show({
                        title: tParcel("error.title"),
                        message: result.error.message || t("error.update"),
                        color: "red",
                        icon: <IconAlertCircle size="1rem" />,
                    });

                    setValidationError({
                        field: "general",
                        message: result.error.message || t("error.update"),
                        code: "SUBMISSION_ERROR",
                    });
                }
            }
        } catch (error) {
            console.error("Unexpected error during parcel update:", error);
            setValidationError({
                field: "general",
                message: t("error.update"),
                code: "UNEXPECTED_ERROR",
            });
        } finally {
            setIsSubmitting(false);
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
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title={t("error.title")}
                    color="red"
                    mb="md"
                >
                    {loadError}
                </Alert>
                <Button onClick={() => router.push("/households")}>
                    {tParcel("actions.back")}
                </Button>
            </Container>
        );
    }

    return (
        <Container size="lg" py="md">
            {/* Warning Modal */}
            {warningData?.shouldWarn && warningData.threshold !== null && (
                <ParcelWarningModal
                    opened={showWarningModal}
                    onClose={() => setShowWarningModal(false)}
                    onConfirm={handleWarningConfirm}
                    parcelCount={warningData.parcelCount}
                    threshold={warningData.threshold}
                    householdName={householdName}
                />
            )}

            {/* Breadcrumb */}
            <Group gap="xs" mb="md">
                <Button variant="subtle" size="sm" onClick={() => router.push("/households")}>
                    {tParcel("actions.back")}
                </Button>
                <span>→</span>
                <Title order={4}>{tParcel("breadcrumb.manageParcels", { householdName })}</Title>
            </Group>

            {/* Main form */}
            <Card withBorder radius="md" p="md">
                <div data-parcel-form>
                    <FoodParcelsForm
                        data={formData}
                        updateData={updateFormData}
                        error={
                            validationError?.field === "pickupLocationId" ? validationError : null
                        }
                        validationErrors={validationErrors}
                    />
                </div>

                {/* Action buttons */}
                <Group justify="center" mt="xl">
                    <Button
                        variant="default"
                        onClick={() => router.push("/households")}
                        leftSection={<IconArrowLeft size="1rem" />}
                    >
                        {t("navigation.back")}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        color="blue"
                        rightSection={<IconCheck size="1rem" />}
                        loading={isSubmitting}
                        disabled={isSubmitting}
                    >
                        {tParcel("actions.saveParcels")}
                    </Button>
                </Group>
            </Card>
        </Container>
    );
}
