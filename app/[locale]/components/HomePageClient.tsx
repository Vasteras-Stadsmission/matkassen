"use client";

import { useEffect, Suspense } from "react";
import { useTranslations } from "next-intl";
import { Container, Card, Title, Text } from "@mantine/core";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

// This component safely accesses search params inside a Suspense boundary
function SearchParamsHandler() {
    const searchParams = useSearchParams();
    // You can extract any URL parameters if needed
    return { searchParams };
}

// Component to handle search params with a proper Suspense boundary
function SearchParamsComponent() {
    const { searchParams } = SearchParamsHandler();

    // Use searchParams if needed
    useEffect(() => {
        // Example: Check for query parameters
        const hasParams = searchParams.toString().length > 0;
        if (hasParams) {
            // Handle parameters if needed
            console.log("URL parameters:", Object.fromEntries(searchParams.entries()));
        }
    }, [searchParams]);

    return null;
}

export default function HomePageClient() {
    const t = useTranslations("common");
    const { data: session, status } = useSession();

    return (
        <>
            {/* Wrap the component using useSearchParams in Suspense */}
            <Suspense fallback={null}>
                <SearchParamsComponent />
            </Suspense>

            <Container size="lg" py="xl">
                <Card withBorder shadow="sm" radius="md" p="xl" mb="xl">
                    <Title order={1} mb="md">
                        {t("welcome")}
                    </Title>

                    <Text size="lg" mb="xl">
                        {t("description")}
                    </Text>

                    <Text mb="md">
                        {t("authStatus")}: <strong>{status}</strong>
                    </Text>

                    {session ? (
                        <div>
                            <Text mb="xl">
                                {t("loggedInAs")}:{" "}
                                <strong>{session.user?.name || session.user?.email}</strong>
                            </Text>
                        </div>
                    ) : (
                        <Text>{t("loginToAccess")}</Text>
                    )}
                </Card>
            </Container>
        </>
    );
}
