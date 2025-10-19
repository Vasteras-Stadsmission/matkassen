#!/usr/bin/env node

/**
 * Validation script to ensure all admin API routes use authenticateAdminRequest()
 * This runs in CI/CD to enforce security at build time
 *
 * CRITICAL: All routes under /api/admin/* MUST use authenticateAdminRequest()
 * which validates both session AND organization membership.
 *
 * EXCEPTIONS:
 * - /api/auth/* - NextAuth routes (public by design)
 * - /api/health - Health check endpoint (public)
 * - /api/csp-report - CSP violation reporting (public, browser-initiated)
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Colors for terminal output
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    dim: "\x1b[2m",
};

let hasErrors = false;
const violations = [];

// Public API routes that don't require authentication
const PUBLIC_API_PATHS = [
    "app/api/auth", // NextAuth routes
    "app/api/health", // Health check
    "app/api/csp-report", // CSP violation reporting
];

function isPublicRoute(filePath) {
    const relativePath = relative(rootDir, filePath);
    return PUBLIC_API_PATHS.some(publicPath => relativePath.startsWith(publicPath));
}

function getAllFiles(dir, fileList = []) {
    const files = readdirSync(dir);

    files.forEach(file => {
        const filePath = join(dir, file);
        const stat = statSync(filePath);

        if (stat.isDirectory()) {
            // Skip node_modules, .next, etc.
            if (
                !file.startsWith(".") &&
                file !== "node_modules" &&
                file !== "dist" &&
                file !== "build"
            ) {
                getAllFiles(filePath, fileList);
            }
        } else if (file === "route.ts" || file === "route.tsx") {
            // Only check API route handler files
            fileList.push(filePath);
        }
    });

    return fileList;
}

function checkFile(filePath) {
    const content = readFileSync(filePath, "utf-8");
    const relativePath = relative(rootDir, filePath);

    // Skip public routes
    if (isPublicRoute(filePath)) {
        console.log(`${colors.dim}Skipping (public):${colors.reset} ${relativePath}`);
        return;
    }

    // Only check admin API routes
    if (!relativePath.includes("app/api/admin/")) {
        return;
    }

    console.log(`${colors.blue}Checking:${colors.reset} ${relativePath}`);

    // Check for HTTP method handlers (GET, POST, PUT, PATCH, DELETE)
    const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    const hasHttpHandler = httpMethods.some(method => {
        const pattern = new RegExp(`export\\s+async\\s+function\\s+${method}`, "g");
        return pattern.test(content);
    });

    if (!hasHttpHandler) {
        // No HTTP handlers found, might be a utility file
        return;
    }

    // CRITICAL: Check if file uses authenticateAdminRequest
    const hasAuthenticateAdminRequest = content.includes("authenticateAdminRequest");
    const importsAuthenticateAdminRequest = content.includes('from "@/app/utils/auth/api-auth"');

    // Check for dangerous patterns: using auth() directly without authenticateAdminRequest
    const usesAuthDirectly =
        content.includes("await auth()") || content.includes("const session = await auth()");

    if (!hasAuthenticateAdminRequest || !importsAuthenticateAdminRequest) {
        violations.push({
            file: relativePath,
            type: "MISSING_AUTH",
            message: `Admin API route does not use authenticateAdminRequest(). This bypasses organization membership checks.`,
            severity: "HIGH",
        });
        hasErrors = true;
    }

    if (usesAuthDirectly && !hasAuthenticateAdminRequest) {
        violations.push({
            file: relativePath,
            type: "INSECURE_AUTH",
            message: `Uses auth() directly instead of authenticateAdminRequest(). This allows any GitHub user access without organization membership check.`,
            severity: "CRITICAL",
        });
        hasErrors = true;
    }

    // Check for missing auth altogether
    if (!usesAuthDirectly && !hasAuthenticateAdminRequest && hasHttpHandler) {
        // Check if any handler has authentication logic
        const hasAnyAuth =
            content.includes("session") ||
            content.includes("auth") ||
            content.includes("Unauthorized");

        if (!hasAnyAuth) {
            violations.push({
                file: relativePath,
                type: "NO_AUTH",
                message: `Admin API route appears to have no authentication at all.`,
                severity: "CRITICAL",
            });
            hasErrors = true;
        }
    }
}

// Main execution
console.log(`\n${colors.blue}🔒 Validating API Route Security...${colors.reset}\n`);

const apiDir = join(rootDir, "app", "api");
const files = getAllFiles(apiDir);

files.forEach(checkFile);

// Report results
console.log(`\n${colors.blue}═══════════════════════════════════════${colors.reset}\n`);

if (violations.length === 0) {
    console.log(`${colors.green}✅ All admin API routes are properly protected!${colors.reset}\n`);
    process.exit(0);
} else {
    console.log(
        `${colors.red}❌ Found ${violations.length} security violation(s):${colors.reset}\n`,
    );

    // Group by severity
    const critical = violations.filter(v => v.severity === "CRITICAL");
    const high = violations.filter(v => v.severity === "HIGH");

    if (critical.length > 0) {
        console.log(`${colors.red}🚨 CRITICAL ISSUES (${critical.length}):${colors.reset}\n`);
        critical.forEach((violation, index) => {
            console.log(`${colors.red}${index + 1}. ${violation.file}${colors.reset}`);
            console.log(`   ${violation.message}`);
            console.log("");
        });
    }

    if (high.length > 0) {
        console.log(`${colors.yellow}⚠️  HIGH PRIORITY (${high.length}):${colors.reset}\n`);
        high.forEach((violation, index) => {
            console.log(`${colors.yellow}${index + 1}. ${violation.file}${colors.reset}`);
            console.log(`   ${violation.message}`);
            console.log("");
        });
    }

    console.log(`${colors.red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(
        `${colors.red}SECURITY CRITICAL: Fix these issues before deploying!${colors.reset}`,
    );
    console.log(
        `${colors.dim}All admin API routes must use authenticateAdminRequest()${colors.reset}`,
    );
    console.log(`${colors.dim}to enforce organization membership checks.${colors.reset}\n`);

    process.exit(1);
}
