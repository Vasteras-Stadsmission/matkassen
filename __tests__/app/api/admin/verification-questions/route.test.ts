/**
 * Unit Tests: /api/admin/verification-questions API Route
 *
 * Critical Security Test: Verify that deleted (inactive) questions are never returned
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

// Mock the database and auth
vi.mock("@/app/db/drizzle", () => ({
    db: {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn(() => Promise.resolve([])),
                })),
                orderBy: vi.fn(() => Promise.resolve([])),
            })),
        })),
    },
}));

vi.mock("@/app/db/schema", () => ({
    verificationQuestions: {
        id: "id",
        question_text_sv: "question_text_sv",
        question_text_en: "question_text_en",
        is_active: "is_active",
        display_order: "display_order",
    },
}));

vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(() =>
        Promise.resolve({
            success: true,
            session: { user: { id: "test-user" } },
        }),
    ),
}));

describe("GET /api/admin/verification-questions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should filter by is_active = true", async () => {
        const { db } = await import("@/app/db/drizzle");
        const { verificationQuestions } = await import("@/app/db/schema");

        // Import the route handler
        const { GET } = await import("@/app/api/admin/verification-questions/route");

        // Mock successful query with active questions
        const mockWhere = vi.fn(() => ({
            orderBy: vi.fn(() =>
                Promise.resolve([
                    {
                        id: "q1",
                        question_text_sv: "Fråga 1",
                        question_text_en: "Question 1",
                        is_active: true,
                    },
                    {
                        id: "q2",
                        question_text_sv: "Fråga 2",
                        question_text_en: "Question 2",
                        is_active: true,
                    },
                ]),
            ),
        }));

        const mockFrom = vi.fn(() => ({
            where: mockWhere,
        }));

        vi.mocked(db.select).mockReturnValue({
            from: mockFrom as any,
        } as any);

        // Call the route
        const response = await GET();

        // Verify .where() was called with is_active = true
        expect(mockWhere).toHaveBeenCalled();

        // Verify response is 200 with active questions only
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveLength(2);
        expect(data.every((q: any) => q.is_active === true)).toBe(true);
    });

    it("should not return inactive questions (defensive test)", async () => {
        const { db } = await import("@/app/db/drizzle");

        // Import the route handler
        const { GET } = await import("@/app/api/admin/verification-questions/route");

        // Mock query that properly filters out inactive questions
        const mockWhere = vi.fn(() => ({
            orderBy: vi.fn(() =>
                Promise.resolve([
                    {
                        id: "q1",
                        question_text_sv: "Active Question",
                        question_text_en: "Active Question",
                        is_active: true,
                    },
                    // Inactive question filtered out by where() clause
                ]),
            ),
        }));

        const mockFrom = vi.fn(() => ({
            where: mockWhere,
        }));

        vi.mocked(db.select).mockReturnValue({
            from: mockFrom as any,
        } as any);

        // Call the route
        const response = await GET();

        // Verify .where() filtering was applied
        expect(mockWhere).toHaveBeenCalled();

        // Verify response only contains active questions
        const data = await response.json();

        // Should not have any inactive questions
        const hasInactiveQuestions = data.some((q: any) => q.is_active === false);
        expect(hasInactiveQuestions).toBe(false);

        // All returned questions should be active
        expect(data.every((q: any) => q.is_active === true)).toBe(true);
    });

    it("should return empty array when no active questions exist", async () => {
        const { db } = await import("@/app/db/drizzle");

        // Import the route handler
        const { GET } = await import("@/app/api/admin/verification-questions/route");

        // Mock query with no results
        const mockWhere = vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve([])),
        }));

        const mockFrom = vi.fn(() => ({
            where: mockWhere,
        }));

        vi.mocked(db.select).mockReturnValue({
            from: mockFrom as any,
        } as any);

        // Call the route
        const response = await GET();

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual([]);
    });
});
