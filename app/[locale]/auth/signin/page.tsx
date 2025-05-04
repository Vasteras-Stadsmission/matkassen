import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SignInClient } from "./SignInClient";

// Server component for handling authentication redirect
export default async function SignInPage({
    searchParams,
}: {
    searchParams: { callbackUrl?: string; error?: string };
}) {
    const session = await auth();

    // Get the callback URL from the search params or use the root path
    const callbackUrl = searchParams.callbackUrl || "/";

    // Redirect if already authenticated
    if (session) {
        redirect(callbackUrl);
    }

    // Pass any error from the search params to the client component
    return <SignInClient callbackUrl={callbackUrl} errorType={searchParams.error} />;
}
