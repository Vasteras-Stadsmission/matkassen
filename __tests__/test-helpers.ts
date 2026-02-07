import { vi } from "vitest";
import type { Session } from "next-auth";

/**
 * Test helper functions for mocking dependencies in tests
 */

/**
 * Create a mock session for testing
 * Includes both githubUsername (for API/DB) and name (for display)
 */
export function createMockSession(options?: {
    githubUsername?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
}): Session {
    return {
        user: {
            githubUsername: options?.githubUsername ?? "testuser",
            orgEligibility: {
                ok: true,
                status: "ok",
                checkedAt: 1,
                nextCheckAt: Number.MAX_SAFE_INTEGER,
            },
            name: options?.name ?? options?.githubUsername ?? "testuser",
            email: options?.email ?? "test@example.com",
            image: options?.image ?? null,
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
    };
}

/**
 * Create a mock session with display name different from login
 * This simulates the bug scenario where name !== githubUsername
 */
export function createMockSessionWithDisplayName(): Session {
    return createMockSession({
        githubUsername: "johndoe123",
        name: "John Doe",
        email: "john@example.com",
    });
}

/**
 * Create a mock session without a display name
 * GitHub users without a display name set
 */
export function createMockSessionWithoutDisplayName(): Session {
    return createMockSession({
        githubUsername: "johndoe123",
        name: null,
        email: "john@example.com",
    });
}

/**
 * Create a mock GitHub profile from OAuth callback
 */
export function createMockGitHubProfile(options?: {
    login?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
}) {
    return {
        login: options?.login ?? "testuser",
        name: options?.name ?? "Test User",
        email: options?.email ?? "test@example.com",
        avatar_url: options?.avatar_url ?? "https://github.com/avatar.png",
        id: 12345,
        node_id: "MDQ6VXNlcjEyMzQ1",
        type: "User",
    };
}
