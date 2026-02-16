"use client";

import { Stack } from "@mantine/core";
import DietaryRestrictionsForm from "./DietaryRestrictionsForm";
import PetsForm from "./PetsForm";
import AdditionalNeedsForm from "./AdditionalNeedsForm";
import { DietaryRestriction, AdditionalNeed, Pet } from "../types";

interface PreferencesFormProps {
    dietaryRestrictions: DietaryRestriction[];
    updateDietaryRestrictions: (data: DietaryRestriction[]) => void;
    pets: Pet[];
    updatePets: (data: Pet[]) => void;
    additionalNeeds: AdditionalNeed[];
    updateAdditionalNeeds: (data: AdditionalNeed[]) => void;
}

export default function PreferencesForm({
    dietaryRestrictions,
    updateDietaryRestrictions,
    pets,
    updatePets,
    additionalNeeds,
    updateAdditionalNeeds,
}: PreferencesFormProps) {
    return (
        <Stack gap="lg">
            <DietaryRestrictionsForm
                data={dietaryRestrictions}
                updateData={updateDietaryRestrictions}
            />
            <PetsForm data={pets} updateData={updatePets} />
            <AdditionalNeedsForm data={additionalNeeds} updateData={updateAdditionalNeeds} />
        </Stack>
    );
}
