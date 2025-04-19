"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Burger, Button, Container, Group, Text, Box, Drawer } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter, usePathname } from "next/navigation";
import classes from "./HeaderSimple.module.css";
import { UserAvatarWrapper } from "../UserAvatarWrapper";
import { SignOutButton } from "../SignOutButton";
import { NavigationLink } from "../NavigationUtils";

interface NavLink {
    link: string;
    label: string;
}

const links: NavLink[] = [
    { link: "/recipients", label: "Mottagare" },
    { link: "/schedule", label: "Schema" },
    { link: "/handout-locations", label: "Utlämningsställen" },
    { link: "/create-recipient", label: "Ny mottagare +" },
];

// Special home link for the logo
const HOME_LINK = "/";

const ScanQRCodeLink = () => (
    <a href="https://scanapp.org/" target="_blank" rel="noreferrer">
        <Button variant="outline">Skanna QR-kod</Button>
    </a>
);

export function HeaderSimple() {
    const router = useRouter();
    const pathname = usePathname();
    const [opened, { toggle, close }] = useDisclosure(false);
    const [active, setActive] = useState("");

    // Initialize the active state based on the current path
    useEffect(() => {
        if (pathname === "/" || pathname === "") {
            // On home page, no nav link should be active
            setActive(HOME_LINK);
        } else {
            // Only update if the path corresponds to one of our links
            const matchingLink = links.find(link => pathname === link.link);
            if (matchingLink) {
                setActive(matchingLink.link);
            }
        }
    }, [pathname]);

    const handleNavigation = (link: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();

        // Set the active state
        setActive(link);

        // Only transition if we're not already on this page
        if (pathname !== link) {
            router.push(link);
        }

        // Close mobile menu if open
        if (opened) {
            close();
        }
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
                        <a
                            href="/"
                            onClick={handleNavigation(HOME_LINK)}
                            className={classes.logo}
                            data-active={isHomeActive || undefined}
                        >
                            <Image src="/favicon.svg" alt="Logo" width={30} height={30} />
                            <Text component="span" fw={500} size="lg" ml={8}>
                                matkassen
                            </Text>
                        </a>
                    </Box>
                    <Group gap={5} visibleFrom="xs">
                        {desktopLinks}
                    </Group>
                    <Group gap={5} visibleFrom="xs">
                        <UserAvatarWrapper />
                        <SignOutButton />
                        <ScanQRCodeLink />
                    </Group>
                    <Burger opened={opened} onClick={toggle} hiddenFrom="xs" size="sm" />
                </Container>
            </header>

            {/* Mobile menu drawer */}
            <Drawer
                opened={opened}
                onClose={close}
                title="Navigation"
                size="xs"
                hiddenFrom="xs"
                zIndex={1000}
            >
                <div className={classes.mobileMenu}>
                    {mobileLinks}
                    <div className={classes.mobileActions}>
                        <ScanQRCodeLink />
                        <UserAvatarWrapper />
                        <SignOutButton />
                    </div>
                </div>
            </Drawer>
        </>
    );
}
