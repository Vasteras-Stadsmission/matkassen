import { Metadata } from "next";
import { AgreementProtection } from "@/components/AgreementProtection";
import { TodayHandoutsPage } from "./components/TodayHandoutsPage";

interface Props {
    params: Promise<{
        locationSlug: string;
        locale: string;
    }>;
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Today's Handouts",
    };
}

export default async function LocationTodayPage({ params }: Props) {
    const { locationSlug } = await params;

    return (
        <AgreementProtection>
            <TodayHandoutsPage locationSlug={locationSlug} />
        </AgreementProtection>
    );
}
