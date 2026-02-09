import { Suspense } from "react";
import { Skeleton } from "@mantine/core";
import { HandoutLocationsContent } from "../../handout-locations/components/HandoutLocationsContent";
import { HandoutLocationsPageLayout } from "../../handout-locations/components/HandoutLocationsPageLayout";
import { getLocations } from "../../handout-locations/actions";
import { AgreementProtection } from "@/components/AgreementProtection";

// This needs to be dynamic to avoid build time issues in CI
export const dynamic = "force-dynamic";

export default async function LocationSettingsPage() {
    // Fetch locations on the server, once per request (cached by Next.js)
    const result = await getLocations();

    if (!result.success) {
        throw new Error(result.error.message);
    }

    const locations = result.data;

    return (
        <AgreementProtection>
            <HandoutLocationsPageLayout>
                <Suspense
                    fallback={
                        <>
                            <Skeleton height={50} mb="md" width="50%" />
                            <Skeleton height={200} mb="md" />
                            <Skeleton height={200} mb="md" />
                        </>
                    }
                >
                    {/* Pass the data down as props */}
                    <HandoutLocationsContent initialLocations={locations} />
                </Suspense>
            </HandoutLocationsPageLayout>
        </AgreementProtection>
    );
}
