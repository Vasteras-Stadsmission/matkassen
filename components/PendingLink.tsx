"use client";

import { useRouter, Link } from "@/app/i18n/navigation";
import { useTransition } from "react";
import PageSkeletonOverlay from "./PageSkeletonOverlay";

interface PendingLinkProps {
    href: string;
    children: React.ReactNode;
    className?: string;
}

/**
 * A Link component that shows a skeleton overlay during navigation
 * Uses React's useTransition to properly track pending state changes
 */
export function PendingLink({ href, children, className }: PendingLinkProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    return (
        <>
            <Link
                href={href}
                className={className}
                onClick={e => {
                    e.preventDefault();
                    startTransition(() => router.push(href));
                }}
            >
                {children}
            </Link>
            {isPending && <PageSkeletonOverlay />}
        </>
    );
}
