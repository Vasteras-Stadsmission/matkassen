import { Metadata } from "next";
import { AuthProtection } from "@/components/AuthProtection";
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
        <AuthProtection>
            <TodayHandoutsPage locationSlug={locationSlug} />
        </AuthProtection>
    );
}
