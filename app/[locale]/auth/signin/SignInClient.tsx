"use client";

import { Container, Paper, Title, Text, Button, Group, Center, Stack } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { Github } from "@/components/Icons";

export function SignInClient({
    callbackUrl,
    errorType,
}: {
    callbackUrl: string;
    errorType?: string;
}) {
    const t = useTranslations("auth");
    const [isLoading, setIsLoading] = useState(false);

    // Error messages for different error types
    const errorMessages: Record<string, string> = {
        "not-org-member": t("errors.notOrgMember"),
        "invalid-account-provider": t("errors.invalidProvider"),
        "default": t("errors.default"),
    };

    const errorMessage = errorType ? errorMessages[errorType] || errorMessages.default : null;

    // Handle GitHub sign-in
    const handleGitHubSignIn = async () => {
        if (isLoading) return;

        setIsLoading(true);
        try {
            // Using absolute path to make sure we don't have pathname prefixing issues
            await signIn("github", {
                callbackUrl: callbackUrl.startsWith("/") ? callbackUrl : "/",
            });
        } catch (error) {
            console.error("SignIn error:", error);
            setIsLoading(false);
        }
    };

    return (
        <Container size="xs" py="xl">
            <Center className="min-h-[70vh]">
                <Paper radius="md" p="xl" withBorder className="w-full max-w-md">
                    <Stack>
                        <Center mb="md">
                            <Image src="/favicon.svg" alt="Logo" width={50} height={50} priority />
                        </Center>

                        <Title order={2} ta="center" mt="md" mb="md">
                            {t("signInTitle")}
                        </Title>

                        {errorMessage && (
                            <Text c="red" size="sm" ta="center">
                                {errorMessage}
                            </Text>
                        )}

                        <Text c="dimmed" size="sm" ta="center" mb="xl">
                            {t("signInDescription")}
                        </Text>

                        <Group grow mb="md">
                            <Button
                                onClick={handleGitHubSignIn}
                                leftSection={<Github size={16} />}
                                loading={isLoading}
                                disabled={isLoading}
                            >
                                {t("signInWithGitHub")}
                            </Button>
                        </Group>
                    </Stack>
                </Paper>
            </Center>
        </Container>
    );
}
