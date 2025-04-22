"use client";

import HouseholdWizard from "@/components/household-wizard/HouseholdWizard";
import { enrollHousehold } from "./actions";
import { FormData } from "./types";

export default function EnrollHouseholdPage() {
    const handleSubmit = async (formData: FormData) => {
        try {
            const result = await enrollHousehold(formData);
            console.log("Enrollment result:", result); // Add logging to help debug
            return {
                success: result.success,
                error: result.error,
            };
        } catch (error) {
            console.error("Error in enrollment handleSubmit:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error occurred",
            };
        }
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
