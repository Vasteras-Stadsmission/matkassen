import { getHouseholdFormData } from "../edit/actions";
import { AuthProtection } from "@/components/AuthProtection";
import { ParcelManagementClient } from "./ParcelManagementClient";
import { getTranslations } from "next-intl/server";
import { Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

interface ParcelManagementPageProps {
    params: Promise<{
        id: string;
        locale: string;
    }>;
}

export default async function ParcelManagementPage({ params }: ParcelManagementPageProps) {
    const { id: householdId } = await params;
    const t = await getTranslations("parcelManagement.error");

    // Get household data for the form
    const result = await getHouseholdFormData(householdId);

    if (!result.success) {
        return (
            <AuthProtection>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title={t("title")}
                    color="red"
                    mt="md"
                >
                    {t("householdNotFound")}
                </Alert>
            </AuthProtection>
        );
    }

    const householdData = result.data;
    const householdName = `${householdData.household.first_name} ${householdData.household.last_name}`;

    return (
        <AuthProtection>
            <ParcelManagementClient
                householdId={householdId}
                householdName={householdName}
                initialData={householdData.foodParcels}
            />
        </AuthProtection>
    );
}
