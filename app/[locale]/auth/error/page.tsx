import ErrorContent from "./ErrorContent";

export interface AuthErrorPageProps {
    searchParams?: {
        error?: string;
    };
}

export default function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
    // The error param can come from the Next.js searchParams
    const errorType = searchParams?.error;

    return <ErrorContent messageKey={errorType} />;
}
