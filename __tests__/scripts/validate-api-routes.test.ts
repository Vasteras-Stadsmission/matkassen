import { describe, it, expect, beforeEach, vi } from "vitest";
import { join } from "path";

/**
 * Tests for validate-api-routes.mjs path normalization
 *
 * REGRESSION TEST for: Windows path separator bug
 * The script must normalize backslashes to forward slashes
 * to correctly identify public routes on Windows systems.
 */

describe("validate-api-routes path normalization", () => {
    const mockRootDir = "/Users/test/project";

    // Simulate the isPublicRoute function with path normalization
    const PUBLIC_API_PATHS = ["app/api/auth/", "app/api/health", "app/api/csp-report"];

    function isPublicRoute(filePath: string, rootDir: string): boolean {
        // This is the FIXED version with path normalization and proper segment matching
        const relative = filePath.replace(rootDir, "").replace(/^[/\\]/, "");
        const normalizedPath = relative.replace(/\\/g, "/");
        return PUBLIC_API_PATHS.some(publicPath => {
            // Use exact prefix matching with proper path segment handling
            if (publicPath.endsWith("/")) {
                return normalizedPath.startsWith(publicPath);
            }
            return normalizedPath === publicPath || normalizedPath.startsWith(publicPath + "/");
        });
    }

    describe("Unix-style paths", () => {
        it("should identify auth routes as public", () => {
            const authPath = join(mockRootDir, "app/api/auth/[...nextAuth]/route.ts");
            expect(isPublicRoute(authPath, mockRootDir)).toBe(true);
        });

        it("should identify health check as public", () => {
            const healthPath = join(mockRootDir, "app/api/health/route.ts");
            expect(isPublicRoute(healthPath, mockRootDir)).toBe(true);
        });

        it("should identify CSP report as public", () => {
            const cspPath = join(mockRootDir, "app/api/csp-report/route.ts");
            expect(isPublicRoute(cspPath, mockRootDir)).toBe(true);
        });

        it("should identify admin routes as NOT public", () => {
            const adminPath = join(mockRootDir, "app/api/admin/households/route.ts");
            expect(isPublicRoute(adminPath, mockRootDir)).toBe(false);
        });
    });

    describe("Windows-style paths (regression test)", () => {
        it("should identify auth routes with backslashes as public", () => {
            // Simulate Windows path from path.relative()
            const windowsPath = "app\\api\\auth\\[...nextAuth]\\route.ts";
            const fullPath = mockRootDir + "\\" + windowsPath;
            expect(isPublicRoute(fullPath, mockRootDir)).toBe(true);
        });

        it("should identify health check with backslashes as public", () => {
            const windowsPath = "app\\api\\health\\route.ts";
            const fullPath = mockRootDir + "\\" + windowsPath;
            expect(isPublicRoute(fullPath, mockRootDir)).toBe(true);
        });

        it("should identify CSP report with backslashes as public", () => {
            const windowsPath = "app\\api\\csp-report\\route.ts";
            const fullPath = mockRootDir + "\\" + windowsPath;
            expect(isPublicRoute(fullPath, mockRootDir)).toBe(true);
        });

        it("should identify admin routes with backslashes as NOT public", () => {
            const windowsPath = "app\\api\\admin\\households\\route.ts";
            const fullPath = mockRootDir + "\\" + windowsPath;
            expect(isPublicRoute(fullPath, mockRootDir)).toBe(false);
        });
    });

    describe("Mixed path separators", () => {
        it("should handle mixed separators correctly", () => {
            // Sometimes paths can have mixed separators
            const mixedPath = mockRootDir + "/app\\api/auth\\route.ts";
            expect(isPublicRoute(mixedPath, mockRootDir)).toBe(true);
        });
    });

    describe("Edge cases", () => {
        it("should not match partial path segments", () => {
            // Should not match "app/api/authentication" as "app/api/auth/"
            // The trailing slash in PUBLIC_API_PATHS ensures exact segment matching
            const authenticationPath = join(mockRootDir, "app/api/authentication/route.ts");
            expect(isPublicRoute(authenticationPath, mockRootDir)).toBe(false);
        });

        it("should match exact file path without trailing slash", () => {
            // "app/api/health" should match exactly or with subdirectories
            const healthPath = join(mockRootDir, "app/api/health/route.ts");
            expect(isPublicRoute(healthPath, mockRootDir)).toBe(true);

            const healthCheckPath = join(mockRootDir, "app/api/health-check/route.ts");
            expect(isPublicRoute(healthCheckPath, mockRootDir)).toBe(false);
        });

        it("should handle nested admin routes", () => {
            const nestedAdmin = join(mockRootDir, "app/api/admin/pickup-locations/123/route.ts");
            expect(isPublicRoute(nestedAdmin, mockRootDir)).toBe(false);
        });

        it("should handle root API routes", () => {
            const rootApi = join(mockRootDir, "app/api/route.ts");
            expect(isPublicRoute(rootApi, mockRootDir)).toBe(false);
        });
    });
});

/**
 * Integration test: Verify the actual script works correctly
 */
describe("validate-api-routes.mjs integration", () => {
    it("should be executable and have correct shebang", async () => {
        const { readFileSync } = await import("fs");
        const scriptPath = join(process.cwd(), "scripts/validate-api-routes.mjs");
        const content = readFileSync(scriptPath, "utf-8");

        expect(content).toContain("#!/usr/bin/env node");
        // Check for path normalization (note: the actual code has escaped backslashes)
        expect(content).toMatch(/replace\(\/\\\\\/g,\s*['"]\/['"]\)/);
    });

    it("should normalize paths in checkFile function for admin route detection", async () => {
        const { readFileSync } = await import("fs");
        const scriptPath = join(process.cwd(), "scripts/validate-api-routes.mjs");
        const content = readFileSync(scriptPath, "utf-8");

        // Verify that the checkFile function normalizes paths before checking for admin routes
        expect(content).toMatch(
            /const normalizedPath = relativePath\.replace\(\/\\\\\/g,\s*['"]\/['"]\)/,
        );
        expect(content).toContain('normalizedPath.includes("app/api/admin/")');

        // Verify all violation reports use normalizedPath instead of relativePath
        expect(content).toContain("file: normalizedPath");
    });
});
