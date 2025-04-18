"use client";

import { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import { Burger, Button, Container, Group, Text, Box, Loader, Transition } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter, usePathname } from "next/navigation";
import classes from "./HeaderSimple.module.css";
import { UserAvatarWrapper } from "../UserAvatarWrapper";
import { SignOutButton } from "../SignOutButton";

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
    const [opened, { toggle }] = useDisclosure(false);
    const [active, setActive] = useState("");
    const [isPending, startTransition] = useTransition();

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

    const handleNavigation = (link: NavLink) => (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();

        // Set the active state
        setActive(link.link);

        // Only transition if we're not already on this page
        if (pathname !== link.link) {
            startTransition(() => {
                router.push(link.link);
            });
        }
    };

    const handleHomeNavigation = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        setActive(HOME_LINK);

        // Only transition if we're not already on the home page
        if (pathname !== HOME_LINK) {
            startTransition(() => {
                router.push(HOME_LINK);
            });
        }
    };

    const items = links.map(link => (
        <a
            key={link.label}
            href={link.link}
            className={classes.link}
            data-active={active === link.link || undefined}
            onClick={handleNavigation(link)}
        >
            {link.label}
        </a>
    ));

    const isHomeActive = active === HOME_LINK;

    return (
        <>
            <header className={classes.header}>
                <Container size="md" className={classes.inner}>
                    <Box className={classes.logoContainer}>
                        <Box
                            component="a"
                            href="/"
                            onClick={handleHomeNavigation}
                            className={classes.logo}
                            data-active={isHomeActive || undefined}
                        >
                            <Image src="/favicon.svg" alt="Logo" width={30} height={30} />
                            <Text component="span" fw={500} size="lg" ml={8}>
                                matkassen
                            </Text>
                        </Box>
                    </Box>
                    <Group gap={5} visibleFrom="xs">
                        {items}
                    </Group>
                    <UserAvatarWrapper />
                    <SignOutButton />
                    <ScanQRCodeLink />
                    <Burger opened={opened} onClick={toggle} hiddenFrom="xs" size="sm" />
                </Container>
            </header>

            {/* Modern full-screen transition overlay */}
            <Transition mounted={isPending} transition="fade" duration={300}>
                {styles => (
                    <Box
                        style={{
                            ...styles,
                            position: "fixed",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(255, 255, 255, 0.85)",
                            backdropFilter: "blur(8px)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 9999,
                            pointerEvents: "all",
                        }}
                    >
                        <Loader size="xl" variant="dots" color="blue" />
                    </Box>
                )}
            </Transition>
        </>
    );
}
