import { Suspense } from "react";
import IssuesPageClient from "./components/IssuesPageClient";
import { AuthProtection } from "@/components/AuthProtection";

export default function HomePage() {
    return (
        <AuthProtection>
            <Suspense fallback={<div />}>
                <IssuesPageClient />
            </Suspense>
        </AuthProtection>
    );
}
