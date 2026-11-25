import { ReactNode } from "react";
import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { stripLocalePrefix } from "@/app/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
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
    adminOnly?: boolean;
}

/**
 * A server component that protects content behind both authentication AND agreement acceptance
 * Renders the unauthorized content if the user is not authenticated
 * Redirects to /agreement if the user hasn't accepted the current agreement
 * When adminOnly=true, redirects handout_staff to /auth/access-denied?reason=admin_required
 * Works alongside the middleware protection for defense in depth
 */
export async function AgreementProtection({
    children,
    unauthorized,
    adminOnly = false,
}: AgreementProtectionProps) {
    const session = await auth();

    if (!session) {
        if (unauthorized) {
            return unauthorized;
        }
        const t = await getTranslations("auth.protection");
        return (
            <Container size="xl" py="xl">
                <div className="flex justify-center items-center h-[calc(100vh-180px)]">
                    <p className="text-xl font-medium">{t("signInRequired")}</p>
                </div>
            </Container>
        );
    }

    const eligibility = session.user?.orgEligibility;
    if (!session.user?.githubUsername || !eligibility?.ok) {
        const locale = await getLocale();
        const reason = eligibility?.status ?? "unknown";
        return redirect({
            href: `/auth/access-denied?reason=${encodeURIComponent(reason)}`,
            locale,
        });
    }

    if (adminOnly && session.user?.role !== "admin") {
        const locale = await getLocale();
        return redirect({
            href: `/auth/access-denied?reason=admin_required`,
            locale,
        });
    }

    // Check if there's a current agreement that needs to be accepted
    const currentAgreement = await getCurrentAgreement();

    if (currentAgreement) {
        const locale = await getLocale();
        const githubUsername = session.user.githubUsername;

        const userId = await getUserIdByGithubUsername(githubUsername);

        // Sign-in creates the user row, so a user without one can't have accepted
        // the agreement: the same rule the server actions apply.
        // Use the agreement ID we already have to avoid a second getCurrentAgreement() call
        const hasAccepted =
            userId !== null && (await hasUserAcceptedAgreement(userId, currentAgreement.id));

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
 * Get the current path and query string from request headers, without the
 * locale prefix since next-intl adds it. The /agreement page sanitizes it
 * before redirecting back.
 */
async function getCurrentPathname(): Promise<string | null> {
    try {
        const headersList = await headers();
        // x-next-url is set by our middleware and contains the path and query string
        const nextUrl = headersList.get("x-next-url") ?? headersList.get("next-url");
        if (nextUrl) {
            const url = new URL(nextUrl, "http://localhost");
            return stripLocalePrefix(url.pathname) + url.search;
        }
        // Fallback: try referer header
        const referer = headersList.get("referer");
        if (referer) {
            const url = new URL(referer);
            return stripLocalePrefix(url.pathname) + url.search;
        }
    } catch {
        // Headers not available (e.g., during static generation)
    }
    return null;
}
