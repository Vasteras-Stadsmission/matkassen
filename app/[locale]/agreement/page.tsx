import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { stripLocalePrefix } from "@/app/i18n/routing";
import { AgreementClient } from "./AgreementClient";

type SearchParams = {
    callbackUrl?: string;
};

type Params = {
    locale: string;
};

/**
 * Agreement acceptance page
 * Users must accept the current agreement before accessing the rest of the application
 * This page requires authentication but not agreement acceptance (to avoid redirect loops)
 */
export default async function AgreementPage({
    searchParams,
    params,
}: {
    searchParams: SearchParams | Promise<SearchParams>;
    params: Params | Promise<Params>;
}) {
    const session = await auth();
    const { locale } = await params;

    // Redirect to sign in if not authenticated
    if (!session) {
        redirect({
            href: "/auth/signin",
            locale,
        });
    }

    const { callbackUrl = "/" } = await searchParams;
    // Sanitize: must be a relative path, and strip any locale prefix since next-intl adds it
    const safeCallbackUrl =
        callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
            ? stripLocalePrefix(callbackUrl)
            : "/";

    return <AgreementClient callbackUrl={safeCallbackUrl} />;
}
