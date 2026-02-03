"use client";

import {
    Button,
    Title,
    Text,
    Paper,
    Container,
    Center,
    Stack,
    List,
    ThemeIcon,
    Alert,
    Divider,
    Anchor,
} from "@mantine/core";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { signOut } from "next-auth/react";
import {
    IconAlertCircle,
    IconX,
    IconExternalLink,
    IconShieldCheck,
    IconDeviceMobile,
    IconFingerprint,
    IconKey,
    IconLogout,
} from "@tabler/icons-react";

const GITHUB_SECURITY_URL = "https://github.com/settings/security";

export default function AccessDeniedContent() {
    const t = useTranslations("auth");

    const handleSignOutAndRetry = async () => {
        await signOut({ callbackUrl: "/auth/signin" });
    };

    return (
        <Container size="sm" py="xl">
            <Center className="min-h-[70vh]">
                <Paper
                    radius="md"
                    p="xl"
                    withBorder
                    className="w-full max-w-lg"
                    component="main"
                    aria-labelledby="access-denied-title"
                >
                    <Stack gap="lg">
                        {/* Logo */}
                        <Center>
                            <Image
                                src="/favicon.svg"
                                alt="Matcentralen"
                                width={50}
                                height={50}
                                priority
                            />
                        </Center>

                        {/* Title - h1 for proper hierarchy */}
                        <Title id="access-denied-title" order={1} size="h2" ta="center" c="red.8">
                            {t("accessDenied.title")}
                        </Title>

                        {/* Subtitle / Explanation */}
                        <Alert
                            icon={<IconAlertCircle size={20} />}
                            color="blue"
                            variant="light"
                        >
                            {t("accessDenied.subtitle")}
                        </Alert>

                        {/* Why am I seeing this? */}
                        <Stack gap="xs">
                            <Title order={2} size="sm" fw={600}>
                                {t("accessDenied.reasons.title")}
                            </Title>
                            <Text size="sm" c="dimmed" mb="xs">
                                {t("accessDenied.reasons.preamble")}
                            </Text>
                            <List spacing="xs" size="sm">
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="red"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconX size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("accessDenied.reasons.notMember")}
                                </List.Item>
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="red"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconX size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("accessDenied.reasons.insecure2fa")}
                                </List.Item>
                            </List>
                        </Stack>

                        <Divider />

                        {/* Accepted 2FA Methods */}
                        <Stack gap="xs">
                            <Title order={2} size="sm" fw={600}>
                                {t("accessDenied.acceptedMethods.title")}
                            </Title>
                            <List spacing="xs" size="sm">
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="green"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconShieldCheck size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("accessDenied.acceptedMethods.authenticatorApp")}
                                </List.Item>
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="green"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconFingerprint size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("accessDenied.acceptedMethods.passkey")}
                                </List.Item>
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="green"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconKey size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("accessDenied.acceptedMethods.securityKey")}
                                </List.Item>
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="green"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconDeviceMobile size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("accessDenied.acceptedMethods.githubMobile")}
                                </List.Item>
                            </List>
                        </Stack>

                        {/* Not Accepted */}
                        <Stack gap="xs">
                            <Title order={2} size="sm" fw={600} c="red.8">
                                {t("accessDenied.notAccepted.title")}
                            </Title>
                            <List spacing="xs" size="sm">
                                <List.Item
                                    icon={
                                        <ThemeIcon
                                            color="red"
                                            size={20}
                                            radius="xl"
                                            variant="light"
                                        >
                                            <IconX size={14} aria-hidden="true" />
                                        </ThemeIcon>
                                    }
                                >
                                    {t("accessDenied.notAccepted.sms")}
                                </List.Item>
                            </List>
                        </Stack>

                        <Divider />

                        {/* How to Fix */}
                        <Stack gap="xs">
                            <Title order={2} size="sm" fw={600}>
                                {t("accessDenied.howToFix.title")}
                            </Title>
                            <List type="ordered" spacing="xs" size="sm">
                                <List.Item>
                                    <Anchor
                                        href={GITHUB_SECURITY_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={t("accessDenied.howToFix.step1Aria")}
                                    >
                                        {t("accessDenied.howToFix.step1")}
                                        <IconExternalLink
                                            size={14}
                                            style={{ marginLeft: 4, verticalAlign: "middle" }}
                                            aria-hidden="true"
                                        />
                                    </Anchor>
                                </List.Item>
                                <List.Item>{t("accessDenied.howToFix.step2")}</List.Item>
                                <List.Item>{t("accessDenied.howToFix.step3")}</List.Item>
                                <List.Item>{t("accessDenied.howToFix.step4")}</List.Item>
                            </List>
                        </Stack>

                        {/* Action Buttons */}
                        <Stack gap="sm" mt="md">
                            <Button
                                component="a"
                                href={GITHUB_SECURITY_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                leftSection={<IconExternalLink size={16} aria-hidden="true" />}
                                variant="filled"
                                fullWidth
                                aria-label={t("accessDenied.buttons.githubSettingsAria")}
                            >
                                {t("accessDenied.buttons.githubSettings")}
                            </Button>
                            <Button
                                onClick={handleSignOutAndRetry}
                                leftSection={<IconLogout size={16} aria-hidden="true" />}
                                variant="light"
                                fullWidth
                            >
                                {t("accessDenied.buttons.signOutAndRetry")}
                            </Button>
                        </Stack>

                        {/* Support info */}
                        <Text size="xs" c="dimmed" ta="center">
                            {t("accessDenied.support")}
                        </Text>
                    </Stack>
                </Paper>
            </Center>
        </Container>
    );
}
