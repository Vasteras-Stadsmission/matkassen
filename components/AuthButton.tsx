"use client";

import React from "react";
import { Button } from "@mantine/core";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

export function AuthButton() {
    const { status } = useSession();
    const t = useTranslations("auth");

    if (status === "loading") {
        return <Button disabled>...</Button>;
    }

    if (status === "authenticated") {
        return (
            <Button
                onClick={e => {
                    e.preventDefault();
                    // Direct call to signOut to avoid locale prefix issues
                    signOut({ callbackUrl: "/" });
                }}
            >
                {t("logout")}
            </Button>
        );
    }

    return (
        <Button
            onClick={e => {
                e.preventDefault();
                // Direct call to signIn to avoid locale prefix issues
                signIn("github");
            }}
        >
            {t("login")}
        </Button>
    );
}
