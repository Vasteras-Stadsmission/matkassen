"use client";

import { useState, useEffect, Suspense } from "react";
import { Box, Loader, Center, Text } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { IconCheck } from "@tabler/icons-react";
import HouseholdsTable from "../components/HouseholdsTable";
import { getHouseholds } from "../actions";
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

// This component handles the search params and is wrapped in Suspense
function SearchParamsHandler() {
    const searchParams = useSearchParams();
    const success = searchParams.get("success");
    const action = searchParams.get("action");
    const householdName = searchParams.get("householdName");

    return { success, action, householdName };
}

// This component handles the households data
export default function HouseholdsPageClient() {
    const t = useTranslations("households");
    const [households, setHouseholds] = useState<Household[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                // Wait a brief moment before fetching data to avoid React 18 double-mounting issues
                const data = await getHouseholds();
                setHouseholds(data || []);
            } catch (err) {
                console.error("Error fetching households:", err);
                setError(t("errors.createError"));
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [t]);

    return (
        <Box>
            {/* Wrap the component using searchParams in Suspense */}
            <Suspense fallback={null}>
                <SearchParamsComponent />
            </Suspense>

            {loading ? (
                <Center style={{ height: "200px" }}>
                    <Loader size="lg" />
                </Center>
            ) : error ? (
                <Text c="red">{error}</Text>
            ) : (
                <HouseholdsTable households={households} />
            )}
        </Box>
    );
}
