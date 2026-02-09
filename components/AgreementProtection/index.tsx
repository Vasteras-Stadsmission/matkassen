import { ReactNode } from "react";
import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { Container } from "@mantine/core";
import {
    hasUserAcceptedAgreement,
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
        const locale = await getLocale();
        const githubUsername = session.user?.githubUsername;

        // If we can't identify the user, redirect to agreement page
        if (!githubUsername) {
            const callbackUrl = await getCurrentPathname();
            return redirect({
                href: `/agreement${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`,
                locale,
            });
        }

        const userId = await getUserIdByGithubUsername(githubUsername);

        // If user doesn't exist in DB yet, let them through
        // User provisioning happens elsewhere (OAuth callback) and must complete
        // before the agreement can be accepted
        if (!userId) {
            return <>{children}</>;
        }

        // Use the agreement ID we already have to avoid a second getCurrentAgreement() call
        const hasAccepted = await hasUserAcceptedAgreement(userId, currentAgreement.id);

        if (!hasAccepted) {
            const callbackUrl = await getCurrentPathname();
            return redirect({
                href: `/agreement${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`,
                locale,
            });
        }
    }

    return <>{children}</>;
}

/**
 * Get the current pathname from request headers.
 * Returns the path portion (without locale prefix since next-intl handles that).
 */
async function getCurrentPathname(): Promise<string | null> {
    try {
        const headersList = await headers();
        // next-url is set by Next.js middleware and contains the full URL path
        const nextUrl = headersList.get("x-next-url") ?? headersList.get("next-url");
        if (nextUrl) {
            const url = new URL(nextUrl, "http://localhost");
            return url.pathname;
        }
        // Fallback: try referer header
        const referer = headersList.get("referer");
        if (referer) {
            const url = new URL(referer);
            return url.pathname;
        }
    } catch {
        // Headers not available (e.g., during static generation)
    }
    return null;
}
