/**
 * TypeScript type augmentation for NextAuth
 * Extends the default session types to include GitHub-specific fields
 */

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
    /**
     * Extended session interface with GitHub username
     */
    interface Session {
        user: {
            /** GitHub login/username (e.g., "johndoe123") - used for API calls and DB records */
            githubUsername?: string;
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
        name?: string | null;
        email?: string | null;
        picture?: string | null;
    }
}
