"use client";

import { useState, useEffect, Suspense } from "react";
import { Box, Text } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import HouseholdsTable, { type Household } from "../components/HouseholdsTable";
import { useActionWithNotification } from "@/app/hooks/useActionWithNotification";

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
