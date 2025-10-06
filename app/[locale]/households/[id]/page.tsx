import { notFound } from "next/navigation";
import { AuthProtection } from "@/components/AuthProtection";
import { getHouseholdDetails } from "../actions";
import HouseholdDetailsPage from "./components/HouseholdDetailsPage";
import { getTranslations } from "next-intl/server";

interface HouseholdPageProps {
    params: Promise<{
        id: string;
        locale: string;
    }>;
}

export async function generateMetadata({ params }: HouseholdPageProps) {
    const { id } = await params;
    const householdDetails = await getHouseholdDetails(id);
    const t = await getTranslations("households");

    if (!householdDetails) {
        return {
            title: "Household Not Found",
        };
    }

    const householdName = `${householdDetails.household.first_name} ${householdDetails.household.last_name}`;

    return {
        title: `${householdName} - ${t("title")}`,
    };
}

export default async function HouseholdPage({ params }: HouseholdPageProps) {
    const { id } = await params;
    const householdDetails = await getHouseholdDetails(id);

    if (!householdDetails) {
        notFound();
    }

    return (
        <AuthProtection>
            <HouseholdDetailsPage householdId={id} initialData={householdDetails} />
        </AuthProtection>
    );
}
