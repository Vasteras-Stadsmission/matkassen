"use client";

import { useTransition } from "react";
import PageSkeletonOverlay from "@/components/PageSkeletonOverlay";

/**
 * A simple component that wraps the current page and shows a skeleton overlay
 * during navigation. It uses React's useTransition to properly track pending
 * state changes for navigation events.
 */
export default function PageTransitionSkeletonClient() {
    const [isPending] = useTransition();

    return isPending ? <PageSkeletonOverlay /> : null;
}
