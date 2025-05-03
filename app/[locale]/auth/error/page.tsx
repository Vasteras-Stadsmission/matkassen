import { Suspense } from "react";
import ErrorContent from "./ErrorContent";
import { setRequestLocale } from "next-intl/server";

export default function AuthErrorPage({ params: { locale } }: { params: { locale: string } }) {
    // Enable static rendering
    setRequestLocale(locale);

    return (
        <Suspense fallback={<div>Loading authentication error details...</div>}>
            <ErrorContent messageKey="serverError" />
        </Suspense>
    );
}
