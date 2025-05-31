"use client";

import { Button, Title, Text, Paper, Container, Center, Stack } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/app/i18n/navigation";
import Image from "next/image";
import { Suspense } from "react";

export interface ErrorContentProps {
    messageKey?: string;
}

// Component that uses search params wrapped in Suspense
function ErrorContentWithSearchParams({ messageKey }: { messageKey?: string }) {
    const searchParams = useSearchParams();
    const errorType = searchParams.get("error") || messageKey;
    const t = useTranslations();
    const authT = useTranslations("auth");

    // Map error types to translation keys
    const getErrorMessage = () => {
        switch (errorType) {
            case "not-org-member":
                return authT("errors.notOrgMember");
            case "invalid-account-provider":
                return authT("errors.invalidProvider");
            case "configuration":
                return authT("errors.configuration");
            case "accessdenied":
                return authT("errors.accessDenied");
            case "verification":
                return authT("errors.verification");
            case "general":
                return t("wizard.error.general");
            case "server":
                return t("wizard.error.general");
            default:
                return authT("errors.default");
        }
    };

    return (
        <Container size="xs" py="xl">
            <Center className="min-h-[70vh]">
                <Paper radius="md" p="xl" withBorder className="w-full max-w-md">
                    <Stack>
                        <Center mb="md">
                            <Image src="/favicon.svg" alt="Logo" width={50} height={50} />
                        </Center>

                        <Title order={2} ta="center" mt="md" mb="md">
                            {authT("errorTitle")}
                        </Title>

                        <Text c="red" size="md" ta="center" mb="xl">
                            {getErrorMessage()}
                        </Text>

                        <Stack gap="md">
                            <Button component={Link} href="/auth/signin" color="blue">
                                {authT("tryAgain")}
                            </Button>

                            <Button component={Link} href="/" variant="light">
                                {t("wizard.backToHouseholds")}
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            </Center>
        </Container>
    );
}

export default function ErrorContent({ messageKey }: ErrorContentProps) {
    return (
        <Suspense
            fallback={
                <Container size="xs" py="xl">
                    <Center className="min-h-[70vh]">
                        <Paper radius="md" p="xl" withBorder className="w-full max-w-md">
                            <Stack>
                                <Center mb="md">
                                    <Image src="/favicon.svg" alt="Logo" width={50} height={50} />
                                </Center>
                                <Title order={2} ta="center" mt="md" mb="md">
                                    Loading...
                                </Title>
                            </Stack>
                        </Paper>
                    </Center>
                </Container>
            }
        >
            <ErrorContentWithSearchParams messageKey={messageKey} />
        </Suspense>
    );
}
