import { Suspense } from "react";
import ErrorContent from "./ErrorContent";

export default function ErrorPage() {
    return (
        <Suspense fallback={<div>Loading authentication error details...</div>}>
            <ErrorContent />
        </Suspense>
    );
}
