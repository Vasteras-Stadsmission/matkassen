import React from "react";
import { Button } from "@mantine/core";
import { signOut, useSession } from "next-auth/react";
import { Link } from "@/app/i18n/navigation";
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
                component="a"
                href="/api/auth/signout"
                onClick={e => {
                    e.preventDefault();
                    signOut();
                }}
            >
                {t("logout")}
            </Button>
        );
    }

    return (
        <Button component={Link} href="/api/auth/signin">
            {t("login")}
        </Button>
    );
}
