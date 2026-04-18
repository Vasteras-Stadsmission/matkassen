"use client";

import {
    Container,
    Paper,
    Title,
    Text,
    Button,
    Group,
    Center,
    Stack,
    List,
    ThemeIcon,
} from "@mantine/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { IconCheck } from "@tabler/icons-react";
import { Github } from "@/components/Icons";
import { sanitizeCallbackUrl } from "@/app/utils/auth/sanitize-callback-url";

export function SignInClient({
    callbackUrl,
    organization,
}: {
    callbackUrl: string;
    organization?: string;
}) {
    const t = useTranslations("auth");
    const [isLoading, setIsLoading] = useState(false);

    // Handle GitHub sign-in
    const handleGitHubSignIn = async () => {
        if (isLoading) return;

        setIsLoading(true);
        try {
            // Defense-in-depth: re-sanitize on the client even though the prop
            // was already sanitized server-side in signin/page.tsx.
            const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl);

            await signIn("github", {
                callbackUrl: safeCallbackUrl,
            });
        } catch {
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

                        <Text c="dimmed" size="sm" ta="center">
                            {t("signInDescription")}
                        </Text>

                        <Stack gap="xs" mt="md">
                            <Text size="sm" fw={600}>
                                {t("signInRequirements.title")}
                            </Text>
                            <List spacing="xs" size="sm" center>
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="green"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconCheck size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("signInRequirements.account", {
                                        organization:
                                            organization ||
                                            t("signInRequirements.authorizedOrgFallback"),
                                    })}
                                </List.Item>
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="green"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconCheck size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("signInRequirements.twofa")}
                                </List.Item>
                            </List>
                            <Text size="xs" c="dimmed">
                                {t("signInRequirements.newStaffHint")}
                            </Text>
                        </Stack>

                        <Group grow mt="lg">
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
