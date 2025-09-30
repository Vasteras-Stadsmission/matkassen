"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { Box, Skeleton, Transition, Stack, Container, Grid } from "@mantine/core";
import { usePathname } from "@/app/i18n/navigation";
import { useSearchParams } from "next/navigation";

/**
 * This component safely accesses search params inside a Suspense boundary
 */
function SearchParamsHandler() {
    const searchParams = useSearchParams();
    return { searchParams };
}

/**
 * Props for the PageTransitionSkeleton component
 */
interface PageTransitionSkeletonProps {
    /**
     * When true, the skeleton is always shown regardless of navigation state
     * Useful for Next.js loading states
     */
    alwaysMounted?: boolean;
    /**
     * Optional preset layout to use
     * If not provided, it will be determined by the destination path
     */
    layout?: "default" | "household" | "schedule" | "handout-locations";
    /**
     * Optional custom skeleton content
     * Takes precedence over layout if provided
     */
    children?: React.ReactNode;
}

/**
 * This component renders skeleton placeholders during page transitions
 * to create a more seamless user experience when navigating between pages.
 * It only replaces the main content area below the header.
 *
 * Can be used in two ways:
 * 1. As a page transition skeleton (default) - shows during navigation
 * 2. As a loading state (alwaysMounted=true) - shows always
 */
export function PageTransitionSkeleton({
    alwaysMounted = false,
    layout,
    children,
}: PageTransitionSkeletonProps = {}) {
    const [isNavigating, setIsNavigating] = useState(false);
    const [destinationPath, setDestinationPath] = useState("");
    const pathname = usePathname();

    // Use a component to safely handle searchParams with proper Suspense
    function SearchParamsWrapper() {
        const { searchParams } = SearchParamsHandler();

        // Track navigation based on URL changes
        useEffect(() => {
            // When pathname or searchParams change, navigation has completed
            setIsNavigating(false);
        }, [searchParams]);

        return null;
    }

    // Define the custom event type for navigation events
    interface NavigationStartEvent extends CustomEvent {
        detail: {
            destination: string;
        };
    }

    // Handle navigation start and capture the destination
    const handleNavigationStart = useCallback((event: NavigationStartEvent | Event) => {
        setIsNavigating(true);

        // Try to get destination from custom event
        if (event instanceof CustomEvent && event.detail?.destination) {
            setDestinationPath(event.detail.destination);
        }
    }, []);

    // Custom navigation handler for link clicks to capture destination
    const handleLinkCapture = useCallback(() => {
        // Create a system to detect link clicks and capture destination
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest("a");

            if (link && !link.target && link.href) {
                try {
                    const url = new URL(link.href);
                    if (typeof window !== "undefined" && url.origin === window.location.origin) {
                        const path = url.pathname;
                        if (path !== pathname) {
                            setDestinationPath(path);

                            // Create custom event with path information for other listeners
                            const navEvent = new CustomEvent("navigation-start", {
                                detail: { destination: path },
                            });
                            document.dispatchEvent(navEvent);
                        }
                    }
                } catch (error) {
                    console.error("Error parsing URL", error);
                }
            }
        };

        document.addEventListener("click", handleClick, { capture: true });
        return () => document.removeEventListener("click", handleClick, { capture: true });
    }, [pathname]);

    // Set up event listeners and observers
    useEffect(() => {
        if (alwaysMounted) return; // Skip for loading states

        // Listen for custom navigation events
        document.addEventListener("navigation-start", handleNavigationStart as EventListener);

        // Set up link click capture
        const cleanupLinkCapture = handleLinkCapture();

        // Monitor for DOM changes that might indicate page load completion
        if (typeof window !== "undefined") {
            const observer = new MutationObserver(mutations => {
                // Check if mutations include changes to main content
                const significantChange = mutations.some(
                    mutation =>
                        mutation.target.nodeName === "MAIN" ||
                        (mutation.target instanceof HTMLElement &&
                            mutation.target.id === "main-content") ||
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
                document.removeEventListener(
                    "navigation-start",
                    handleNavigationStart as EventListener,
                );
                cleanupLinkCapture();
            };
        }

        return () => {
            document.removeEventListener(
                "navigation-start",
                handleNavigationStart as EventListener,
            );
            cleanupLinkCapture();
        };
    }, [handleNavigationStart, handleLinkCapture, isNavigating, alwaysMounted]);

    // Auto-hide timeout for safety
    useEffect(() => {
        if (!isNavigating || alwaysMounted) return;

        const timeout = setTimeout(() => {
            setIsNavigating(false);
        }, 2000); // 2 second timeout as failsafe

        return () => clearTimeout(timeout);
    }, [isNavigating, alwaysMounted]);

    // Determine if the skeleton should be displayed
    const isMounted = alwaysMounted || isNavigating;

    // Get the appropriate skeleton layout based on the layout prop or destination path
    const getSkeletonContent = () => {
        // Use custom content if provided
        if (children) {
            return children;
        }

        // Use specified layout if provided
        if (layout) {
            switch (layout) {
                case "household":
                    return <HouseholdPageSkeleton />;
                case "schedule":
                    return <SchedulePageSkeleton />;
                case "handout-locations":
                    return <HandoutLocationsSkeleton />;
                default:
                    return <DefaultPageSkeleton />;
            }
        }

        // Fallback to detecting layout from destination path
        if (destinationPath.includes("/households")) {
            return <HouseholdPageSkeleton />;
        } else if (destinationPath.includes("/schedule")) {
            return <SchedulePageSkeleton />;
        } else if (destinationPath.includes("/handout-locations")) {
            return <HandoutLocationsSkeleton />;
        } else {
            return <DefaultPageSkeleton />;
        }
    };

    return (
        <>
            {/* Wrap the component using searchParams in Suspense */}
            {!alwaysMounted && (
                <Suspense fallback={null}>
                    <SearchParamsWrapper />
                </Suspense>
            )}

            {/* The main skeleton UI */}
            <Transition mounted={isMounted} transition="fade" duration={150}>
                {styles => (
                    <Box
                        style={{
                            ...styles,
                            position: "fixed",
                            top: "56px", // Position below the header height
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "#fff", // Fully opaque
                            display: "block",
                            zIndex: 99, // Below header's z-index
                            overflow: "auto",
                            padding: "1rem",
                        }}
                    >
                        <Container>{getSkeletonContent()}</Container>
                    </Box>
                )}
            </Transition>
        </>
    );
}

// Default page skeleton for general content
function DefaultPageSkeleton() {
    return (
        <Stack mt="lg">
            <Skeleton height={50} width="70%" radius="md" />
            <Skeleton height={20} width="40%" radius="sm" mt="sm" />
            <Skeleton height={400} radius="md" mt="xl" />
            <Skeleton height={200} radius="md" mt="xl" />
        </Stack>
    );
}

// Household page skeleton layout
function HouseholdPageSkeleton() {
    return (
        <Stack mt="lg">
            <Skeleton height={50} width="60%" radius="md" />
            <Skeleton height={30} width="40%" radius="sm" mt="md" />
            <Grid mt="xl">
                {Array(6)
                    .fill(0)
                    .map((_, i) => (
                        <Grid.Col key={i} span={{ base: 12, sm: 6, md: 4 }}>
                            <Skeleton height={180} radius="md" mb="md" />
                        </Grid.Col>
                    ))}
            </Grid>
        </Stack>
    );
}

// Schedule page skeleton layout
function SchedulePageSkeleton() {
    return (
        <Stack mt="lg">
            <Skeleton height={50} width="50%" radius="md" />
            <Box mt="xl">
                <Grid>
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <Skeleton height={40} width="90%" radius="sm" mb="lg" />
                        <Stack>
                            {Array(5)
                                .fill(0)
                                .map((_, i) => (
                                    <Skeleton key={i} height={30} width="90%" radius="sm" />
                                ))}
                        </Stack>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 9 }}>
                        <Skeleton height={500} radius="md" />
                    </Grid.Col>
                </Grid>
            </Box>
        </Stack>
    );
}

// Handout locations page skeleton layout
function HandoutLocationsSkeleton() {
    return (
        <Stack mt="lg">
            <Skeleton height={50} width="60%" radius="md" />
            <Skeleton height={30} width="40%" radius="sm" mt="md" />
            <Grid mt="xl">
                {Array(3)
                    .fill(0)
                    .map((_, i) => (
                        <Grid.Col key={i} span={12}>
                            <Skeleton height={100} radius="md" mb="md" />
                        </Grid.Col>
                    ))}
            </Grid>
            <Skeleton height={300} radius="md" mt="xl" /> {/* Map placeholder */}
        </Stack>
    );
}
