"use client";

import { useEffect } from "react";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps, AppShell } from "@mantine/core";
import { HeaderSimple } from "@/components/HeaderSimple/HeaderSimple";
import { SessionProvider } from "next-auth/react";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" {...mantineHtmlProps}>
            <head>
                <ColorSchemeScript />
                {/* Disable automatic preloading of fonts and CSS that might not be used immediately */}
                <meta name="next-font-preconnect" content="false" />
                <meta name="next-size-adjust" content="false" />
            </head>
            <body>
                <SessionProvider>
                    <MantineProvider>
                        <AppShell header={{ height: 60 }} padding="md">
                            <AppShell.Header>
                                <HeaderSimple />
                            </AppShell.Header>
                            <AppShell.Main>{children}</AppShell.Main>
                        </AppShell>
                    </MantineProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
