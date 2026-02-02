import { Suspense } from "react";
import { PageTransitionSkeleton } from "@/components/PageTransitionSkeleton";
import { ScheduleHubPage } from "./components/ScheduleHubPage";
import { AgreementProtection } from "@/components/AgreementProtection";
import { getHelloSmsConfig } from "@/app/utils/sms/hello-sms";

export default function SchedulePage() {
    const { testMode } = getHelloSmsConfig();

    return (
        <AgreementProtection>
            <Suspense fallback={<PageTransitionSkeleton />}>
                <ScheduleHubPage testMode={testMode} />
            </Suspense>
        </AgreementProtection>
    );
}
