import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgreementProtection } from "@/components/AgreementProtection";
import { getHouseholdDetails } from "../actions";
import HouseholdDetailsPage from "./components/HouseholdDetailsPage";
import { HouseholdDetailsPageSkeleton } from "./components/HouseholdDetailsPageSkeleton";
import { AnonymizedHouseholdPage } from "./components/AnonymizedHouseholdPage";
import { getTranslations } from "next-intl/server";
import { getHelloSmsConfig } from "@/app/utils/sms/hello-sms";
import { shouldShowParcelWarning } from "@/app/utils/parcel-warnings";

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

    // Check if anonymized
    if (householdDetails.household.anonymized_at) {
        return {
            title: `Household Removed - ${t("title")}`,
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
    const { testMode } = getHelloSmsConfig();

    if (!householdDetails) {
        notFound();
    }

    // If household is anonymized, show special page
    if (householdDetails.household.anonymized_at) {
        return (
            <AgreementProtection>
                <AnonymizedHouseholdPage anonymizedAt={householdDetails.household.anonymized_at} />
            </AgreementProtection>
        );
    }

    // Check if we should show parcel warning
    const warningData = await shouldShowParcelWarning(id);

    return (
        <AgreementProtection>
            <Suspense fallback={<HouseholdDetailsPageSkeleton />}>
                <HouseholdDetailsPage
                    householdId={id}
                    initialData={householdDetails}
                    testMode={testMode}
                    warningData={warningData}
                />
            </Suspense>
        </AgreementProtection>
    );
}
