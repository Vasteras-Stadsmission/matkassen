"use client";

import { Card, SimpleGrid, Divider, Box } from "@mantine/core";
import DietaryRestrictionsForm from "./DietaryRestrictionsForm";
import PetsForm from "./PetsForm";
import AdditionalNeedsForm from "./AdditionalNeedsForm";
import { DietaryRestriction, AdditionalNeed, Pet } from "../types";
import classes from "./PreferencesForm.module.css";

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
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <DietaryRestrictionsForm
                    data={dietaryRestrictions}
                    updateData={updateDietaryRestrictions}
                />

                <Divider orientation="horizontal" hiddenFrom="sm" />

                <Box className={classes.dividedColumn}>
                    <PetsForm data={pets} updateData={updatePets} />
                </Box>

                <Divider orientation="horizontal" hiddenFrom="sm" />

                <Box className={classes.dividedColumn}>
                    <AdditionalNeedsForm
                        data={additionalNeeds}
                        updateData={updateAdditionalNeeds}
                    />
                </Box>
            </SimpleGrid>
        </Card>
    );
}
