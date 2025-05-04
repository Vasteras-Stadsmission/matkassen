import { Suspense } from "react";
import { PageTransitionSkeleton } from "@/components/PageTransitionSkeleton";
import SchedulePageClient from "./components/SchedulePageClient";
import { AuthProtection } from "@/components/AuthProtection";

export default function SchedulePage() {
    return (
        <AuthProtection>
            <Suspense fallback={<PageTransitionSkeleton />}>
                <SchedulePageClient />
            </Suspense>
        </AuthProtection>
    );
}
