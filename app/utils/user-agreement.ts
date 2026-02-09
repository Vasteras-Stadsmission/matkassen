/**
 * User agreement utilities for GDPR compliance (PuB - Personuppgiftsbiträdesavtal)
 * Handles checking and recording user agreement acceptance
 */

import { db } from "@/app/db/drizzle";
import { userAgreements, userAgreementAcceptances, users } from "@/app/db/schema";
import { eq, desc, and, lte, count } from "drizzle-orm";

export interface UserAgreement {
    id: string;
    content: string;
    version: number;
    effectiveFrom: Date;
    createdAt: Date;
    createdBy: string | null;
}

export interface UserAgreementStatus {
    currentAgreement: UserAgreement | null;
    hasAccepted: boolean;
    acceptedAt: Date | null;
}

/**
 * Get the current (latest effective) user agreement
 * Only returns agreements that are effective now or in the past
 */
export async function getCurrentAgreement(): Promise<UserAgreement | null> {
    const now = new Date();

    const [agreement] = await db
        .select()
        .from(userAgreements)
        .where(lte(userAgreements.effective_from, now))
        .orderBy(desc(userAgreements.effective_from), desc(userAgreements.created_at))
        .limit(1);

    if (!agreement) {
        return null;
    }

    return {
        id: agreement.id,
        content: agreement.content,
        version: agreement.version,
        effectiveFrom: agreement.effective_from,
        createdAt: agreement.created_at,
        createdBy: agreement.created_by,
    };
}

/**
 * Check if a user has accepted the current agreement
 */
export async function hasUserAcceptedCurrentAgreement(userId: string): Promise<boolean> {
    const currentAgreement = await getCurrentAgreement();

    // No agreement exists yet - user doesn't need to accept anything
    if (!currentAgreement) {
        return true;
    }

    const [acceptance] = await db
        .select()
        .from(userAgreementAcceptances)
        .where(
            and(
                eq(userAgreementAcceptances.user_id, userId),
                eq(userAgreementAcceptances.agreement_id, currentAgreement.id),
            ),
        )
        .limit(1);

    return !!acceptance;
}

/**
 * Get full agreement status for a user
 */
export async function getUserAgreementStatus(userId: string): Promise<UserAgreementStatus> {
    const currentAgreement = await getCurrentAgreement();

    if (!currentAgreement) {
        return {
            currentAgreement: null,
            hasAccepted: true, // No agreement = nothing to accept
            acceptedAt: null,
        };
    }

    const [acceptance] = await db
        .select()
        .from(userAgreementAcceptances)
        .where(
            and(
                eq(userAgreementAcceptances.user_id, userId),
                eq(userAgreementAcceptances.agreement_id, currentAgreement.id),
            ),
        )
        .limit(1);

    return {
        currentAgreement,
        hasAccepted: !!acceptance,
        acceptedAt: acceptance?.accepted_at ?? null,
    };
}

/**
 * Get user ID from GitHub username
 */
export async function getUserIdByGithubUsername(githubUsername: string): Promise<string | null> {
    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.github_username, githubUsername))
        .limit(1);

    return user?.id ?? null;
}

/**
 * Record a user's acceptance of an agreement
 */
export async function recordAgreementAcceptance(
    userId: string,
    agreementId: string,
): Promise<void> {
    await db
        .insert(userAgreementAcceptances)
        .values({
            user_id: userId,
            agreement_id: agreementId,
        })
        .onConflictDoNothing(); // Idempotent - if already accepted, do nothing
}

/**
 * Get the next version number for a new agreement
 */
export async function getNextAgreementVersion(): Promise<number> {
    const [latest] = await db
        .select({ version: userAgreements.version })
        .from(userAgreements)
        .orderBy(desc(userAgreements.version))
        .limit(1);

    return (latest?.version ?? 0) + 1;
}

/**
 * Maximum allowed content length for agreements (100KB)
 */
export const MAX_AGREEMENT_CONTENT_LENGTH = 100_000;

/**
 * Create a new agreement version
 * Uses a transaction to prevent race conditions in version numbering
 */
export async function createAgreement(
    content: string,
    createdBy: string,
    effectiveFrom?: Date,
): Promise<UserAgreement> {
    return await db.transaction(async (tx) => {
        const [latest] = await tx
            .select({ version: userAgreements.version })
            .from(userAgreements)
            .orderBy(desc(userAgreements.version))
            .limit(1);

        const version = (latest?.version ?? 0) + 1;

        const [agreement] = await tx
            .insert(userAgreements)
            .values({
                content,
                version,
                effective_from: effectiveFrom ?? new Date(),
                created_by: createdBy,
            })
            .returning();

        return {
            id: agreement.id,
            content: agreement.content,
            version: agreement.version,
            effectiveFrom: agreement.effective_from,
            createdAt: agreement.created_at,
            createdBy: agreement.created_by,
        };
    });
}

/**
 * Check if a user has accepted a specific agreement by ID
 * Unlike hasUserAcceptedCurrentAgreement, this doesn't re-fetch the current agreement
 */
export async function hasUserAcceptedAgreement(userId: string, agreementId: string): Promise<boolean> {
    const [acceptance] = await db
        .select()
        .from(userAgreementAcceptances)
        .where(
            and(
                eq(userAgreementAcceptances.user_id, userId),
                eq(userAgreementAcceptances.agreement_id, agreementId),
            ),
        )
        .limit(1);

    return !!acceptance;
}

/**
 * Get acceptance count for an agreement (for admin stats)
 */
export async function getAgreementAcceptanceCount(agreementId: string): Promise<number> {
    const [result] = await db
        .select({ value: count() })
        .from(userAgreementAcceptances)
        .where(eq(userAgreementAcceptances.agreement_id, agreementId));

    return result?.value ?? 0;
}
