import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPublicPrivacyPolicy } from "@/app/utils/public-privacy-policy";

// Mock the database
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/app/db/drizzle", () => ({
    db: {
        select: () => ({
            from: (table: unknown) => ({
                where: (condition: unknown) => ({
                    orderBy: (order: unknown) => ({
                        limit: (n: number) => mockLimit(n),
                    }),
                }),
            }),
        }),
    },
}));

vi.mock("@/app/db/schema", () => ({
    privacyPolicies: {
        language: "language",
        created_at: "created_at",
    },
}));

vi.mock("drizzle-orm", () => ({
    eq: (col: unknown, val: unknown) => ({ col, val }),
    desc: (col: unknown) => ({ col, direction: "desc" }),
}));

describe("getPublicPrivacyPolicy", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should return policy when found in requested language", async () => {
        const mockPolicy = {
            language: "en",
            content: "English privacy policy content",
            created_at: new Date("2024-01-15"),
        };

        mockLimit.mockResolvedValueOnce([mockPolicy]);

        const result = await getPublicPrivacyPolicy("en");

        expect(result).toEqual({
            language: "en",
            content: "English privacy policy content",
            updatedAt: mockPolicy.created_at,
        });
    });

    it("should fallback to Swedish when requested language not found", async () => {
        const mockSvPolicy = {
            language: "sv",
            content: "Swedish privacy policy content",
            created_at: new Date("2024-01-10"),
        };

        // First call returns empty (no German policy)
        mockLimit.mockResolvedValueOnce([]);
        // Second call returns Swedish policy
        mockLimit.mockResolvedValueOnce([mockSvPolicy]);

        const result = await getPublicPrivacyPolicy("de");

        expect(result).toEqual({
            language: "sv",
            content: "Swedish privacy policy content",
            updatedAt: mockSvPolicy.created_at,
        });
    });

    it("should return null when no policy exists", async () => {
        // First call returns empty
        mockLimit.mockResolvedValueOnce([]);
        // Swedish fallback also returns empty
        mockLimit.mockResolvedValueOnce([]);

        const result = await getPublicPrivacyPolicy("fr");

        expect(result).toBeNull();
    });

    it("should not attempt fallback when Swedish is requested but not found", async () => {
        mockLimit.mockResolvedValueOnce([]);

        const result = await getPublicPrivacyPolicy("sv");

        expect(result).toBeNull();
        // Should only be called once (no fallback for sv)
        expect(mockLimit).toHaveBeenCalledTimes(1);
    });

    it("should return the latest policy based on created_at", async () => {
        const latestPolicy = {
            language: "en",
            content: "Latest version",
            created_at: new Date("2024-06-01"),
        };

        mockLimit.mockResolvedValueOnce([latestPolicy]);

        const result = await getPublicPrivacyPolicy("en");

        expect(result?.content).toBe("Latest version");
        expect(result?.updatedAt).toEqual(new Date("2024-06-01"));
    });
});
