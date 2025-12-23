"use client";

import { HouseholdWizard } from "@/components/household-wizard/HouseholdWizard";
import { enrollHousehold } from "./actions";
import { FormData, HouseholdCreateData } from "./types";
import { useTranslations } from "next-intl";
import { AuthProtectionClient } from "@/components/AuthProtection/client";

export default function EnrollHouseholdPage() {
    const t = useTranslations("wizard");

    const handleSubmit = async (formData: FormData) => {
        try {
            // Transform FormData to HouseholdCreateData format
            const householdData: HouseholdCreateData = {
                headOfHousehold: {
                    firstName: formData.household.first_name,
                    lastName: formData.household.last_name,
                    phoneNumber: formData.household.phone_number,
                    postalCode: formData.household.postal_code,
                    locale: formData.household.locale,
                },
                smsConsent: formData.household.sms_consent ?? true, // Always true since checkbox is mandatory
                members: formData.members.map(member => ({
                    firstName: member.age.toString(), // Placeholder, real data would have firstName
                    lastName: "", // Placeholder, real data would have lastName
                    age: member.age,
                    sex: member.sex,
                })),
                dietaryRestrictions: formData.dietaryRestrictions,
                additionalNeeds: formData.additionalNeeds,
                pets: formData.pets,
                foodParcels: {
                    pickupLocationId: formData.foodParcels.pickupLocationId,
                    parcels: formData.foodParcels.parcels,
                },
            };

            const result = await enrollHousehold(householdData);
            if (result.success) {
                return {
                    success: true,
                    householdId: result.data.householdId,
                };
            } else {
                return {
                    success: false,
                    error: result.error.message,
                };
            }
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
