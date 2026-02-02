import { Suspense } from "react";
import { Container, Title, Text, Center, Loader } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import HouseholdsPageClient from "./components/HouseholdsPageClient";
import { AgreementProtection } from "@/components/AgreementProtection";
import { getHouseholds } from "./actions";

export default async function HouseholdsPage() {
    const t = await getTranslations("households");

    const households = await getHouseholds();

    return (
        <AgreementProtection>
            <Container size="xl" py="xl">
                <Title order={2} mb="xs">
                    {t("title")}
                </Title>
                <Text c="dimmed" mb="xl">
                    {t("description")}
                </Text>

                <Suspense
                    fallback={
                        <Center style={{ height: "200px" }}>
                            <Loader size="lg" />
                        </Center>
                    }
                >
                    <HouseholdsPageClient initialHouseholds={households} />
                </Suspense>
            </Container>
        </AgreementProtection>
    );
}
