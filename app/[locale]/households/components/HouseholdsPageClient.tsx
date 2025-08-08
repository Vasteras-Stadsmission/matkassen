"use client";

import { useState, useEffect, Suspense } from "react";
import { Box, Text } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { IconCheck } from "@tabler/icons-react";
import HouseholdsTable from "../components/HouseholdsTable";
import { useTranslations } from "next-intl";

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
    const success = searchParams.get("success");
    const action = searchParams.get("action");
    const householdName = searchParams.get("householdName");

    return { success, action, householdName };
}

export default function HouseholdsPageClient({ initialHouseholds }: HouseholdsPageClientProps) {
    const t = useTranslations("households");
    const [households] = useState<Household[]>(initialHouseholds);
    const [error] = useState<string | null>(null);

    // Get search params through a component wrapped in Suspense
    const SearchParamsComponent = () => {
        const { success, action, householdName } = SearchParamsHandler();

        // Show success notification when redirected with success parameters
        useEffect(() => {
            if (success === "true" && householdName) {
                // Small delay to ensure the notifications system is fully initialized
                setTimeout(() => {
                    const message = action === "create" ? t("newHousehold") : t("updatedHousehold");

                    notifications.show({
                        id: "household-success",
                        title: t("title"),
                        message,
                        color: "green",
                        icon: <IconCheck size="1.1rem" />,
                        autoClose: 5000,
                    });
                }, 100);
            }
        }, [success, action, householdName]);

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
