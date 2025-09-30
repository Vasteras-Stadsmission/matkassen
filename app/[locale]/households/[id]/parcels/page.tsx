import { getHouseholdFormData } from "../edit/actions";
import { AuthProtection } from "@/components/AuthProtection";
import { ParcelManagementClient } from "./ParcelManagementClient";

interface ParcelManagementPageProps {
    params: Promise<{
        id: string;
        locale: string;
    }>;
}

export default async function ParcelManagementPage({ params }: ParcelManagementPageProps) {
    const { id: householdId } = await params;

    // Get household data for the form
    const result = await getHouseholdFormData(householdId);

    if (!result.success) {
        return (
            <AuthProtection>
                <div>Household not found: {result.error.message}</div>
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
