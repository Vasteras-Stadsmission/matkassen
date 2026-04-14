import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { sanitizeCallbackUrl } from "@/app/utils/auth/sanitize-callback-url";
import { SignInClient } from "./SignInClient";

type SearchParams = {
    callbackUrl?: string;
    error?: string;
};

type Params = {
    locale: string;
};

// Server component for handling authentication redirect
export default async function SignInPage({
    searchParams,
    params,
}: {
    searchParams: SearchParams | Promise<SearchParams>;
    params: Params | Promise<Params>;
}) {
    const session = await auth();

    // Destructure once to avoid multiple awaits
    const { callbackUrl: rawCallbackUrl = "/", error } = await searchParams;
    const { locale } = await params;

    // Sanitize callback URL to prevent open redirect
    const callbackUrl = sanitizeCallbackUrl(rawCallbackUrl);

    const isEligible = !!session?.user?.githubUsername && session.user.orgEligibility?.ok === true;

    // If user is logged in but not eligible, redirect to the access-denied page with reason
    if (session?.user?.githubUsername && !isEligible) {
        const reason = session.user.orgEligibility?.status ?? "unknown";
        redirect({
            href: `/auth/access-denied?reason=${encodeURIComponent(reason)}`,
            locale,
        });
    }

    if (isEligible) {
        redirect({
            href: callbackUrl,
            locale,
        });
    }

    return <SignInClient callbackUrl={callbackUrl} errorType={error} />;
}
