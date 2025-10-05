import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Container, Loader, Center } from "@mantine/core";
import SmsDashboardClient from "./components/SmsDashboardClient";
import { AuthProtection } from "@/components/AuthProtection";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (await getTranslations({ locale })) as any;
    return {
        title: `${t("admin.smsDashboard.title")} - Matkassen`,
    };
}

export default async function SmsDashboardPage() {
    return (
        <AuthProtection>
            <Container size="xl" py="xl">
                <Suspense
                    fallback={
                        <Center style={{ minHeight: "60vh" }}>
                            <Loader size="lg" />
                        </Center>
                    }
                >
                    <SmsDashboardClient />
                </Suspense>
            </Container>
        </AuthProtection>
    );
}
