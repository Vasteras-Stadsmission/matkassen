"use client";

import { Suspense, createContext, useContext } from "react";
import { ReadonlyURLSearchParams, useSearchParams } from "next/navigation";

// Create a context to expose search params to child components
const SearchParamsContext = createContext<ReadonlyURLSearchParams | null>(null);

// Hook to access search params from anywhere in the component tree
export function useSearchParamsContext() {
    const context = useContext(SearchParamsContext);
    if (!context) {
        throw new Error("useSearchParamsContext must be used within a SearchParamsProvider");
    }
    return context;
}

// This component safely isolates the useSearchParams() hook with a Suspense boundary
export function SearchParamsProvider({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={null}>
            <SearchParamsConsumer>{children}</SearchParamsConsumer>
        </Suspense>
    );
}

// This component consumes the search params and provides them via context
function SearchParamsConsumer({ children }: { children: React.ReactNode }) {
    // This hook is now safely wrapped in Suspense
    const searchParams = useSearchParams();

    return (
        <SearchParamsContext.Provider value={searchParams}>{children}</SearchParamsContext.Provider>
    );
}
