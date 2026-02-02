import { getHouseholdFormData } from "../edit/actions";
import { AgreementProtection } from "@/components/AgreementProtection";
import { ParcelManagementClient } from "./ParcelManagementClient";
import { getTranslations } from "next-intl/server";
import { Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { shouldShowParcelWarning } from "@/app/utils/parcel-warnings";

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
            <AgreementProtection>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title={t("title")}
                    color="red"
                    mt="md"
                >
                    {t("householdNotFound")}
                </Alert>
            </AgreementProtection>
        );
    }

    const householdData = result.data;
    const householdName = `${householdData.household.first_name} ${householdData.household.last_name}`;

    // Check if we should show parcel warning
    const warningData = await shouldShowParcelWarning(householdId);

    return (
        <AgreementProtection>
            <ParcelManagementClient
                householdId={householdId}
                householdName={householdName}
                initialData={householdData.foodParcels}
                warningData={warningData}
            />
        </AgreementProtection>
    );
}
