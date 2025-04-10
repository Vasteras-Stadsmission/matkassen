import { useState } from "react";
import Image from "next/image";
import { Burger, Button, Container, Group } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import classes from "./HeaderSimple.module.css";
import UserAvatar from "../UserAvatar";
import { SignOutButton } from "../SignOutButton";

const links = [
    { link: "/recipients", label: "Mottagare" },
    { link: "/schedule", label: "Schema" },
    { link: "/handout-locations", label: "Utlämningsställen" },
    { link: "/create-recipient", label: "Ny mottagare +" },
];

export function HeaderSimple() {
    const [opened, { toggle }] = useDisclosure(false);
    const [active, setActive] = useState(links[0].link);

    const items = links.map(link => (
        <a
            key={link.label}
            href={link.link}
            className={classes.link}
            data-active={active === link.link || undefined}
            onClick={event => {
                event.preventDefault();
                setActive(link.link);
            }}
        >
            {link.label}
        </a>
    ));

    return (
        <header className={classes.header}>
            <Container size="md" className={classes.inner}>
                <Group className={classes.logo}>
                    <Image src="/favicon.svg" alt="Logo" width={30} height={30} />
                    <h2>matkassen</h2>
                </Group>
                <Group gap={5} visibleFrom="xs">
                    {items}
                </Group>
                <UserAvatar />
                <SignOutButton />
                <ScanQRCodeLink />
                <Burger opened={opened} onClick={toggle} hiddenFrom="xs" size="sm" />
            </Container>
        </header>
    );
}

const ScanQRCodeLink = () => (
    <a href="https://scanapp.org/" target="_blank" rel="noreferrer">
        <Button variant="outline">Skanna QR-kod</Button>
    </a>
);
