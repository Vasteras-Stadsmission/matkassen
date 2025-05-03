import { Suspense } from "react";
import { PageTransitionSkeleton } from "@/components/PageTransitionSkeleton";
import SchedulePageClient from "./components/SchedulePageClient";

export default function SchedulePage() {
    return (
        <Suspense fallback={<PageTransitionSkeleton />}>
            <SchedulePageClient />
        </Suspense>
    );
}
