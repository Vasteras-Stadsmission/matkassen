"use client";

import { HouseholdWizard } from "@/components/household-wizard/HouseholdWizard";
import { enrollHousehold } from "./actions";
import { FormData } from "./types";
import { useTranslations } from "next-intl";
import { AuthProtectionClient } from "@/components/AuthProtection/client";

export default function EnrollHouseholdPage() {
    const t = useTranslations("wizard");

    const handleSubmit = async (formData: FormData) => {
        try {
            const result = await enrollHousehold(formData);
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
        <AuthProtectionClient>
            <HouseholdWizard
                mode="create"
                title={t("createHousehold")}
                onSubmit={handleSubmit}
                submitButtonColor="green"
                submitButtonText={t("saveHousehold")}
            />
        </AuthProtectionClient>
    );
}
