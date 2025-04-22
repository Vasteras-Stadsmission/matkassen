"use client";

import { useState, useEffect } from "react";
import { Container, Title, Text, Box, Loader, Center } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { IconCheck } from "@tabler/icons-react";
import HouseholdsTable from "./components/HouseholdsTable";
import { getHouseholds } from "./actions";

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

export default function HouseholdsPage() {
    const searchParams = useSearchParams();
    const success = searchParams.get("success");
    const action = searchParams.get("action");
    const householdName = searchParams.get("householdName");

    const [households, setHouseholds] = useState<Household[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Show success notification when redirected with success parameters
    useEffect(() => {
        if (success === "true" && householdName) {
            // Small delay to ensure the notifications system is fully initialized
            setTimeout(() => {
                const message =
                    action === "create"
                        ? `Nytt hushåll "${householdName}" har registrerats!`
                        : `Hushållet "${householdName}" har uppdaterats!`;

                notifications.show({
                    id: "household-success",
                    title: "Klart!",
                    message,
                    color: "green",
                    icon: <IconCheck size="1.1rem" />,
                    autoClose: 5000,
                });
            }, 100);
        }
    }, [success, action, householdName]);

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                // Wait a brief moment before fetching data to avoid React 18 double-mounting issues
                const data = await getHouseholds();
                setHouseholds(data || []);
            } catch (err) {
                console.error("Error fetching households:", err);
                setError("Failed to load households data. Please try refreshing the page.");
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="xs">
                Hushåll
            </Title>
            <Text c="dimmed" mb="xl">
                Hantera hushåll och deras information
            </Text>
            <Box>
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
        </Container>
    );
}
