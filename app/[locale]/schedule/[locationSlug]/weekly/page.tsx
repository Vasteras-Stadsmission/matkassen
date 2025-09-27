import { Metadata } from "next";
import { AuthProtection } from "@/components/AuthProtection";
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
        <AuthProtection>
            <WeeklySchedulePage locationSlug={locationSlug} />
        </AuthProtection>
    );
}
