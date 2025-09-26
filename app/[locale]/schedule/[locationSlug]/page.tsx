import { Metadata } from "next";
import { AuthProtection } from "@/components/AuthProtection";
import { LocationLandingPage } from "./components/LocationLandingPage";

interface Props {
    params: Promise<{
        locationSlug: string;
        locale: string;
    }>;
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Schedule",
    };
}

export default async function LocationPage({ params }: Props) {
    const { locationSlug } = await params;

    return (
        <AuthProtection>
            <LocationLandingPage locationSlug={locationSlug} />
        </AuthProtection>
    );
}
