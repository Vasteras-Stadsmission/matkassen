import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Container, Loader, Center } from "@mantine/core";
import { SmsFailuresClient } from "./components/SmsFailuresClient";
import { AuthProtection } from "@/components/AuthProtection";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "smsFailures" });
    return {
        title: `${t("title")} - Matkassen`,
    };
}

export default async function SmsFailuresPage() {
    return (
        <AuthProtection>
            <Container size="md" py="xl">
                <Suspense
                    fallback={
                        <Center style={{ minHeight: "60vh" }}>
                            <Loader size="lg" />
                        </Center>
                    }
                >
                    <SmsFailuresClient />
                </Suspense>
            </Container>
        </AuthProtection>
    );
}
