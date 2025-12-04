"use client";

import { ParcelManagementForm } from "@/components/ParcelManagementForm/ParcelManagementForm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { updateHouseholdParcels } from "./actions";

interface ParcelManagementClientProps {
    householdId: string;
    householdName: string;
    initialData?: FoodParcels;
    warningData?: {
        shouldWarn: boolean;
        parcelCount: number;
        threshold: number | null;
    };
}

export function ParcelManagementClient({
    householdId,
    householdName,
    initialData,
    warningData,
}: ParcelManagementClientProps) {
    const handleSubmit = async (data: FoodParcels) => {
        return await updateHouseholdParcels(householdId, data);
    };

    return (
        <ParcelManagementForm
            householdName={householdName}
            initialData={initialData}
            onSubmit={handleSubmit}
            warningData={warningData}
        />
    );
}
