"use client";

import { useState, useCallback } from "react";
import { Container, Title, Button, Group, Alert, Card, Loader, Center } from "@mantine/core";
import { IconArrowLeft, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { useRouter } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
import FoodParcelsForm from "@/app/[locale]/households/enroll/components/FoodParcelsForm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { useActionWithNotification } from "@/app/hooks/useActionWithNotification";

interface ParcelManagementFormProps {
    householdName: string;
    initialData?: FoodParcels;
    onSubmit?: (data: FoodParcels) => Promise<{ success: boolean; error?: string }>;
    isLoading?: boolean;
    loadError?: string | null;
}

interface ValidationError {
    field: string;
    message: string;
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
    const { handleActionWithRedirect } = useActionWithNotification();
    const [validationError, setValidationError] = useState<ValidationError | null>(null);

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
    }, []);

    // Handle form submission
    const handleSubmit = async () => {
        // Clear previous status
        setValidationError(null);

        // Validate pickup location
        if (!formData.pickupLocationId) {
            setValidationError({
                field: "pickupLocationId",
                message: t("validation.pickupLocation"),
            });
            return;
        }

        if (!onSubmit) return;

        await handleActionWithRedirect(() => onSubmit(formData), "/households", {
            successMessage: tParcel("success.parcelsUpdated"),
            successTitle: tParcel("success.title"),
            errorTitle: t("error.title"),
            errorMessage: t("error.update"),
        });
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
            {/* Breadcrumb */}
            <Group gap="xs" mb="md">
                <Button variant="subtle" size="sm" onClick={() => router.push("/households")}>
                    {t("backToHouseholds")}
                </Button>
                <span>→</span>
                <Title order={4}>Manage Parcels for {householdName}</Title>
            </Group>

            {/* Main form */}
            <Card withBorder radius="md" p="md">
                <FoodParcelsForm
                    data={formData}
                    updateData={updateFormData}
                    error={validationError?.field === "pickupLocationId" ? validationError : null}
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
                    >
                        Save Parcels
                    </Button>
                </Group>
            </Card>
        </Container>
    );
}
