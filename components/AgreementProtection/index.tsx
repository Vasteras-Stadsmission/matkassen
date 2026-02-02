import { ReactNode } from "react";
import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { getLocale } from "next-intl/server";
import { Container } from "@mantine/core";
import {
    hasUserAcceptedCurrentAgreement,
    getUserIdByGithubUsername,
    getCurrentAgreement,
} from "@/app/utils/user-agreement";

interface AgreementProtectionProps {
    children: ReactNode;
    unauthorized?: ReactNode;
}

/**
 * A server component that protects content behind both authentication AND agreement acceptance
 * Renders the unauthorized content if the user is not authenticated
 * Redirects to /agreement if the user hasn't accepted the current agreement
 * Works alongside the middleware protection for defense in depth
 */
export async function AgreementProtection({
    children,
    unauthorized = (
        <Container size="xl" py="xl">
            <div className="flex justify-center items-center h-[calc(100vh-180px)]">
                <p className="text-xl font-medium">Please sign in to access this page</p>
            </div>
        </Container>
    ),
}: AgreementProtectionProps) {
    const session = await auth();

    if (!session) {
        return unauthorized;
    }

    // Check if there's a current agreement that needs to be accepted
    const currentAgreement = await getCurrentAgreement();

    if (currentAgreement) {
        const githubUsername = session.user?.githubUsername;

        if (githubUsername) {
            const userId = await getUserIdByGithubUsername(githubUsername);

            if (userId) {
                const hasAccepted = await hasUserAcceptedCurrentAgreement(userId);

                if (!hasAccepted) {
                    const locale = await getLocale();
                    redirect({
                        href: "/agreement",
                        locale,
                    });
                }
            }
        }
    }

    return <>{children}</>;
}
