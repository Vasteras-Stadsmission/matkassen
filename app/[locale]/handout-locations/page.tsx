import { Suspense } from "react";
import { Skeleton } from "@mantine/core";
import { HandoutLocationsContent } from "./components/HandoutLocationsContent";
import { HandoutLocationsPageLayout } from "./components/HandoutLocationsPageLayout";
import { getLocations } from "./actions";

// This needs to be dynamic to avoid build time issues in CI
export const dynamic = "force-dynamic";

export default async function HandoutLocationsPage() {
    // Fetch locations on the server, once per request (cached by Next.js)
    const locations = await getLocations();

    return (
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
    );
}
