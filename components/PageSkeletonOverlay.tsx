"use client";

import { Transition, Skeleton } from "@mantine/core";

/**
 * A skeleton overlay component that's shown during page transitions
 * Uses Mantine's Transition for smooth entry/exit animations
 */
export default function PageSkeletonOverlay() {
    return (
        <Transition mounted={true} transition="fade" duration={150}>
            {styles => (
                <div
                    style={{
                        ...styles,
                        position: "fixed",
                        top: "56px", // Position below the header
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 99, // Below header's z-index
                        backgroundColor: "#fff", // Fully opaque background
                        display: "flex",
                        flexDirection: "column",
                        padding: "2rem",
                        overflow: "hidden",
                    }}
                    className="transition-all"
                >
                    <Skeleton height={200} radius="md" animate={true} mb="md" />
                    <Skeleton height={50} radius="md" animate={true} mb="sm" />
                    <Skeleton height={50} radius="md" animate={true} mb="sm" />
                    <Skeleton height={50} radius="md" animate={true} mb="sm" />
                    <Skeleton height={50} radius="md" animate={true} width="60%" />
                </div>
            )}
        </Transition>
    );
}
