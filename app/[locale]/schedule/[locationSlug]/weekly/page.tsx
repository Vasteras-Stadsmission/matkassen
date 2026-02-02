import { Metadata } from "next";
import { AgreementProtection } from "@/components/AgreementProtection";
import { WeeklySchedulePage } from "./components/WeeklySchedulePage";

interface Props {
    params: Promise<{
        locationSlug: string;
        locale: string;
    }>;
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Weekly Schedule",
    };
}

export default async function LocationWeeklyPage({ params }: Props) {
    const { locationSlug } = await params;

    return (
        <AgreementProtection>
            <WeeklySchedulePage locationSlug={locationSlug} />
        </AgreementProtection>
    );
}
