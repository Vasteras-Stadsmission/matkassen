"use client";

import { Box } from "@mantine/core";
import { Suspense } from "react";
import PageTransitionSkeletonClient from "./components/PageTransitionSkeletonClient";

export function LayoutClient({ children }: { children: React.ReactNode }) {
    return (
        <Box style={{ position: "relative" }}>
            {/* Use Suspense to handle any async components within the children */}
            <Suspense fallback={<PageTransitionSkeletonClient />}>{children}</Suspense>

            {/* Keep this instance for navigation transitions managed by useTransition */}
            <PageTransitionSkeletonClient />
        </Box>
    );
}
