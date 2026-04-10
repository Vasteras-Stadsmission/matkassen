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
import { Link } from "@/app/i18n/navigation";
import Image from "next/image";
import { signOut } from "next-auth/react";
import {
    IconAlertCircle,
    IconX,
    IconExternalLink,
    IconShieldCheck,
    IconDeviceMobile,
    IconFingerprint,
    IconLogout,
    IconMailForward,
    IconArrowLeft,
} from "@tabler/icons-react";

const GITHUB_SECURITY_URL = "https://github.com/settings/security";

type DenialReason =
    | "not_member"
    | "membership_inactive"
    | "org_resource_forbidden"
    | "unauthenticated"
    | "rate_limited"
    | "github_error"
    | "admin_required";

function isDenialReason(value: string | undefined): value is DenialReason {
    return [
        "not_member",
        "membership_inactive",
        "org_resource_forbidden",
        "unauthenticated",
        "rate_limited",
        "github_error",
        "admin_required",
    ].includes(value ?? "");
}

export default function AccessDeniedContent({
    reason,
    organization,
}: {
    reason?: string;
    organization?: string;
}) {
    const t = useTranslations("auth");
    const denialReason = isDenialReason(reason) ? reason : undefined;

    const handleSignOutAndRetry = async () => {
        await signOut({ callbackUrl: "/auth/signin" });
    };

    const is2faIssue = denialReason === "org_resource_forbidden";
    const isMembershipIssue =
        denialReason === "not_member" || denialReason === "membership_inactive";
    const isTransientError = denialReason === "rate_limited" || denialReason === "github_error";
    const isUnauthenticated = denialReason === "unauthenticated";
    const isAdminRequired = denialReason === "admin_required";

    // Only show org-specific text/links when the org is configured. Falls back
    // gracefully if GITHUB_ORG is unset (e.g. in a misconfigured environment).
    const hasOrganization = !!organization;
    const invitationsUrl = hasOrganization
        ? `https://github.com/orgs/${encodeURIComponent(organization)}/invitation`
        : undefined;

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

                        {/* Title — admin_required uses a calmer color since it's a
                            wrong-role informational screen, not an actual auth denial */}
                        <Title
                            id="access-denied-title"
                            order={1}
                            size="h2"
                            ta="center"
                            c={isAdminRequired ? "orange.8" : "red.8"}
                        >
                            {isAdminRequired
                                ? t("accessDenied.adminRequired.title")
                                : t("accessDenied.title")}
                        </Title>

                        {/* Targeted explanation based on reason */}
                        <Alert icon={<IconAlertCircle size={20} />} color="blue" variant="light">
                            {is2faIssue
                                ? t("accessDenied.explanations.insecure2fa")
                                : isMembershipIssue
                                  ? t(
                                        denialReason === "membership_inactive"
                                            ? "accessDenied.explanations.membershipInactive"
                                            : "accessDenied.explanations.notMember",
                                        {
                                            organization:
                                                organization ||
                                                t("signInRequirements.authorizedOrgFallback"),
                                        },
                                    )
                                  : isUnauthenticated
                                    ? t("accessDenied.explanations.unauthenticated")
                                    : isTransientError
                                      ? t("accessDenied.explanations.temporaryError")
                                      : isAdminRequired
                                        ? t("accessDenied.adminRequired.explanation")
                                        : t("accessDenied.subtitle")}
                        </Alert>

                        {/* 2FA-specific content */}
                        {is2faIssue && (
                            <>
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
                                                    <IconDeviceMobile
                                                        size={14}
                                                        aria-hidden="true"
                                                    />
                                                </ThemeIcon>
                                            }
                                        >
                                            <Text size="sm" fw={600}>
                                                {t("accessDenied.acceptedMethods.githubMobile")}
                                            </Text>
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
                                                    <IconShieldCheck size={14} aria-hidden="true" />
                                                </ThemeIcon>
                                            }
                                        >
                                            {t("accessDenied.acceptedMethods.authenticatorApp")}
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
                                                    style={{
                                                        marginLeft: 4,
                                                        verticalAlign: "middle",
                                                    }}
                                                    aria-hidden="true"
                                                />
                                            </Anchor>
                                        </List.Item>
                                        <List.Item>{t("accessDenied.howToFix.step2")}</List.Item>
                                        <List.Item>{t("accessDenied.howToFix.step3")}</List.Item>
                                        <List.Item>{t("accessDenied.howToFix.step4")}</List.Item>
                                    </List>
                                </Stack>
                            </>
                        )}

                        {/* Admin-required-specific content */}
                        {isAdminRequired && (
                            <Text size="sm" c="dimmed">
                                {t("accessDenied.adminRequired.howToFix")}
                            </Text>
                        )}

                        {/* Action Buttons */}
                        <Stack gap="sm" mt="md">
                            {is2faIssue && (
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
                            )}
                            {isMembershipIssue && hasOrganization && invitationsUrl && (
                                <Button
                                    component="a"
                                    href={invitationsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    leftSection={<IconMailForward size={16} aria-hidden="true" />}
                                    variant="filled"
                                    fullWidth
                                    aria-label={t("accessDenied.buttons.checkInvitationsAria", {
                                        organization,
                                    })}
                                >
                                    {t("accessDenied.buttons.checkInvitations")}
                                </Button>
                            )}
                            {isAdminRequired && (
                                <Button
                                    component={Link}
                                    href="/schedule"
                                    leftSection={<IconArrowLeft size={16} aria-hidden="true" />}
                                    variant="filled"
                                    fullWidth
                                >
                                    {t("accessDenied.buttons.backToSchedule")}
                                </Button>
                            )}
                            {!isAdminRequired && (
                                <Button
                                    onClick={handleSignOutAndRetry}
                                    leftSection={<IconLogout size={16} aria-hidden="true" />}
                                    variant={is2faIssue || isMembershipIssue ? "light" : "filled"}
                                    fullWidth
                                >
                                    {t("accessDenied.buttons.signOutAndRetry")}
                                </Button>
                            )}
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
