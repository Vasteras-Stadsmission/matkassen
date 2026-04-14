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
    ActionIcon,
    Tooltip,
    useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { NavigationLink } from "../NavigationUtils";
import { TransitionLink } from "../TransitionLink";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { AuthDropdown } from "../AuthDropdown/AuthDropdown";
import { SettingsDropdown } from "../SettingsDropdown";
import { useTranslations } from "next-intl";
import { usePathname } from "@/app/i18n/navigation";
import type { TranslationFunction } from "@/app/[locale]/types";
import { IconQrcode, IconHelpCircle } from "@tabler/icons-react";
import { Link as LocalizedLink } from "@/app/i18n/navigation";
import { useSession } from "next-auth/react";

import classes from "./HeaderSimple.module.css";

// Special home link for the logo
const HOME_LINK = "/";

export function HeaderSimple() {
    const pathname = usePathname();
    const [opened, { toggle, close }] = useDisclosure(false);
    const t = useTranslations() as TranslationFunction;
    const tCommon = useTranslations() as TranslationFunction;
    const theme = useMantineTheme();
    const isCompactDesktop = useMediaQuery(`(max-width: ${theme.breakpoints.lg})`, false, {
        getInitialValueInEffect: true,
    });
    const showIconOnlyActions = useMediaQuery(`(max-width: ${theme.breakpoints.md})`, false, {
        getInitialValueInEffect: true,
    });
    const { data: session, status } = useSession();
    // Only grant admin UI once the session has been confirmed — avoids briefly
    // showing admin nav/settings to non-admin users while the session loads.
    const isAdmin = status !== "loading" && session?.user?.role === "admin";

    // State to track active link - initialized as empty string to ensure consistent SSR/client rendering
    const [active, setActive] = useState("");
    const [issuesCount, setIssuesCount] = useState(0);

    // Fetch issues count on mount (only for admins)
    // Note: Badge only updates on full page refresh, not on client-side navigation
    useEffect(() => {
        if (!isAdmin) return;

        const fetchIssuesCount = async () => {
            try {
                // NOTE: Use plain fetch() here, NOT adminFetch(). The header renders
                // on every page including the sign-in page. Using adminFetch would
                // redirect unauthenticated users on 401, causing an infinite redirect
                // loop that overwhelms the server and triggers nginx 503 errors.
                const response = await fetch("/api/admin/issues/count");
                if (response.ok) {
                    const data = await response.json();
                    if (typeof data.total === "number") {
                        setIssuesCount(data.total);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch issues count:", error);
            }
        };

        fetchIssuesCount();
    }, [isAdmin]);

    // Define navigation links with translated labels using useMemo to avoid dependency changes
    // Issues link only appears when there are issues to address (home page is accessible via logo)
    // Admin-only links are hidden for handout_staff
    const links = useMemo(
        () => [
            ...(isAdmin && issuesCount > 0
                ? [
                      {
                          link: "/",
                          label: t("navigation.issues"),
                          badge: issuesCount,
                      },
                  ]
                : []),
            ...(isAdmin ? [{ link: "/households", label: t("navigation.households") }] : []),
            { link: "/schedule", label: t("navigation.schedule") },
            ...(isAdmin ? [{ link: "/statistics", label: t("navigation.statistics") }] : []),
        ],
        [t, issuesCount, isAdmin],
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
    const scanQrLabel = t("navigation.scanQrCode");
    const ScanQRCodeLink = () => {
        if (showIconOnlyActions) {
            return (
                <Tooltip label={scanQrLabel} position="bottom" withArrow>
                    <ActionIcon
                        component="a"
                        href="https://scanapp.org/"
                        target="_blank"
                        rel="noreferrer"
                        variant="outline"
                        aria-label={scanQrLabel}
                        size="lg"
                    >
                        <IconQrcode size={18} stroke={1.8} />
                    </ActionIcon>
                </Tooltip>
            );
        }

        return (
            <Button
                component="a"
                href="https://scanapp.org/"
                target="_blank"
                rel="noreferrer"
                variant="outline"
                leftSection={<IconQrcode size={18} stroke={1.8} />}
            >
                {scanQrLabel}
            </Button>
        );
    };

    // In-app help link — points at /help index where role-filtered manuals
    // are listed. Visible to every authenticated user regardless of role;
    // the index itself filters which manuals to show.
    const helpLabel = t("navigation.help");
    const helpAriaLabel = t("navigation.helpAria");
    const HelpLink = () => {
        // Always render as an icon-only button to keep the header compact.
        // The ScanQR button already carries text, so stacking two labelled
        // buttons would eat into the nav area.
        return (
            <Tooltip label={helpLabel} position="bottom" withArrow>
                <ActionIcon
                    component={LocalizedLink}
                    href="/help"
                    variant="subtle"
                    aria-label={helpAriaLabel}
                    size="lg"
                >
                    <IconHelpCircle size={20} stroke={1.8} />
                </ActionIcon>
            </Tooltip>
        );
    };

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
            <header className={classes.header} data-compact={isCompactDesktop || undefined}>
                {/* `md` (960 px) was just barely enough for logo + four admin
                    nav items + four right-side actions. Adding the help icon
                    pushed the row past 960 px — Mantine's Group defaults to
                    `wrap="wrap"`, so the last nav item ("Statistik" for
                    admins) dropped to a second row instead of overflowing.
                    Bumping to `lg` (1140 px) gives the row the ~180 px of
                    slack it needs without making the header feel detached
                    from the `md`-sized content containers on the pages
                    below. */}
                <Container size="lg" className={classes.inner}>
                    <Box className={classes.logoContainer}>
                        <TransitionLink
                            href={HOME_LINK}
                            className={classes.logo}
                            data-active={isHomeActive || undefined}
                        >
                            <Image src="/favicon.svg" alt="Logo" width={30} height={30} />
                            <Text component="span" fw={500} size="lg" ml={8}>
                                {tCommon("common.brandName")}
                            </Text>
                        </TransitionLink>
                    </Box>
                    <Group gap={5} className={classes.navLinksContainer} visibleFrom="md">
                        {desktopLinks}
                    </Group>
                    <Group
                        gap={isCompactDesktop ? "xs" : "sm"}
                        className={classes.actionsContainer}
                        visibleFrom="md"
                    >
                        <LanguageSwitcher />
                        <HelpLink />
                        <AuthDropdown />
                        {isAdmin && <SettingsDropdown />}
                        <ScanQRCodeLink />
                    </Group>
                    <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" />
                </Container>
            </header>

            {/* Mobile menu drawer */}
            <Drawer
                opened={opened}
                onClose={close}
                title={t("navigation.navigation")}
                size="xs"
                hiddenFrom="md"
                zIndex={1000}
            >
                <div className={classes.mobileMenu}>
                    {mobileLinks}
                    <div className={classes.mobileActions}>
                        <LanguageSwitcher />
                        <HelpLink />
                        <ScanQRCodeLink />
                        {isAdmin && <SettingsDropdown />}
                        <AuthDropdown />
                    </div>
                </div>
            </Drawer>
        </>
    );
}
