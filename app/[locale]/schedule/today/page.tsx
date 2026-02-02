import { Metadata } from "next";
import { AgreementProtection } from "@/components/AgreementProtection";
import { TodayRedirectPage } from "./components/TodayRedirectPage";

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Today's Handouts",
    };
}

export default function TodaySchedulePage() {
    return (
        <AgreementProtection>
            <TodayRedirectPage />
        </AgreementProtection>
    );
}
