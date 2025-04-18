import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Box, Loader, Text, Group, Transition } from "@mantine/core";

export function NavigationLoader() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isNavigating, setIsNavigating] = useState(false);
    const [navigationTimeout, setNavigationTimeout] = useState<NodeJS.Timeout | null>(null);

    // Reset navigation state when the URL changes
    useEffect(() => {
        if (isNavigating) {
            setIsNavigating(false);
            if (navigationTimeout) {
                clearTimeout(navigationTimeout);
                setNavigationTimeout(null);
            }
        }
    }, [pathname, searchParams, isNavigating, navigationTimeout]);

    // Listen for navigation start event
    useEffect(() => {
        const handleNavigationStart = () => {
            console.log("Navigation started"); // Debug log
            // Only show loader if navigation takes longer than 100ms
            // This prevents flashing the loader for quick navigations
            const timeout = setTimeout(() => {
                console.log("Setting isNavigating to true"); // Debug log
                setIsNavigating(true);
            }, 100);
            setNavigationTimeout(timeout);
        };

        // Listen for navigation events from Next.js
        document.addEventListener("navigation-start", handleNavigationStart);

        // Try to dispatch a test event to ensure everything is working
        setTimeout(() => {
            console.log("Component mounted, navigation system ready"); // Debug log
        }, 500);

        // Cleanup
        return () => {
            document.removeEventListener("navigation-start", handleNavigationStart);
            if (navigationTimeout) {
                clearTimeout(navigationTimeout);
            }
        };
    }, [navigationTimeout]);

    return (
        <Transition mounted={isNavigating} transition="fade" duration={400}>
            {styles => (
                <Box
                    style={{
                        ...styles,
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(255, 255, 255, 0.7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999, // Increased z-index to ensure it's above everything
                    }}
                >
                    <Group>
                        <Loader color="blue" size="md" />
                        <Text>Laddar sidan...</Text>
                    </Group>
                </Box>
            )}
        </Transition>
    );
}
