import PageSkeletonOverlay from "@/components/PageSkeletonOverlay";

/**
 * Loading component for the schedule route
 * This will be automatically shown by Next.js while the page is loading
 */
export default function Loading() {
    return <PageSkeletonOverlay />;
}
