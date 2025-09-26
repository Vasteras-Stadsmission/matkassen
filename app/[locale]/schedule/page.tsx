import { Suspense } from "react";
import { PageTransitionSkeleton } from "@/components/PageTransitionSkeleton";
import { ScheduleHubPage } from "./components/ScheduleHubPage";
import { AuthProtection } from "@/components/AuthProtection";

export default function SchedulePage() {
    return (
        <AuthProtection>
            <Suspense fallback={<PageTransitionSkeleton />}>
                <ScheduleHubPage />
            </Suspense>
        </AuthProtection>
    );
}
