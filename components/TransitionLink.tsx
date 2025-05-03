"use client";

import { forwardRef, useTransition } from "react";
import { useRouter } from "@/app/i18n/navigation";
import PageSkeletonOverlay from "./PageSkeletonOverlay";

interface TransitionLinkProps extends React.ComponentPropsWithoutRef<"a"> {
    href: string;
    children: React.ReactNode;
}

/**
 * A generic link component that shows a skeleton overlay during navigation
 * Similar to NavigationLink but without the label requirement
 */
export const TransitionLink = forwardRef<HTMLAnchorElement, TransitionLinkProps>(
    ({ href, onClick, children, ...props }, ref) => {
        const router = useRouter();
        const [isPending, startTransition] = useTransition();

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
                <a ref={ref} href={href} onClick={handleClick} {...props}>
                    {children}
                </a>
                {isPending && <PageSkeletonOverlay />}
            </>
        );
    },
);

TransitionLink.displayName = "TransitionLink";
