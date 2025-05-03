"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { Burger, Button, Container, Group, Text, Box, Drawer } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { UserAvatarWrapper } from "../UserAvatarWrapper";
import { AuthButton } from "../AuthButton";
import { NavigationLink } from "../NavigationUtils";
import { TransitionLink } from "../TransitionLink";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { useTranslations } from "next-intl";
import { usePathname } from "@/app/i18n/navigation";

import classes from "./HeaderSimple.module.css";

// Special home link for the logo
const HOME_LINK = "/";

export function HeaderSimple() {
    const pathname = usePathname();
    const [opened, { toggle, close }] = useDisclosure(false);
    const [active, setActive] = useState("");
    const t = useTranslations("navigation");
    const tCommon = useTranslations("common");

    // Define navigation links with translated labels using useMemo to avoid dependency changes
    const links = useMemo(
        () => [
            { link: "/households", label: t("households") },
            { link: "/schedule", label: t("schedule") },
            { link: "/handout-locations", label: t("locations") },
            { link: "/households/enroll", label: t("newHousehold") },
        ],
        [t],
    );

    // QR Code scanning link component
    const ScanQRCodeLink = () => (
        <a href="https://scanapp.org/" target="_blank" rel="noreferrer">
            <Button variant="outline">{t("scanQrCode")}</Button>
        </a>
    );

    // Initialize the active state based on the current path
    useEffect(() => {
        if (pathname === "/" || pathname === "") {
            // On home page, no nav link should be active
            setActive(HOME_LINK);
        } else {
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

            if (matchingLinks.length > 0) {
                setActive(matchingLinks[0].link);
            }
        }
    }, [pathname, links]);

    const handleNavigation = (link: string) => () => {
        // Set the active state
        setActive(link);

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
        <NavigationLink
            key={link.label}
            href={link.link}
            label={link.label}
            active={active === link.link}
            onClick={handleNavigation(link.link)}
            className={classes.link}
        />
    ));

    // Mobile navigation links
    const mobileLinks = links.map(link => (
        <NavigationLink
            key={link.label}
            href={link.link}
            label={link.label}
            active={active === link.link}
            onClick={handleNavigation(link.link)}
            className={classes.mobileLink}
        />
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
                                {tCommon("matkassen")}
                            </Text>
                        </TransitionLink>
                    </Box>
                    <Group gap={5} className={classes.navLinksContainer} visibleFrom="xs">
                        {desktopLinks}
                    </Group>
                    <Group gap={5} className={classes.actionsContainer} visibleFrom="xs">
                        <LanguageSwitcher />
                        <UserAvatarWrapper />
                        <AuthButton />
                        <ScanQRCodeLink />
                    </Group>
                    <Burger opened={opened} onClick={toggle} hiddenFrom="xs" size="sm" />
                </Container>
            </header>

            {/* Mobile menu drawer */}
            <Drawer
                opened={opened}
                onClose={close}
                title={t("navigation")}
                size="xs"
                hiddenFrom="xs"
                zIndex={1000}
            >
                <div className={classes.mobileMenu}>
                    {mobileLinks}
                    <div className={classes.mobileActions}>
                        <LanguageSwitcher />
                        <ScanQRCodeLink />
                        <UserAvatarWrapper />
                        <AuthButton />
                    </div>
                </div>
            </Drawer>
        </>
    );
}
