import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
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

    const { callbackUrl = "/" } = await searchParams;
    const { locale } = await params;

    // Redirect if already authenticated
    if (session) {
        redirect({
            href: callbackUrl,
            locale,
        });
    }

    // Pass any error from the search params to the client component
    const { error } = await searchParams;
    return <SignInClient callbackUrl={callbackUrl} errorType={error} />;
}
