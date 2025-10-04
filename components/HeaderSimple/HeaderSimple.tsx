"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import {
    Burger,
    Button,
    Container,
    Group,
    Text,
    Box,
    Drawer,
    Badge,
    Indicator,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { NavigationLink } from "../NavigationUtils";
import { TransitionLink } from "../TransitionLink";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { AuthDropdown } from "../AuthDropdown/AuthDropdown";
import { useTranslations } from "next-intl";
import { usePathname } from "@/app/i18n/navigation";
import type { TranslationFunction } from "@/app/[locale]/types";

import classes from "./HeaderSimple.module.css";

// Special home link for the logo
const HOME_LINK = "/";

export function HeaderSimple() {
    const pathname = usePathname();
    const [opened, { toggle, close }] = useDisclosure(false);
    const t = useTranslations() as TranslationFunction;
    const tCommon = useTranslations() as TranslationFunction;

    // State to track active link - initialized as empty string to ensure consistent SSR/client rendering
    const [active, setActive] = useState("");
    const [smsFailureCount, setSmsFailureCount] = useState(0);

    // Fetch SMS failure count
    useEffect(() => {
        const fetchFailureCount = async () => {
            try {
                const response = await fetch("/api/admin/sms/failure-count");
                if (response.ok) {
                    const data = await response.json();
                    setSmsFailureCount(data.count || 0);
                }
            } catch (error) {
                console.error("Failed to fetch SMS failure count:", error);
            }
        };

        fetchFailureCount();
        // Refresh count every 30 seconds
        const interval = setInterval(fetchFailureCount, 30000);
        return () => clearInterval(interval);
    }, []);

    // Define navigation links with translated labels using useMemo to avoid dependency changes
    const links = useMemo(
        () => [
            { link: "/households", label: t("navigation.households") },
            { link: "/schedule", label: t("navigation.schedule") },
            { link: "/handout-locations", label: t("navigation.locations") },
            { link: "/sms-dashboard", label: t("navigation.smsDashboard"), badge: smsFailureCount },
        ],
        [t, smsFailureCount],
    );

    // Calculate active link after hydration to prevent SSR/client mismatch
    useEffect(() => {
        if (!pathname) return;

        if (pathname === "/" || pathname === "") {
            setActive(HOME_LINK);
            return;
        }

        // First check for exact matches
        const exactMatch = links.find(link => link.link === pathname);
        if (exactMatch) {
            setActive(exactMatch.link);
            return;
        }

        // If we have a nested path like /households/enroll, prioritize the most specific match
        const matchingLinks = links
            .filter(link => pathname.startsWith(link.link))
            .sort((a, b) => b.link.length - a.link.length); // Sort by length descending to get most specific match first

        setActive(matchingLinks.length > 0 ? matchingLinks[0].link : "");
    }, [pathname, links]);

    // QR Code scanning link component
    const ScanQRCodeLink = () => (
        <a href="https://scanapp.org/" target="_blank" rel="noreferrer">
            <Button variant="outline">{t("navigation.scanQrCode")}</Button>
        </a>
    );

    const handleNavigation = () => {
        // Close mobile menu if open
        if (opened) {
            close();
        }

        // The actual navigation will be handled by the NavigationLink component
        // which uses useTransition to show the skeleton during navigation
    };

    const isHomeActive = active === HOME_LINK;

    // Desktop navigation links
    const desktopLinks = links.map(link => (
        <Box key={link.label} style={{ position: "relative" }}>
            {link.badge && link.badge > 0 ? (
                <Indicator
                    inline
                    label={link.badge}
                    size={16}
                    color="red"
                    offset={7}
                    position="top-end"
                >
                    <NavigationLink
                        href={link.link}
                        label={link.label}
                        active={active === link.link}
                        onClick={handleNavigation}
                        className={classes.link}
                    />
                </Indicator>
            ) : (
                <NavigationLink
                    href={link.link}
                    label={link.label}
                    active={active === link.link}
                    onClick={handleNavigation}
                    className={classes.link}
                />
            )}
        </Box>
    ));

    // Mobile navigation links
    const mobileLinks = links.map(link => (
        <Group key={link.label} justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
            <NavigationLink
                href={link.link}
                label={link.label}
                active={active === link.link}
                onClick={handleNavigation}
                className={classes.mobileLink}
                style={{ flex: 1 }}
            />
            {link.badge && link.badge > 0 && (
                <Badge color="red" variant="filled" size="sm" circle>
                    {link.badge}
                </Badge>
            )}
        </Group>
    ));

    return (
        <>
            <header className={classes.header}>
                <Container size="md" className={classes.inner}>
                    <Box className={classes.logoContainer}>
                        <TransitionLink
                            href={HOME_LINK}
                            className={classes.logo}
                            data-active={isHomeActive || undefined}
                        >
                            <Image src="/favicon.svg" alt="Logo" width={30} height={30} />
                            <Text component="span" fw={500} size="lg" ml={8}>
                                {tCommon("common.matkassen")}
                            </Text>
                        </TransitionLink>
                    </Box>
                    <Group gap={5} className={classes.navLinksContainer} visibleFrom="xs">
                        {desktopLinks}
                    </Group>
                    <Group gap={5} className={classes.actionsContainer} visibleFrom="xs">
                        <LanguageSwitcher />
                        <AuthDropdown />
                        <ScanQRCodeLink />
                    </Group>
                    <Burger opened={opened} onClick={toggle} hiddenFrom="xs" size="sm" />
                </Container>
            </header>

            {/* Mobile menu drawer */}
            <Drawer
                opened={opened}
                onClose={close}
                title={t("navigation.navigation")}
                size="xs"
                hiddenFrom="xs"
                zIndex={1000}
            >
                <div className={classes.mobileMenu}>
                    {mobileLinks}
                    <div className={classes.mobileActions}>
                        <LanguageSwitcher />
                        <ScanQRCodeLink />
                        <AuthDropdown />
                    </div>
                </div>
            </Drawer>
        </>
    );
}
