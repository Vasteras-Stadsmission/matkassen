/**
 * Integration tests for privacy policy utilities.
 *
 * Tests the ACTUAL database query behavior:
 * 1. Returns policy in requested language
 * 2. Falls back to Swedish when requested language not found
 * 3. Returns latest policy based on created_at (DESC order)
 * 4. Returns null when no policy exists
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrivacyPolicy, resetPolicyCounter } from "../../factories";
import {
    getPublicPrivacyPolicy,
    getAvailablePrivacyPolicyLanguages,
} from "@/app/utils/public-privacy-policy";

describe("Privacy Policy Utilities - Integration Tests", () => {
    beforeEach(() => {
        resetPolicyCounter();
    });

    describe("getPublicPrivacyPolicy", () => {
        it("should return policy in requested language", async () => {
            await createTestPrivacyPolicy({
                language: "en",
                content: "English privacy policy",
            });

            const result = await getPublicPrivacyPolicy("en");

            expect(result).not.toBeNull();
            expect(result?.language).toBe("en");
            expect(result?.content).toBe("English privacy policy");
            expect(result?.updatedAt).toBeInstanceOf(Date);
        });

        it("should fallback to Swedish when requested language not found", async () => {
            await createTestPrivacyPolicy({
                language: "sv",
                content: "Swedish privacy policy",
            });

            // Request German, should fallback to Swedish
            const result = await getPublicPrivacyPolicy("de");

            expect(result).not.toBeNull();
            expect(result?.language).toBe("sv");
            expect(result?.content).toBe("Swedish privacy policy");
        });

        it("should return null when no policy exists at all", async () => {
            // No policies created
            const result = await getPublicPrivacyPolicy("en");

            expect(result).toBeNull();
        });

        it("should return null when Swedish requested but not found", async () => {
            // Only English policy exists
            await createTestPrivacyPolicy({
                language: "en",
                content: "English only",
            });

            // Request Swedish - should return null (no fallback for sv)
            const result = await getPublicPrivacyPolicy("sv");

            expect(result).toBeNull();
        });

        it("should return the latest policy when multiple versions exist", async () => {
            // Create older version first
            const olderDate = new Date("2024-01-01");
            await createTestPrivacyPolicy({
                language: "en",
                content: "Old version",
                created_at: olderDate,
            });

            // Create newer version
            const newerDate = new Date("2024-06-01");
            await createTestPrivacyPolicy({
                language: "en",
                content: "New version",
                created_at: newerDate,
            });

            const result = await getPublicPrivacyPolicy("en");

            expect(result).not.toBeNull();
            expect(result?.content).toBe("New version");
            expect(result?.updatedAt).toEqual(newerDate);
        });

        it("should return correct language policy even when multiple languages exist", async () => {
            await createTestPrivacyPolicy({
                language: "sv",
                content: "Swedish policy",
            });
            await createTestPrivacyPolicy({
                language: "en",
                content: "English policy",
            });
            await createTestPrivacyPolicy({
                language: "de",
                content: "German policy",
            });

            const svResult = await getPublicPrivacyPolicy("sv");
            const enResult = await getPublicPrivacyPolicy("en");
            const deResult = await getPublicPrivacyPolicy("de");

            expect(svResult?.content).toBe("Swedish policy");
            expect(enResult?.content).toBe("English policy");
            expect(deResult?.content).toBe("German policy");
        });

        it("should prefer exact language match over Swedish fallback", async () => {
            await createTestPrivacyPolicy({
                language: "sv",
                content: "Swedish policy",
            });
            await createTestPrivacyPolicy({
                language: "en",
                content: "English policy",
            });

            // Request English - should get English, not fallback to Swedish
            const result = await getPublicPrivacyPolicy("en");

            expect(result?.language).toBe("en");
            expect(result?.content).toBe("English policy");
        });
    });

    describe("getAvailablePrivacyPolicyLanguages", () => {
        it("should return empty array when no policies exist", async () => {
            const languages = await getAvailablePrivacyPolicyLanguages();

            expect(languages).toEqual([]);
        });

        it("should return unique language codes", async () => {
            await createTestPrivacyPolicy({ language: "sv" });
            await createTestPrivacyPolicy({ language: "en" });
            await createTestPrivacyPolicy({ language: "de" });

            const languages = await getAvailablePrivacyPolicyLanguages();

            expect(languages).toHaveLength(3);
            expect(languages).toContain("sv");
            expect(languages).toContain("en");
            expect(languages).toContain("de");
        });

        it("should not duplicate languages with multiple versions", async () => {
            // Create multiple versions of same language
            await createTestPrivacyPolicy({
                language: "sv",
                content: "Version 1",
                created_at: new Date("2024-01-01"),
            });
            await createTestPrivacyPolicy({
                language: "sv",
                content: "Version 2",
                created_at: new Date("2024-06-01"),
            });

            const languages = await getAvailablePrivacyPolicyLanguages();

            expect(languages).toHaveLength(1);
            expect(languages).toEqual(["sv"]);
        });
    });
});
