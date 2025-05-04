import { Suspense } from "react";
import HomePageClient from "./components/HomePageClient";
import { AuthProtection } from "@/components/AuthProtection";

export default function HomePage() {
    return (
        <AuthProtection>
            <Suspense fallback={<div />}>
                <HomePageClient />
            </Suspense>
        </AuthProtection>
    );
}
