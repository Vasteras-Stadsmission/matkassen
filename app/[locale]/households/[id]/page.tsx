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
    const t = await getTranslations("households");

    // Metadata runs alongside the page, outside AgreementProtection, so the fetch
    // is refused for a user the guard is about to redirect. Fall back to a generic
    // title: the page repeats the fetch behind the guard, so a real error still
    // surfaces there.
    const householdDetails = await getHouseholdDetails(id).catch(() => undefined);

    if (householdDetails === undefined) {
        return {
            title: t("title"),
        };
    }

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

    return (
        <AgreementProtection>
            <HouseholdDetails id={id} />
        </AgreementProtection>
    );
}

// Fetches inside AgreementProtection, so it runs only after the sign-in and
// agreement checks pass: a user who hasn't accepted the agreement is redirected,
// not shown an error.
async function HouseholdDetails({ id }: { id: string }) {
    const householdDetails = await getHouseholdDetails(id);

    if (!householdDetails) {
        notFound();
    }

    // If household is anonymized, show special page
    if (householdDetails.household.anonymized_at) {
        return (
            <AgreementProtection adminOnly>
                <AnonymizedHouseholdPage anonymizedAt={householdDetails.household.anonymized_at} />
            </AgreementProtection>
        );
    }

    const { testMode } = getHelloSmsConfig();
    // Check if we should show parcel warning
    const warningData = await shouldShowParcelWarning(id);

    return (
        <Suspense fallback={<HouseholdDetailsPageSkeleton />}>
            <HouseholdDetailsPage
                householdId={id}
                initialData={householdDetails}
                testMode={testMode}
                warningData={warningData}
            />
        </Suspense>
    );
}
