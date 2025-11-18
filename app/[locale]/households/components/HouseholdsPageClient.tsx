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
    postal_code: string | null;
    created_by: string | null;
    firstParcelDate: Date | null;
    lastParcelDate: Date | null;
    nextParcelDate: Date | null;
    nextParcelEarliestTime: Date | null;
}

interface HouseholdsPageClientProps {
    initialHouseholds: Household[];
}

export default function HouseholdsPageClient({ initialHouseholds }: HouseholdsPageClientProps) {
    const [households] = useState<Household[]>(initialHouseholds);
    const [error] = useState<string | null>(null);

    // Show success notifications from URL parameters
    const SearchParamsComponent = () => {
        const searchParams = useSearchParams();
        const { showSuccessFromParams } = useActionWithNotification();

        useEffect(() => {
            showSuccessFromParams(searchParams);
        }, [searchParams, showSuccessFromParams]);

        return null;
    };

    return (
        <Box>
            <Suspense fallback={null}>
                <SearchParamsComponent />
            </Suspense>

            {error ? <Text c="red">{error}</Text> : <HouseholdsTable households={households} />}
        </Box>
    );
}
