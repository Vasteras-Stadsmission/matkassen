/**
 * Tests for action-result utilities including isAgreementRequired.
 */

import { describe, it, expect } from "vitest";
import {
    success,
    failure,
    isAgreementRequired,
    type ActionResult,
} from "@/app/utils/auth/action-result";

describe("isAgreementRequired", () => {
    it("should return true for AGREEMENT_REQUIRED error", () => {
        const result: ActionResult<string> = failure({
            code: "AGREEMENT_REQUIRED",
            message: "Agreement acceptance required",
        });
        expect(isAgreementRequired(result)).toBe(true);
    });

    it("should return true for AGREEMENT_CHECK_FAILED error", () => {
        const result: ActionResult<string> = failure({
            code: "AGREEMENT_CHECK_FAILED",
            message: "Failed to verify agreement status",
        });
        expect(isAgreementRequired(result)).toBe(true);
    });

    it("should return false for other error codes", () => {
        const result: ActionResult<string> = failure({
            code: "UNAUTHORIZED",
            message: "Not authenticated",
        });
        expect(isAgreementRequired(result)).toBe(false);
    });

    it("should return false for successful results", () => {
        const result: ActionResult<string> = success("ok");
        expect(isAgreementRequired(result)).toBe(false);
    });

    it("should return false for validation errors", () => {
        const result: ActionResult<string> = failure({
            code: "VALIDATION_ERROR",
            message: "Invalid input",
        });
        expect(isAgreementRequired(result)).toBe(false);
    });
});
