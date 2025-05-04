"use client";

import React from "react";
import { Menu, UnstyledButton, Avatar, Text, Button } from "@mantine/core";
import { IconLogout, IconLogin } from "@tabler/icons-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import classes from "./AuthDropdown.module.css";

export function AuthDropdown() {
    const { data: session, status } = useSession();
    const t = useTranslations("auth");

    // Loading state
    if (status === "loading") {
        return <Avatar size="md" radius="xl" color="blue" />;
    }

    // Logged out state - simple login button
    if (status !== "authenticated") {
        return (
            <Button leftSection={<IconLogin size={18} />} onClick={() => signIn("github")}>
                {t("login")}
            </Button>
        );
    }

    // Logged in state - avatar only with dropdown
    const user = session.user;
    // If user is not defined, show a default avatar
    // This can happen if the session is not fully loaded or if the user data is not available
    if (!user) {
        return <Avatar size="md" radius="xl" color="blue" />;
    }

    return (
        <Menu shadow="md" width={200} position="bottom-end" withArrow>
            <Menu.Target>
                <UnstyledButton className={classes.avatarButton}>
                    <Avatar
                        src={user.image ?? undefined}
                        radius="xl"
                        size="md"
                        alt={user.name || t("user")}
                    />
                </UnstyledButton>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>{t("account")}</Menu.Label>

                <div className={classes.usernameItem}>
                    <Text size="sm" fw={500} p="xs">
                        {user.name || t("user")}
                    </Text>
                </div>

                <Menu.Divider />

                <Menu.Item
                    color="red"
                    leftSection={<IconLogout size={16} stroke={1.5} />}
                    onClick={() => signOut({ callbackUrl: "/" })}
                >
                    {t("logout")}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}
