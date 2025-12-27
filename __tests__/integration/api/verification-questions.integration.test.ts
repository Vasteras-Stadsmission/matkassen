/**
 * Integration tests for /api/admin/verification-questions route.
 *
 * Tests the ACTUAL database query behavior:
 * 1. Only active questions are returned (is_active = true filter)
 * 2. Questions are ordered by display_order ascending
 * 3. Empty array when no active questions exist
 *
 * Note: Auth is mocked since we're testing DB behavior, not auth.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    createTestVerificationQuestion,
    createTestInactiveQuestion,
    resetQuestionCounter,
} from "../../factories";

// Mock auth to always succeed - we're testing DB behavior, not auth
vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(() =>
        Promise.resolve({
            success: true,
            session: { user: { id: "test-admin", role: "admin" } },
        }),
    ),
}));

// Import the route handler AFTER mocking auth
import { GET } from "@/app/api/admin/verification-questions/route";

describe("GET /api/admin/verification-questions - Integration Tests", () => {
    beforeEach(() => {
        resetQuestionCounter();
    });

    it("should return only active questions", async () => {
        // Create mix of active and inactive questions
        const activeQ1 = await createTestVerificationQuestion({
            question_text_sv: "Aktiv fråga 1",
            question_text_en: "Active question 1",
            display_order: 1,
        });
        const activeQ2 = await createTestVerificationQuestion({
            question_text_sv: "Aktiv fråga 2",
            question_text_en: "Active question 2",
            display_order: 2,
        });
        await createTestInactiveQuestion({
            question_text_sv: "Inaktiv fråga",
            question_text_en: "Inactive question",
            display_order: 3,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveLength(2);
        expect(data.map((q: any) => q.id)).toEqual([activeQ1.id, activeQ2.id]);
        expect(data.every((q: any) => q.is_active === true)).toBe(true);
    });

    it("should order questions by display_order ascending", async () => {
        // Create questions out of order
        const q3 = await createTestVerificationQuestion({
            question_text_sv: "Fråga tre",
            display_order: 30,
        });
        const q1 = await createTestVerificationQuestion({
            question_text_sv: "Fråga ett",
            display_order: 10,
        });
        const q2 = await createTestVerificationQuestion({
            question_text_sv: "Fråga två",
            display_order: 20,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveLength(3);
        // Should be ordered by display_order: q1 (10), q2 (20), q3 (30)
        expect(data[0].id).toBe(q1.id);
        expect(data[0].display_order).toBe(10);
        expect(data[1].id).toBe(q2.id);
        expect(data[1].display_order).toBe(20);
        expect(data[2].id).toBe(q3.id);
        expect(data[2].display_order).toBe(30);
    });

    it("should handle optional fields (null help text, non-required)", async () => {
        await createTestVerificationQuestion({
            question_text_sv: "Valfri fråga",
            question_text_en: "Optional question",
            help_text_sv: null,
            help_text_en: null,
            is_required: false,
            display_order: 1,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveLength(1);
        expect(data[0].help_text_sv).toBeNull();
        expect(data[0].help_text_en).toBeNull();
        expect(data[0].is_required).toBe(false);
    });

    it("should return empty array when no active questions exist", async () => {
        // Create only inactive questions
        await createTestInactiveQuestion({
            question_text_sv: "Inaktiv fråga 1",
        });
        await createTestInactiveQuestion({
            question_text_sv: "Inaktiv fråga 2",
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual([]);
    });

    it("should return empty array when no questions exist at all", async () => {
        // No questions created
        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual([]);
    });

    it("should return all fields for each question", async () => {
        await createTestVerificationQuestion({
            question_text_sv: "Svensk fråga",
            question_text_en: "English question",
            help_text_sv: "Svensk hjälp",
            help_text_en: "English help",
            is_required: true,
            display_order: 1,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveLength(1);

        const question = data[0];
        expect(question).toHaveProperty("id");
        expect(question).toHaveProperty("question_text_sv", "Svensk fråga");
        expect(question).toHaveProperty("question_text_en", "English question");
        expect(question).toHaveProperty("help_text_sv", "Svensk hjälp");
        expect(question).toHaveProperty("help_text_en", "English help");
        expect(question).toHaveProperty("is_required", true);
        expect(question).toHaveProperty("display_order", 1);
        expect(question).toHaveProperty("is_active", true);
        expect(question).toHaveProperty("created_at");
        expect(question).toHaveProperty("updated_at");
    });

    it("should not leak inactive questions even when many exist", async () => {
        // Create many inactive questions
        for (let i = 0; i < 10; i++) {
            await createTestInactiveQuestion({
                question_text_sv: `Inaktiv ${i}`,
                display_order: i,
            });
        }

        // Create one active question
        const activeQ = await createTestVerificationQuestion({
            question_text_sv: "Den enda aktiva",
            display_order: 100,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveLength(1);
        expect(data[0].id).toBe(activeQ.id);
    });
});
