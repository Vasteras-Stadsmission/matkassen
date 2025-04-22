"use client";

import { useState, useEffect } from "react";
import HouseholdWizard from "@/components/household-wizard/HouseholdWizard";
import { getHouseholdFormData, updateHousehold } from "./actions";
import { FormData } from "../../enroll/types";

export default function EditHouseholdClient({ id }: { id: string }) {
    const [initialData, setInitialData] = useState<FormData | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Load household data when the component mounts
    useEffect(() => {
        async function loadHouseholdData() {
            try {
                setLoading(true);
                const data = await getHouseholdFormData(id);

                if (data) {
                    setInitialData(data);
                } else {
                    setLoadError("Kunde inte hitta hushållet. Kontrollera att ID är korrekt.");
                }
            } catch (error) {
                console.error("Error loading household data:", error);
                setLoadError("Ett fel uppstod vid laddning av hushållsinformation.");
            } finally {
                setLoading(false);
            }
        }

        loadHouseholdData();
    }, [id]);

    const handleSubmit = async (formData: FormData) => {
        try {
            const result = await updateHousehold(id, formData);
            console.log("Update result:", result); // Add logging to help debug
            return {
                success: result.success,
                error: result.error,
            };
        } catch (error) {
            console.error("Error in handleSubmit:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error occurred",
            };
        }
    };

    // Build the title based on the loaded data
    const title = initialData
        ? `Redigera hushåll: ${initialData.household.first_name} ${initialData.household.last_name}`
        : "Redigera hushåll";

    return (
        <HouseholdWizard
            mode="edit"
            title={title}
            initialData={initialData}
            householdId={id}
            onSubmit={handleSubmit}
            isLoading={loading}
            loadError={loadError}
            submitButtonColor="yellow"
            submitButtonText="Uppdatera hushåll"
        />
    );
}
