import ErrorContent from "./ErrorContent";

export interface AuthErrorPageProps {
    searchParams: Promise<{
        error?: string;
    }>;
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
    // The error param can come from the Next.js searchParams
    const { error: errorType } = await searchParams;

    return <ErrorContent messageKey={errorType} />;
}
