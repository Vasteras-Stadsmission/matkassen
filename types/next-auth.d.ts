/**
 * TypeScript type augmentation for NextAuth
 * Extends the default session types to include GitHub-specific fields
 */

import "next-auth";
import "next-auth/jwt";

type OrgEligibilityStatus =
    | "ok"
    | "unauthenticated"
    | "not_member"
    | "membership_inactive"
    | "org_resource_forbidden"
    | "rate_limited"
    | "github_error"
    | "configuration_error";

type OrgEligibility = {
    ok: boolean;
    status: OrgEligibilityStatus;
    checkedAt: number;
    nextCheckAt: number;
    httpStatus?: number;
    message?: string;
};

declare module "next-auth" {
    /**
     * Extended session interface with GitHub username
     */
    interface Session {
        user: {
            /** GitHub login/username (e.g., "johndoe123") - used for API calls and DB records */
            githubUsername?: string;
            /** Server-evaluated org eligibility (membership + org security policy enforcement) */
            orgEligibility?: OrgEligibility;
            /** Display name from GitHub profile (e.g., "John Doe") - used for UI display */
            name?: string | null;
            email?: string | null;
            image?: string | null;
        };
    }

    /**
     * Extended user interface (used during sign-in)
     */
    interface User {
        githubUsername?: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    }
}

declare module "next-auth/jwt" {
    /**
     * Extended JWT token interface
     */
    interface JWT {
        /** GitHub login/username preserved from OAuth profile */
        githubUsername?: string;
        /** GitHub OAuth access token stored in encrypted JWT (server-only) */
        githubAccessToken?: string;
        /** Cached org eligibility result (membership + org security policy enforcement) */
        orgEligibility?: OrgEligibility;
        name?: string | null;
        email?: string | null;
        picture?: string | null;
    }
}
