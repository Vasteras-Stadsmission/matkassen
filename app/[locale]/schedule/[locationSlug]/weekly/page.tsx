import { Metadata } from "next";
import { AgreementProtection } from "@/components/AgreementProtection";
import { WeeklySchedulePage } from "./components/WeeklySchedulePage";

interface Props {
    params: Promise<{
        locationSlug: string;
        locale: string;
    }>;
    searchParams: Promise<{ date?: string | string[] }>;
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Weekly Schedule",
    };
}

export default async function LocationWeeklyPage({ params, searchParams }: Props) {
    const { locationSlug } = await params;
    const query = await searchParams;
    const initialDateKey =
        typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
            ? query.date
            : undefined;

    return (
        <AgreementProtection adminOnly>
            <WeeklySchedulePage locationSlug={locationSlug} initialDateKey={initialDateKey} />
        </AgreementProtection>
    );
}
