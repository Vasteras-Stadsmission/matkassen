"use client";

import { useState, useEffect } from "react";
import { Container, Title, Text, Box, Loader, Center } from "@mantine/core";
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
    const [households, setHouseholds] = useState<Household[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                Hantera matkassens hushåll och deras information
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
