"use client";

import { useState, useEffect, Suspense } from "react";
import { Box, Text } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import HouseholdsTable from "../components/HouseholdsTable";
import { useActionWithNotification } from "@/app/hooks/useActionWithNotification";

// Define the Household interface based on the return type of getHouseholds
interface Household {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    postal_code: string;
    created_at: Date;
    firstParcelDate: Date | null;
    lastParcelDate: Date | null;
    nextParcelDate: Date | null;
    nextParcelEarliestTime: Date | null;
}

interface HouseholdsPageClientProps {
    initialHouseholds: Household[];
}

// This component handles the search params and is wrapped in Suspense
function SearchParamsHandler() {
    const searchParams = useSearchParams();
    const { showSuccessFromParams } = useActionWithNotification();
    const householdId = searchParams.get("household-id");

    // Show success notifications from URL parameters
    useEffect(() => {
        showSuccessFromParams(searchParams);
    }, [searchParams, showSuccessFromParams]);

    return { householdId };
}

export default function HouseholdsPageClient({ initialHouseholds }: HouseholdsPageClientProps) {
    const [households] = useState<Household[]>(initialHouseholds);
    const [error] = useState<string | null>(null);
    const [targetHouseholdId, setTargetHouseholdId] = useState<string | null>(null);

    // Get search params through a component wrapped in Suspense
    const SearchParamsComponent = () => {
        const { householdId } = SearchParamsHandler();

        // Set target household ID for opening modal (used for direct links to household details)
        useEffect(() => {
            if (householdId) {
                setTargetHouseholdId(householdId);
            } else {
                setTargetHouseholdId(null);
            }
        }, [householdId]);

        return null;
    };

    return (
        <Box>
            <Suspense fallback={null}>
                <SearchParamsComponent />
            </Suspense>

            {error ? (
                <Text c="red">{error}</Text>
            ) : (
                <HouseholdsTable households={households} targetHouseholdId={targetHouseholdId} />
            )}
        </Box>
    );
}
