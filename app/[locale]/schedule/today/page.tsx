import { Metadata } from "next";
import { AuthProtection } from "@/components/AuthProtection";
import { TodayRedirectPage } from "./components/TodayRedirectPage";

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Today's Handouts",
    };
}

export default function TodaySchedulePage() {
    return (
        <AuthProtection>
            <TodayRedirectPage />
        </AuthProtection>
    );
}
