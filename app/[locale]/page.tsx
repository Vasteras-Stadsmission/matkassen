import { Suspense } from "react";
import IssuesPageClient from "./components/IssuesPageClient";
import { AgreementProtection } from "@/components/AgreementProtection";
import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function HomePage() {
    const session = await auth();
    if (session?.user?.role === "handout_staff") {
        const locale = await getLocale();
        redirect({ href: "/schedule", locale });
    }

    return (
        <AgreementProtection adminOnly>
            <Suspense fallback={<div />}>
                <IssuesPageClient />
            </Suspense>
        </AgreementProtection>
    );
}
