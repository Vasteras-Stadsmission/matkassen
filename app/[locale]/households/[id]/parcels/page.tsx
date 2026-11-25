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

    return (
        <AgreementProtection adminOnly>
            <ParcelManagement householdId={householdId} />
        </AgreementProtection>
    );
}

// Fetches inside AgreementProtection, so it runs only after the admin and
// agreement checks pass: handout staff and users who haven't accepted the
// agreement are redirected before any household data is loaded.
async function ParcelManagement({ householdId }: { householdId: string }) {
    const t = await getTranslations("parcelManagement.error");

    // Get household data for the form
    const result = await getHouseholdFormData(householdId);

    if (!result.success) {
        return (
            <Alert icon={<IconAlertCircle size="1rem" />} title={t("title")} color="red" mt="md">
                {t("householdNotFound")}
            </Alert>
        );
    }

    const householdData = result.data;
    const householdName = `${householdData.household.first_name} ${householdData.household.last_name}`;

    // Check if we should show parcel warning
    const warningData = await shouldShowParcelWarning(householdId);

    return (
        <ParcelManagementClient
            householdId={householdId}
            householdName={householdName}
            initialData={householdData.foodParcels}
            warningData={warningData}
        />
    );
}
