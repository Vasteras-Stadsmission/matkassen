/**
 * Public privacy policy utilities
 * Fetches privacy policy content for the public /privacy page
 */

import { db } from "@/app/db/drizzle";
import { privacyPolicies } from "@/app/db/schema";
import { eq, desc } from "drizzle-orm";

export interface PublicPrivacyPolicy {
    language: string;
    content: string;
    updatedAt: Date;
}

/**
 * Get all languages that have a privacy policy configured
 * Returns unique language codes
 */
export async function getAvailablePrivacyPolicyLanguages(): Promise<string[]> {
    const policies = await db
        .selectDistinct({ language: privacyPolicies.language })
        .from(privacyPolicies);

    return policies.map(p => p.language);
}

/**
 * Get the latest privacy policy for a specific language
 * Falls back to Swedish if the requested language is not found
 */
export async function getPublicPrivacyPolicy(
    language: string,
): Promise<PublicPrivacyPolicy | null> {
    // Try to get the policy in the requested language
    const [policy] = await db
        .select()
        .from(privacyPolicies)
        .where(eq(privacyPolicies.language, language))
        .orderBy(desc(privacyPolicies.created_at))
        .limit(1);

    if (policy) {
        return {
            language: policy.language,
            content: policy.content,
            updatedAt: policy.created_at,
        };
    }

    // Fallback to Swedish
    if (language !== "sv") {
        const [svPolicy] = await db
            .select()
            .from(privacyPolicies)
            .where(eq(privacyPolicies.language, "sv"))
            .orderBy(desc(privacyPolicies.created_at))
            .limit(1);

        if (svPolicy) {
            return {
                language: svPolicy.language,
                content: svPolicy.content,
                updatedAt: svPolicy.created_at,
            };
        }
    }

    return null;
}
