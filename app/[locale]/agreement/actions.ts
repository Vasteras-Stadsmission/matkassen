"use server";

import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import {
    getCurrentAgreement,
    getUserAgreementStatus,
    getUserIdByGithubUsername,
    recordAgreementAcceptance,
} from "@/app/utils/user-agreement";
import { logError } from "@/app/utils/logger";

export interface AgreementForAcceptance {
    id: string;
    content: string;
    version: number;
    effectiveFrom: Date;
    hasAccepted: boolean;
    acceptedAt: Date | null;
}

/**
 * Get the current agreement and the user's acceptance status
 */
export const getAgreementForAcceptance = protectedAction(
    async (session): Promise<ActionResult<AgreementForAcceptance | null>> => {
        try {
            const githubUsername = session.user?.githubUsername;
            if (!githubUsername) {
                return failure({ code: "AUTH_ERROR", message: "User not authenticated" });
            }

            const userId = await getUserIdByGithubUsername(githubUsername);
            if (!userId) {
                return failure({ code: "USER_NOT_FOUND", message: "User not found" });
            }

            const status = await getUserAgreementStatus(userId);

            if (!status.currentAgreement) {
                return success(null);
            }

            return success({
                id: status.currentAgreement.id,
                content: status.currentAgreement.content,
                version: status.currentAgreement.version,
                effectiveFrom: status.currentAgreement.effectiveFrom,
                hasAccepted: status.hasAccepted,
                acceptedAt: status.acceptedAt,
            });
        } catch (error) {
            logError("Error fetching agreement for acceptance", error);
            return failure({ code: "FETCH_FAILED", message: "Failed to fetch agreement" });
        }
    },
);

/**
 * Accept the current agreement
 */
export const acceptAgreement = protectedAction(
    async (session, agreementId: string): Promise<ActionResult<void>> => {
        try {
            const githubUsername = session.user?.githubUsername;
            if (!githubUsername) {
                return failure({ code: "AUTH_ERROR", message: "User not authenticated" });
            }

            const userId = await getUserIdByGithubUsername(githubUsername);
            if (!userId) {
                return failure({ code: "USER_NOT_FOUND", message: "User not found" });
            }

            // Verify this is the current agreement
            const currentAgreement = await getCurrentAgreement();
            if (!currentAgreement || currentAgreement.id !== agreementId) {
                return failure({
                    code: "INVALID_AGREEMENT",
                    message: "Invalid agreement - a newer version may be available",
                });
            }

            await recordAgreementAcceptance(userId, agreementId);
            return success(undefined);
        } catch (error) {
            logError("Error accepting agreement", error);
            return failure({ code: "ACCEPT_FAILED", message: "Failed to accept agreement" });
        }
    },
);
