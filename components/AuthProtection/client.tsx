"use client";

import { ReactNode, useEffect, useState } from "react";
import { Container } from "@mantine/core";

interface AuthProtectionClientProps {
    children: ReactNode;
    unauthorized?: ReactNode;
}

/**
 * A client component that protects content behind authentication
 * To be used with client components that can't use the server AuthProtection
 */
export function AuthProtectionClient({
    children,
    unauthorized = (
        <Container size="xl" py="xl">
            <div className="flex justify-center items-center h-[calc(100vh-180px)]">
                <p className="text-xl font-medium">Please sign in to access this page</p>
            </div>
        </Container>
    ),
}: AuthProtectionClientProps) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    useEffect(() => {
        // Check authentication status
        async function checkAuth() {
            try {
                const response = await fetch("/api/auth/session");
                const session = await response.json();
                setIsAuthenticated(!!session.user);
            } catch (error) {
                console.error("Authentication check failed:", error);
                setIsAuthenticated(false);
            }
        }

        checkAuth();
    }, []);

    // Return loading state or null while checking
    if (isAuthenticated === null) {
        return null;
    }

    if (!isAuthenticated) {
        return unauthorized;
    }

    return <>{children}</>;
}
