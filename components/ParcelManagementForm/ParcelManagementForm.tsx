"use client";

import { useState, useCallback } from "react";
import { Container, Title, Button, Group, Alert, Card, Loader, Center } from "@mantine/core";
import { IconArrowLeft, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { useRouter } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
import FoodParcelsForm from "@/app/[locale]/households/enroll/components/FoodParcelsForm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";

interface ParcelManagementFormProps {
    householdName: string;
    initialData?: FoodParcels;
    onSubmit?: (data: FoodParcels) => Promise<{
        success: boolean;
        error?: string;
        validationErrors?: Array<{
            field: string;
            code: string;
            message: string;
            details?: Record<string, unknown>;
        }>;
    }>;
    isLoading?: boolean;
    loadError?: string | null;
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
}: ParcelManagementFormProps) {
    const t = useTranslations("wizard");
    const tParcel = useTranslations("parcelManagement");
    const router = useRouter();
    const [validationError, setValidationError] = useState<ValidationError | null>(null);
    const [validationErrors, setValidationErrors] = useState<
        Array<{ field: string; code: string; message: string; details?: Record<string, unknown> }>
    >([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

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

        if (!onSubmit) return;

        setIsSubmitting(true);
        try {
            const result = await onSubmit(formData);

            if (result.success) {
                // Navigate to households page with success message
                router.push("/households");
                // Show success notification here if needed
            } else {
                // Handle validation errors
                if (result.validationErrors && result.validationErrors.length > 0) {
                    setValidationErrors(result.validationErrors);
                    // Also set a simple error for pickup location if relevant
                    const locationError = result.validationErrors.find(
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
                    setValidationError({
                        field: "general",
                        message: result.error || t("error.update"),
                        code: "SUBMISSION_ERROR",
                    });
                }
            }
        } catch {
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
                <FoodParcelsForm
                    data={formData}
                    updateData={updateFormData}
                    error={validationError?.field === "pickupLocationId" ? validationError : null}
                    validationErrors={validationErrors}
                />

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
