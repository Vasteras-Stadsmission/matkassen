"use client";

import { useSearchParams } from "next/navigation";
import { usePathname } from "../../i18n/navigation";
import { useEffect, useState } from "react";
import { Progress, Box } from "@mantine/core";

interface NavigationLoaderProps {
    initialPath?: string;
    color?: string;
    size?: number;
}

export default function NavigationLoader({
    initialPath,
    color = "blue",
    size = 3,
}: NavigationLoaderProps) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [isNavigating, setIsNavigating] = useState(false);
    const [lastPathWithQuery, setLastPathWithQuery] = useState("");
    const [progressValue, setProgressValue] = useState(0);

    useEffect(() => {
        // Create the full path including query parameters
        const query = searchParams.toString();
        const fullPath = query ? `${pathname}?${query}` : pathname;

        // Initialize the last path
        if (!lastPathWithQuery && initialPath) {
            setLastPathWithQuery(initialPath);
            return;
        }

        // Check if path has changed
        if (fullPath !== lastPathWithQuery) {
            // Start progress
            setIsNavigating(true);
            setProgressValue(0);

            // Animate progress
            const interval = setInterval(() => {
                setProgressValue(prev => {
                    if (prev >= 90) {
                        clearInterval(interval);
                        return 90;
                    }
                    return prev + 10;
                });
            }, 50);

            // After a short delay (to simulate navigation), complete the progress
            const timer = setTimeout(() => {
                setProgressValue(100);

                // Small delay to show the completed progress before hiding
                setTimeout(() => {
                    setIsNavigating(false);
                    setLastPathWithQuery(fullPath);
                }, 200);
            }, 300);

            return () => {
                clearInterval(interval);
                clearTimeout(timer);
            };
        }
    }, [pathname, searchParams, lastPathWithQuery, initialPath]);

    if (!isNavigating) return null;

    return (
        <Box style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000 }}>
            <Progress value={progressValue} size={size} color={color} radius={0} animated={true} />
        </Box>
    );
}
