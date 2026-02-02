import { Suspense } from "react";
import IssuesPageClient from "./components/IssuesPageClient";
import { AgreementProtection } from "@/components/AgreementProtection";

export default function HomePage() {
    return (
        <AgreementProtection>
            <Suspense fallback={<div />}>
                <IssuesPageClient />
            </Suspense>
        </AgreementProtection>
    );
}
