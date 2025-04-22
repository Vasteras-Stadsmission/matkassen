"use client";

import HouseholdWizard from "@/components/household-wizard/HouseholdWizard";
import { enrollHousehold } from "./actions";
import { FormData } from "./types";

export default function EnrollHouseholdPage() {
    const handleSubmit = async (formData: FormData) => {
        const result = await enrollHousehold(formData);
        return {
            success: result.success,
            error: result.error,
        };
    };

    return (
        <HouseholdWizard
            mode="create"
            title="Registrera nytt hushåll"
            onSubmit={handleSubmit}
            submitButtonColor="green"
            submitButtonText="Spara hushåll"
        />
    );
}
