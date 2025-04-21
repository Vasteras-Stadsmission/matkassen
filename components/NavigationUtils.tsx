import { forwardRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface NavigationLinkProps extends React.ComponentPropsWithoutRef<"a"> {
    label: string;
    active?: boolean;
    className?: string;
    prefetch?: boolean;
}

// Create a reusable Navigation Link component with built-in prefetching
export const NavigationLink = forwardRef<HTMLAnchorElement, NavigationLinkProps>(
    ({ label, active, className, prefetch = true, href, ...others }, ref) => {
        const router = useRouter();

        // Prefetch the linked page if prefetch is true
        useEffect(() => {
            if (prefetch && typeof href === "string" && href.startsWith("/")) {
                router.prefetch(href);
            }
        }, [href, prefetch, router]);

        return (
            <a
                ref={ref}
                className={className}
                data-active={active || undefined}
                href={href}
                {...others}
            >
                <span>{label}</span>
            </a>
        );
    },
);

NavigationLink.displayName = "NavigationLink";

// Using CustomEvent with bubbles: true to ensure it propagates properly
export const dispatchNavigationStart = () => {
    const event = new CustomEvent("navigation-start", {
        bubbles: true,
        cancelable: true,
        detail: { timestamp: Date.now() },
    });
    document.dispatchEvent(event);
};

export const enhanceNextNavigation = (router: unknown) => {
    if (!router || typeof (router as Record<string, unknown>).push !== "function") {
        console.warn("Router not available or does not have push method");
        return router;
    }

    // Store original methods
    const typedRouter = router as {
        push: (...args: unknown[]) => unknown;
        replace: (...args: unknown[]) => unknown;
    };

    const originalPush = typedRouter.push;
    const originalReplace = typedRouter.replace;

    // Override router.push to dispatch event before navigation
    typedRouter.push = function (...args: unknown[]) {
        dispatchNavigationStart();
        return originalPush.apply(this, args);
    };

    // Override router.replace to dispatch event before navigation
    typedRouter.replace = function (...args: unknown[]) {
        dispatchNavigationStart();
        return originalReplace.apply(this, args);
    };

    return router;
};
