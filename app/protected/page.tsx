"use client";

import { Suspense } from "react";

function ProtectedContent() {
    const safeKey = process.env.NEXT_PUBLIC_SAFE_KEY;

    return (
        <section>
            <h1>This page is protected</h1>
            <p>Safe Key: {safeKey}</p>
            <p>
                This environment variable is made available to the browser with{" "}
                <code>NEXT_PUBLIC_</code>.
            </p>
        </section>
    );
}

export default function ProtectedPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ProtectedContent />
        </Suspense>
    );
}
