"use client";

import { useState, useEffect, useCallback } from "react";
import { Container, Grid, Paper, Title, Text, Box, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import { SettingsNav, type SettingsSection } from "./SettingsNav";
import { PrivacyPolicyEditor } from "./PrivacyPolicyEditor";
import { EnrollmentChecklist } from "./EnrollmentChecklist";
import { ParcelThresholdSettings } from "./ParcelThresholdSettings";
import { NoShowFollowupSettings } from "./NoShowFollowupSettings";

export function SettingsPageClient() {
    const t = useTranslations("settings");
    const theme = useMantineTheme();
    const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.md})`, false, {
        getInitialValueInEffect: true,
    });

    // Get initial section from URL hash or default to privacy-policy
    const getInitialSection = (): SettingsSection => {
        if (typeof window === "undefined") return "privacy-policy";
        const hash = window.location.hash.slice(1);
        if (
            hash === "privacy-policy" ||
            hash === "enrollment-checklist" ||
            hash === "parcel-threshold" ||
            hash === "noshow-followup"
        ) {
            return hash as SettingsSection;
        }
        return "privacy-policy";
    };

    const [activeSection, setActiveSection] = useState<SettingsSection>("privacy-policy");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setActiveSection(getInitialSection());
    }, []);

    const handleSectionChange = useCallback((section: SettingsSection) => {
        setActiveSection(section);
        // Update URL hash without triggering a full page reload
        window.history.replaceState(null, "", `#${section}`);
        // Scroll to top of content on mobile
        if (window.innerWidth < 768) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, []);

    // Listen for hash changes (e.g., back/forward navigation)
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.slice(1);
            if (
                hash === "privacy-policy" ||
                hash === "enrollment-checklist" ||
                hash === "parcel-threshold" ||
                hash === "noshow-followup"
            ) {
                setActiveSection(hash as SettingsSection);
            }
        };

        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, []);

    const renderContent = () => {
        switch (activeSection) {
            case "privacy-policy":
                return <PrivacyPolicyEditor />;
            case "enrollment-checklist":
                return <EnrollmentChecklist />;
            case "parcel-threshold":
                return <ParcelThresholdSettings />;
            case "noshow-followup":
                return <NoShowFollowupSettings />;
            default:
                return <PrivacyPolicyEditor />;
        }
    };

    // Prevent hydration mismatch
    if (!mounted) {
        return (
            <Container size="xl" py="xl">
                <Title order={1} mb="xl">
                    {t("general")}
                </Title>
            </Container>
        );
    }

    if (isMobile) {
        // Mobile: Stack navigation on top of content
        return (
            <Container size="xl" py="md">
                <Title order={1} mb="md">
                    {t("general")}
                </Title>
                <Text c="dimmed" mb="lg">
                    {t("generalDescription")}
                </Text>

                <Paper withBorder p="md" mb="lg">
                    <SettingsNav
                        activeSection={activeSection}
                        onSectionChange={handleSectionChange}
                    />
                </Paper>

                <Box>{renderContent()}</Box>
            </Container>
        );
    }

    // Desktop: Side-by-side layout
    return (
        <Container size="xl" py="xl">
            <Title order={1} mb="md">
                {t("general")}
            </Title>
            <Text c="dimmed" mb="xl">
                {t("generalDescription")}
            </Text>

            <Grid gutter="xl">
                <Grid.Col span={3}>
                    <Paper
                        withBorder
                        p="md"
                        style={{
                            position: "sticky",
                            top: "80px",
                        }}
                    >
                        <SettingsNav
                            activeSection={activeSection}
                            onSectionChange={handleSectionChange}
                        />
                    </Paper>
                </Grid.Col>

                <Grid.Col span={9}>
                    <Box>{renderContent()}</Box>
                </Grid.Col>
            </Grid>
        </Container>
    );
}
