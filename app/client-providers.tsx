"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { SessionProvider } from "next-auth/react";
import { HeaderSimple } from "@/components/HeaderSimple/HeaderSimple";
import { AppShell, Box } from "@mantine/core";
import { Suspense } from "react";
import { PageTransitionSkeleton } from "@/components/PageTransitionSkeleton";
import { SmsBalanceBanner } from "@/components/SmsBalanceBanner";

// This is a specialized component to handle client-side navigation
// related hooks like useSearchParams
export function SearchParamsProvider({ children }: { children: React.ReactNode }) {
    return <Suspense fallback={<PageTransitionSkeleton />}>{children}</Suspense>;
}

// This component wraps the layout with client-side providers
export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <MantineProvider defaultColorScheme="light">
                <ModalsProvider>
                    <Notifications />
                    <AppShell header={{ height: 60 }} padding="md">
                        <AppShell.Header>
                            <HeaderSimple />
                        </AppShell.Header>
                        <AppShell.Main>
                            <SmsBalanceBanner />
                            <Box style={{ position: "relative" }}>
                                <SearchParamsProvider>{children}</SearchParamsProvider>
                            </Box>
                        </AppShell.Main>
                    </AppShell>
                </ModalsProvider>
            </MantineProvider>
        </SessionProvider>
    );
}
