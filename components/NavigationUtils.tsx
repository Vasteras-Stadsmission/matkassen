"use client";

import { useEffect, forwardRef, useTransition } from "react";
import { useRouter } from "@/app/i18n/navigation";
import PageSkeletonOverlay from "./PageSkeletonOverlay";

interface NavigationLinkProps extends React.ComponentPropsWithoutRef<"a"> {
    label: string;
    active?: boolean;
    className?: string;
    prefetch?: boolean;
}

/**
 * A navigation link component that shows a skeleton overlay during navigation
 * Uses React's useTransition to properly track pending state changes
 */
export const NavigationLink = forwardRef<HTMLAnchorElement, NavigationLinkProps>(
    ({ label, active, className, prefetch = true, href, onClick, ...others }, ref) => {
        const router = useRouter();
        const [isPending, startTransition] = useTransition();

        // Prefetch the linked page if prefetch is true
        useEffect(() => {
            if (prefetch && typeof href === "string" && href.startsWith("/")) {
                router.prefetch(href);
            }
        }, [href, prefetch, router]);

        const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (onClick) {
                onClick(e);
            }

            if (!e.defaultPrevented && typeof href === "string" && href.startsWith("/")) {
                e.preventDefault();
                startTransition(() => {
                    router.push(href);
                });
            }
        };

        return (
            <>
                <a
                    ref={ref}
                    className={className}
                    data-active={active || undefined}
                    href={href}
                    onClick={handleClick}
                    {...others}
                >
                    <span>{label}</span>
                </a>
                {isPending && <PageSkeletonOverlay />}
            </>
        );
    },
);

NavigationLink.displayName = "NavigationLink";

// This function is no longer needed with the useTransition approach
export const dispatchNavigationStart = () => {
    console.warn("dispatchNavigationStart is deprecated, use the NavigationLink component instead");
};

// This function is no longer needed with the useTransition approach
export const enhanceNextNavigation = (router: unknown) => {
    console.warn("enhanceNextNavigation is deprecated, use the NavigationLink component instead");
    return router;
};
