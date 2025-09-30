"use client";

import { notifications } from "@mantine/notifications";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useRouter } from "@/app/i18n/navigation";
import React, { useRef, useCallback } from "react";

interface ActionResult {
    success: boolean;
    error?: string;
}

interface NotificationOptions {
    successTitle?: string;
    successMessage: string;
    errorTitle?: string;
    errorMessage?: string;
    successColor?: string;
    errorColor?: string;
}

/**
 * Custom hook for handling actions with automatic notifications and redirects.
 *
 * Features:
 * - Automatic success/error notification display
 * - URL-based state passing for post-redirect notifications
 * - Duplicate notification prevention in React StrictMode
 * - Automatic URL cleanup after showing notifications
 */
export function useActionWithNotification() {
    const router = useRouter();
    // Track the last shown notification to prevent duplicates in StrictMode
    const lastShownNotificationRef = useRef<string | null>(null);

    /**
     * Handles an action with automatic notification and navigation:
     * - On success: navigates immediately with success state for notification on destination
     * - On error: shows error notification and stays on current page
     */
    const handleActionWithRedirect = async (
        action: () => Promise<ActionResult>,
        successRedirect: string,
        options: NotificationOptions,
    ): Promise<void> => {
        try {
            const result = await action();

            if (result.success) {
                // Navigate immediately with success state
                const url = new URL(
                    successRedirect,
                    typeof window !== "undefined"
                        ? window.location.origin
                        : "http://localhost:3000",
                );
                url.searchParams.set("success", "true");
                url.searchParams.set("message", options.successMessage);
                if (options.successTitle) {
                    url.searchParams.set("title", options.successTitle);
                }

                router.push(url.pathname + url.search);
            } else {
                // Show error notification and stay on page
                notifications.show({
                    title: options.errorTitle || "Error",
                    message: options.errorMessage || result.error || "An error occurred",
                    color: options.errorColor || "red",
                    icon: React.createElement(IconX, { size: "1.1rem" }),
                });
            }
        } catch (error) {
            // Show error notification for unexpected errors
            notifications.show({
                title: options.errorTitle || "Error",
                message: options.errorMessage || "An unexpected error occurred",
                color: options.errorColor || "red",
                icon: React.createElement(IconX, { size: "1.1rem" }),
            });
            console.error("Action failed:", error);
        }
    };

    /**
     * Shows a success notification from URL parameters (to be called on destination pages).
     * Uses a ref to prevent duplicate notifications in React StrictMode.
     */
    const showSuccessFromParams = useCallback((searchParams: URLSearchParams): void => {
        const success = searchParams.get("success");
        const message = searchParams.get("message");
        const title = searchParams.get("title");

        if (success === "true" && message) {
            // Create a unique key for this notification to prevent duplicates (React StrictMode)
            const notificationKey = `${success}-${message}-${title || ""}`;

            // Check if we've already shown this exact notification
            if (lastShownNotificationRef.current === notificationKey) {
                return; // Skip duplicate
            }

            // Mark this notification as shown
            lastShownNotificationRef.current = notificationKey;

            notifications.show({
                title: title || "Success",
                message: message,
                color: "green",
                icon: React.createElement(IconCheck, { size: "1.1rem" }),
            });

            // Clean up URL parameters
            if (typeof window !== "undefined") {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete("success");
                newUrl.searchParams.delete("message");
                newUrl.searchParams.delete("title");

                // Only update URL if we actually removed parameters
                if (window.location.search !== newUrl.search) {
                    window.history.replaceState({}, "", newUrl.pathname + newUrl.search);
                }
            }
        }
    }, []);

    return {
        handleActionWithRedirect,
        showSuccessFromParams,
    };
}
