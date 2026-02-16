"use client";

import { Card, SimpleGrid, Divider, Stack, Box } from "@mantine/core";
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
        <Card withBorder p="md" radius="md">
            {/* Desktop: 3 columns with vertical dividers */}
            <Box visibleFrom="sm">
                <SimpleGrid cols={3} spacing="md">
                    <DietaryRestrictionsForm
                        data={dietaryRestrictions}
                        updateData={updateDietaryRestrictions}
                    />
                    <Box style={{ borderLeft: "1px solid var(--mantine-color-gray-2)" }} pl="md">
                        <PetsForm data={pets} updateData={updatePets} />
                    </Box>
                    <Box style={{ borderLeft: "1px solid var(--mantine-color-gray-2)" }} pl="md">
                        <AdditionalNeedsForm
                            data={additionalNeeds}
                            updateData={updateAdditionalNeeds}
                        />
                    </Box>
                </SimpleGrid>
            </Box>

            {/* Mobile: stacked with horizontal dividers */}
            <Box hiddenFrom="sm">
                <Stack gap="md">
                    <DietaryRestrictionsForm
                        data={dietaryRestrictions}
                        updateData={updateDietaryRestrictions}
                    />
                    <Divider />
                    <PetsForm data={pets} updateData={updatePets} />
                    <Divider />
                    <AdditionalNeedsForm
                        data={additionalNeeds}
                        updateData={updateAdditionalNeeds}
                    />
                </Stack>
            </Box>
        </Card>
    );
}
