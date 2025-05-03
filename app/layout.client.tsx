"use client";

import React, { useEffect } from "react";
import { useRouter } from "@/app/i18n/navigation";
import { enhanceNextNavigation } from "@/components/NavigationUtils";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    useEffect(() => {
        // Enhance router with navigation events
        enhanceNextNavigation(router);
    }, [router]);

    return children;
}
