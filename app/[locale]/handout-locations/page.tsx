import { Suspense } from "react";
import { Container, Title, Text, Skeleton } from "@mantine/core";
import { HandoutLocationsContent } from "./components/HandoutLocationsContent";
import { useTranslations } from "next-intl";

export default function HandoutLocationsPage() {
    const t = useTranslations("handoutLocations");

    return (
        <Container size="xl">
            <Title mb="md">{t("pageTitle")}</Title>
            <Text color="dimmed" mb="xl">
                {t("pageDescription")}
            </Text>

            <Suspense
                fallback={
                    <>
                        <Skeleton height={50} mb="md" width="50%" />
                        <Skeleton height={200} mb="md" />
                        <Skeleton height={200} mb="md" />
                    </>
                }
            >
                <HandoutLocationsContent />
            </Suspense>
        </Container>
    );
}
