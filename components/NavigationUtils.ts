"use client";

import { forwardRef } from 'react';
import { Text, Box } from '@mantine/core';

/**
 * Utility functions for handling navigation events
 */

export const dispatchNavigationStart = () => {
    // Using CustomEvent with bubbles: true to ensure it propagates properly
    const event = new CustomEvent("navigation-start", {
        bubbles: true,
        cancelable: true,
        detail: { timestamp: Date.now() },
    });
    document.dispatchEvent(event);
    console.log("Navigation event dispatched"); // Debug log
};

export const enhanceNextNavigation = (router: any) => {
    if (!router || typeof router.push !== "function") {
        console.warn("Router not available or does not have push method");
        return router;
    }

    // Store original methods
    const originalPush = router.push;
    const originalReplace = router.replace;

    // Override router.push to dispatch event before navigation
    router.push = function (...args: any[]) {
        const path = args[0];
        console.log(`Navigation to: ${path}`);
        dispatchNavigationStart();
        return originalPush.apply(this, args);
    };

    // Override router.replace to dispatch event before navigation
    router.replace = function (...args: any[]) {
        const path = args[0];
        console.log(`Navigation replace to: ${path}`);
        dispatchNavigationStart();
        return originalReplace.apply(this, args);
    };

    console.log("Next.js router enhanced for navigation events");
    return router;
};

interface NavigationLinkProps extends React.ComponentPropsWithoutRef<'a'> {
  label: string;
  active?: boolean;
  className?: string;
}

// Create a reusable Navigation Link component
export const NavigationLink = forwardRef<HTMLAnchorElement, NavigationLinkProps>(
  ({ label, active, className, ...others }, ref) => {
    return (
      <Box
        component="a"
        ref={ref}
        className={className}
        data-active={active || undefined}
        {...others}
      >
        <Text component="span">{label}</Text>
      </Box>
    );
  }
);
