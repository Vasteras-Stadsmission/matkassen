"use client";

import { useState, useEffect } from "react";
import { Group, Title, Text, Loader, Stack, Badge } from "@mantine/core";
import { getPetSpecies } from "../actions";
import CounterInput from "@/components/CounterInput";
import { Pet, PetSpecies } from "../types";
import { useTranslations } from "next-intl";

interface PetsFormProps {
    data: Pet[];
    updateData: (data: Pet[]) => void;
}

export default function PetsForm({ data, updateData }: PetsFormProps) {
    const t = useTranslations("pets");

    const [petTypes, setPetTypes] = useState<PetSpecies[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [petCounts, setPetCounts] = useState<Record<string, number>>({});
    const [speciesNameMap, setSpeciesNameMap] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchPetSpecies = async () => {
            try {
                const species = await getPetSpecies();

                const counts: Record<string, number> = {};
                const names: Record<string, string> = {};

                species.forEach(type => {
                    counts[type.id] = 0;
                    names[type.id] = type.name;
                });

                data.forEach(pet => {
                    counts[pet.species] = pet.count || 0;
                    if (pet.speciesName) {
                        names[pet.species] = pet.speciesName;
                    }
                });

                setPetTypes(species);
                setPetCounts(counts);
                setSpeciesNameMap(names);
            } catch {
                setPetTypes([]);
                setPetCounts({});
                setSpeciesNameMap({});
            } finally {
                setIsLoading(false);
            }
        };

        fetchPetSpecies();
    }, [data]);

    useEffect(() => {
        if (isLoading || data.length === 0) {
            return;
        }

        setPetTypes(prevTypes => {
            const existingIds = new Set(prevTypes.map(type => type.id));
            const missingTypes: PetSpecies[] = [];

            data.forEach(pet => {
                if (!existingIds.has(pet.species)) {
                    missingTypes.push({
                        id: pet.species,
                        name: pet.speciesName || t("unknownPetType"),
                        isActive: false,
                    });
                    existingIds.add(pet.species);
                }
            });

            return missingTypes.length > 0 ? [...prevTypes, ...missingTypes] : prevTypes;
        });
    }, [data, isLoading, t]);

    const updatePetsData = (counts: Record<string, number>) => {
        const petsData: Pet[] = [];

        Object.entries(counts).forEach(([species, count]) => {
            if (count > 0) {
                const existingPet = data.find(pet => pet.species === species);
                const speciesName =
                    speciesNameMap[species] ||
                    petTypes.find(type => type.id === species)?.name ||
                    t("unknownPetType");

                petsData.push({
                    id: existingPet?.id,
                    species,
                    speciesName,
                    count,
                });
            }
        });

        updateData(petsData);
    };

    const setCount = (petTypeId: string, value: number) => {
        const count = Math.max(0, value);
        const currentCount = petCounts[petTypeId] || 0;
        const option = petTypes.find(type => type.id === petTypeId);

        if (option?.isActive === false && count > currentCount) {
            return;
        }

        const updatedCounts = { ...petCounts, [petTypeId]: count };
        setPetCounts(updatedCounts);
        updatePetsData(updatedCounts);
    };

    if (isLoading) {
        return (
            <Stack>
                <Title order={5}>{t("title")}</Title>
                <Group justify="center" py="md">
                    <Loader size="sm" />
                    <Text size="sm">{t("loading")}</Text>
                </Group>
            </Stack>
        );
    }

    return (
        <Stack gap="sm">
            <Title order={5}>{t("title")}</Title>

            <Stack gap="xs">
                {petTypes.map(petType => {
                    const currentCount = petCounts[petType.id] || 0;
                    const isInactive = petType.isActive === false;

                    return (
                        <Group
                            key={petType.id}
                            justify="space-between"
                            gap="xs"
                            style={{
                                borderBottom: "1px solid var(--mantine-color-gray-1)",
                                paddingBottom: "6px",
                            }}
                        >
                            <Group gap="xs">
                                <Text size="sm" fw={500}>
                                    {petType.name}
                                </Text>
                                {isInactive && (
                                    <Badge color="orange" variant="light" size="xs">
                                        {t("disabledLabel")}
                                    </Badge>
                                )}
                            </Group>
                            <CounterInput
                                value={currentCount}
                                onChange={value => setCount(petType.id, value)}
                                min={0}
                                max={99}
                                disabled={isInactive && currentCount === 0}
                                disableIncrement={isInactive}
                                disableDirectInput={isInactive}
                            />
                        </Group>
                    );
                })}
            </Stack>
        </Stack>
    );
}
