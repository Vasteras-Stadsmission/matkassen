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
    const householdData = await getHouseholdFormData(householdId);

    if (!householdData) {
        return (
            <AuthProtection>
                <div>Household not found</div>
            </AuthProtection>
        );
    }

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
