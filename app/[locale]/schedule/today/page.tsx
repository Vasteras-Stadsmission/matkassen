import { Metadata } from "next";
import { AuthProtection } from "@/components/AuthProtection";
import { TodayHandoutsPage } from "./components/TodayHandoutsPage";

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Today's Handouts",
    };
}

export default function TodaySchedulePage() {
    return (
        <AuthProtection>
            <TodayHandoutsPage />
        </AuthProtection>
    );
}
