"use client";

import { AppShell, MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import { NavigationLoader } from "@/components/NavigationLoader";
import { useRouter } from "next/navigation";
import { enhanceNextNavigation } from "@/components/NavigationUtils";
import { SessionProvider } from "next-auth/react";
import { HeaderSimple } from "@/components/HeaderSimple/HeaderSimple";
import { useEffect, Suspense } from "react";
// Import dayjs and the Swedish locale
import dayjs from "dayjs";
import "dayjs/locale/sv";

// Register the Swedish locale
dayjs.locale("sv");

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
                <Notifications position="top-right" zIndex={1000} />
                <DatesProvider
                    settings={{
                        locale: "sv",
                        timezone: "Europe/Stockholm",
                        firstDayOfWeek: 1, // Monday as first day of week (0 is Sunday, 1 is Monday)
                    }}
                >
                    <NavigationLoader />
                    <AppShell header={{ height: 60 }} padding="md">
                        <AppShell.Header>
                            <HeaderSimple />
                        </AppShell.Header>
                        <AppShell.Main>{children}</AppShell.Main>
                    </AppShell>
                </DatesProvider>
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
