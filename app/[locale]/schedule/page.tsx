import { Suspense } from "react";
import { PageTransitionSkeleton } from "@/components/PageTransitionSkeleton";
import { ScheduleHubPage } from "./components/ScheduleHubPage";
import { AuthProtection } from "@/components/AuthProtection";
import { getHelloSmsConfig } from "@/app/utils/sms/hello-sms";

export default async function SchedulePage() {
    const { testMode } = getHelloSmsConfig();

    return (
        <AuthProtection>
            <Suspense fallback={<PageTransitionSkeleton />}>
                <ScheduleHubPage testMode={testMode} />
            </Suspense>
        </AuthProtection>
    );
}
