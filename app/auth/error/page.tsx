"use client";

import { useSearchParams } from "next/navigation";

export default function ErrorPage() {
    const searchParams = useSearchParams();
    const error = searchParams.get("error");
    let message = "Login failed.";
    if (error === "not-org-member") {
        message = "You are not a public member of the required organization.";
    } else if (error === "invalid-account-provider") {
        message = "Invalid account provider.";
    }

    return (
        <div>
            <h1>Authentication Error</h1>
            <p>{message}</p>
        </div>
    );
}
