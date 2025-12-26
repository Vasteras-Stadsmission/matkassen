import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Container, Loader, Center } from "@mantine/core";
import { SmsFailuresClient } from "./components/SmsFailuresClient";
import { AuthProtection } from "@/components/AuthProtection";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (await getTranslations({ locale })) as any;
    return {
        title: `${t("smsFailures.title")} - Matkassen`,
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
