import { Suspense } from "react";
import { Container, Title, Text, Center, Loader } from "@mantine/core";
import { useTranslations } from "next-intl";
import HouseholdsPageClient from "./components/HouseholdsPageClient";
import { AuthProtection } from "@/components/AuthProtection";

export default function HouseholdsPage() {
    const t = useTranslations("households");

    return (
        <AuthProtection>
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
                    <HouseholdsPageClient />
                </Suspense>
            </Container>
        </AuthProtection>
    );
}
