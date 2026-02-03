import { ReactNode } from "react";
import { auth } from "@/auth";
import { Container } from "@mantine/core";
import { getTranslations } from "next-intl/server";

interface AuthProtectionProps {
    children: ReactNode;
    unauthorized?: ReactNode;
}

/**
 * A server component that protects content behind authentication
 * Renders the unauthorized content if the user is not authenticated
 * Works alongside the middleware protection for defense in depth
 */
export async function AuthProtection({ children, unauthorized }: AuthProtectionProps) {
    const t = await getTranslations("auth");
    const session = await auth();

    if (!session?.user?.githubUsername) {
        return (
            unauthorized ?? (
                <Container size="xl" py="xl">
                    <div className="flex justify-center items-center h-[calc(100vh-180px)]">
                        <p className="text-xl font-medium">{t("protection.signInRequired")}</p>
                    </div>
                </Container>
            )
        );
    }

    if (!session.user.orgEligibility?.ok) {
        return (
            unauthorized ?? (
                <Container size="xl" py="xl">
                    <div className="flex justify-center items-center h-[calc(100vh-180px)]">
                        <p className="text-xl font-medium">{t("errors.notOrgMember")}</p>
                    </div>
                </Container>
            )
        );
    }

    return <>{children}</>;
}
