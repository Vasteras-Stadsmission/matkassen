"use client";

import { ReactNode, useEffect, useState } from "react";
import { Container } from "@mantine/core";
import { useTranslations } from "next-intl";

interface AuthProtectionClientProps {
    children: ReactNode;
    unauthorized?: ReactNode;
}

/**
 * A client component that protects content behind authentication
 * To be used with client components that can't use the server AuthProtection
 */
export function AuthProtectionClient({ children, unauthorized }: AuthProtectionClientProps) {
    const t = useTranslations("auth");
    const [authStatus, setAuthStatus] = useState<
        "loading" | "ok" | "unauthenticated" | "forbidden"
    >("loading");

    useEffect(() => {
        // Check authentication status.
        // NOTE: Intentionally uses bare fetch() instead of adminFetch() here.
        // This component gates access — using adminFetch would redirect on 401/403
        // instead of rendering the "sign in required" / "not org member" UI.
        async function checkAuth() {
            try {
                const response = await fetch("/api/admin/auth-check");
                if (response.ok) {
                    setAuthStatus("ok");
                    return;
                }
                if (response.status === 401) {
                    setAuthStatus("unauthenticated");
                    return;
                }
                if (response.status === 403) {
                    setAuthStatus("forbidden");
                    return;
                }
                setAuthStatus("unauthenticated");
            } catch (error) {
                console.error("Authentication check failed:", error);
                setAuthStatus("unauthenticated");
            }
        }

        checkAuth();
    }, []);

    // Return loading state or null while checking
    if (authStatus === "loading") {
        return null;
    }

    if (authStatus !== "ok") {
        return (
            unauthorized ?? (
                <Container size="xl" py="xl">
                    <div className="flex justify-center items-center h-[calc(100vh-180px)]">
                        <p className="text-xl font-medium">
                            {authStatus === "forbidden"
                                ? t("errors.notOrgMember")
                                : t("protection.signInRequired")}
                        </p>
                    </div>
                </Container>
            )
        );
    }

    return <>{children}</>;
}
