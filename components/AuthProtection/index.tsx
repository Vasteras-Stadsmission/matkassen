import { ReactNode } from "react";
import { auth } from "@/auth";
import { Container } from "@mantine/core";

interface AuthProtectionProps {
    children: ReactNode;
    unauthorized?: ReactNode;
}

/**
 * A server component that protects content behind authentication
 * Renders the unauthorized content if the user is not authenticated
 * Works alongside the middleware protection for defense in depth
 */
export async function AuthProtection({
    children,
    unauthorized = (
        <Container size="xl" py="xl">
            <div className="flex justify-center items-center h-[calc(100vh-180px)]">
                <p className="text-xl font-medium">Please sign in to access this page</p>
            </div>
        </Container>
    ),
}: AuthProtectionProps) {
    const session = await auth();

    if (!session) {
        return unauthorized;
    }

    return <>{children}</>;
}
