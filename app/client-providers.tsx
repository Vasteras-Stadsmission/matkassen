"use client";

import { AppShell, MantineProvider } from "@mantine/core";
import { NavigationLoader } from "@/components/NavigationLoader";
import { useRouter } from "next/navigation";
import { enhanceNextNavigation } from "@/components/NavigationUtils";
import { SessionProvider } from "next-auth/react";
import { HeaderSimple } from "@/components/HeaderSimple/HeaderSimple";
import { useEffect, Suspense } from "react";

// This component uses router and should be wrapped in Suspense
function ClientProvidersContent({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    useEffect(() => {
        // Enhance router with navigation events
        enhanceNextNavigation(router);

        // Set up prefetching for common navigation targets
        const prefetchCommonPages = () => {
            // Prefetch main navigation targets
            router.prefetch("/recipients");
            router.prefetch("/schedule");
            router.prefetch("/handout-locations");
            router.prefetch("/create-recipient");
        };

        // Run prefetching after a short delay to not block initial page load
        const timer = setTimeout(prefetchCommonPages, 2000);

        return () => clearTimeout(timer);
    }, [router]);

    return (
        <SessionProvider>
            <MantineProvider forceColorScheme="light">
                <NavigationLoader />
                <AppShell header={{ height: 60 }} padding="md">
                    <AppShell.Header>
                        <HeaderSimple />
                    </AppShell.Header>
                    <AppShell.Main>{children}</AppShell.Main>
                </AppShell>
            </MantineProvider>
        </SessionProvider>
    );
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<div>Loading application...</div>}>
            <ClientProvidersContent>{children}</ClientProvidersContent>
        </Suspense>
    );
}
