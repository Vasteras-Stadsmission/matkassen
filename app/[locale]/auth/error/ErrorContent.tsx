"use client";

import { Button, Title, Text, Paper, Container, Center, Stack } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/navigation";
import Image from "next/image";
import { Suspense } from "react";

export interface ErrorContentProps {
    messageKey?: string;
}

function ErrorContentWithSearchParams({ messageKey }: { messageKey?: string }) {
    const searchParams = useSearchParams();
    const errorType = searchParams.get("error") || messageKey;
    const authT = useTranslations("auth");

    // Map Auth.js official error types to translation keys.
    // Reference: https://authjs.dev/guides/pages/error
    //
    // Note: org-membership and 2FA failures are NOT routed through this page —
    // auth.ts redirects them straight to /auth/access-denied?reason=X with rich
    // remediation copy. This page only handles the remaining Auth.js error
    // categories (configuration, verification, invalid-provider, etc.).
    const getErrorMessage = () => {
        switch (errorType?.toLowerCase()) {
            case "invalid-provider":
                return authT("errors.invalidProvider"); // Invalid account provider
            case "configuration":
                return authT("errors.configuration"); // Server configuration problems
            case "verification":
                return authT("errors.verification"); // Email token expired/used
            default:
                return authT("errors.default"); // Catch-all for any unrecognized errors
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
                            <Button component={Link} href="/auth/signin" color="blue" fullWidth>
                                {authT("tryAgain")}
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
