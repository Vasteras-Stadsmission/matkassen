"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Loader, Transition } from "@mantine/core";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationLoader() {
    const [isNavigating, setIsNavigating] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Track navigation based on URL changes
    useEffect(() => {
        // When pathname or searchParams change, navigation has completed
        setIsNavigating(false);
    }, [pathname, searchParams]);

    // Event listener for navigation start
    const handleNavigationStart = useCallback(() => {
        setIsNavigating(true);
    }, []);

    useEffect(() => {
        // Listen for custom navigation events
        document.addEventListener("navigation-start", handleNavigationStart);

        // Create a more reliable way to detect Next.js navigation end
        if (typeof window !== "undefined") {
            // Monitor for DOM changes that might indicate page load completion
            const observer = new MutationObserver(mutations => {
                // Check if mutations include changes to main content
                const significantChange = mutations.some(
                    mutation =>
                        mutation.target.nodeName === "MAIN" ||
                        (mutation.target instanceof HTMLElement && mutation.target.id === "main-content") ||
                        mutation.addedNodes.length > 3,
                );

                if (significantChange && isNavigating) {
                    // Important DOM changes usually indicate navigation has completed
                    setIsNavigating(false);
                }
            });

            // Observe the main content area for changes
            const mainElement = document.querySelector("main");
            if (mainElement) {
                observer.observe(mainElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                });
            }

            return () => {
                observer.disconnect();
                document.removeEventListener("navigation-start", handleNavigationStart);
            };
        }

        return () => {
            document.removeEventListener("navigation-start", handleNavigationStart);
        };
    }, [handleNavigationStart, isNavigating]);

    // Shorter auto-hide timeout (1.5 seconds instead of 3)
    useEffect(() => {
        if (!isNavigating) return;

        const timeout = setTimeout(() => {
            setIsNavigating(false);
        }, 1500); // 1.5 second timeout is usually enough

        return () => clearTimeout(timeout);
    }, [isNavigating]);

    return (
        <Transition mounted={isNavigating} transition="fade" duration={200}>
            {styles => (
                <Box
                    style={{
                        ...styles,
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(255, 255, 255, 0.75)",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        pointerEvents: "all",
                    }}
                >
                    <Loader size="xl" variant="dots" color="blue" />
                </Box>
            )}
        </Transition>
    );
}
