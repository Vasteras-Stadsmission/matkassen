import { Suspense } from "react";
import { PageTransitionSkeleton } from "@/components/PageTransitionSkeleton";
import { ScheduleHubPage } from "./components/ScheduleHubPage";
import { AgreementProtection } from "@/components/AgreementProtection";
import { getHelloSmsConfig } from "@/app/utils/sms/hello-sms";
import { auth } from "@/auth";

export default async function SchedulePage() {
    const { testMode } = getHelloSmsConfig();
    // Pass the role so the hub can decide whether to show the first-login
    // welcome banner (only for handout_staff — admins skip it).
    const session = await auth();
    const userRole = session?.user?.role;

    return (
        <AgreementProtection>
            <Suspense fallback={<PageTransitionSkeleton />}>
                <ScheduleHubPage testMode={testMode} userRole={userRole} />
            </Suspense>
        </AgreementProtection>
    );
}
