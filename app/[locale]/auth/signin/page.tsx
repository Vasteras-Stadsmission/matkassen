"use client";

import { Container, Paper, Title, Text, Button, Group, Center, Stack } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import Image from "next/image";
import { Github } from "@/components/Icons";
import { useSearchParams } from "next/navigation";
import { useRouter as useI18nRouter } from "@/app/i18n/navigation";

export default function SignInPage() {
    const t = useTranslations("auth");
    const searchParams = useSearchParams();
    const router = useI18nRouter();
    const { status } = useSession();
    const [isLoading, setIsLoading] = useState(false);

    // Get the callback URL from the search params or use the root path
    const callbackUrl = searchParams.get("callbackUrl") || "/";
    const errorType = searchParams.get("error");

    // Error messages for different error types
    const errorMessages: Record<string, string> = {
        "not-org-member": t("errors.notOrgMember"),
        "invalid-account-provider": t("errors.invalidProvider"),
        "default": t("errors.default"),
    };

    const errorMessage = errorType ? errorMessages[errorType] || errorMessages.default : null;

    // Handle redirection if authenticated using useEffect
    useEffect(() => {
        if (status === "authenticated") {
            router.push(callbackUrl);
        }
    }, [status, callbackUrl, router]);

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

    // Don't render anything if we're redirecting after authentication
    if (status === "authenticated") {
        return (
            <Center className="min-h-screen">
                <Text>Redirecting...</Text>
            </Center>
        );
    }

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
                                loading={isLoading || status === "loading"}
                                disabled={isLoading || status === "loading"}
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
