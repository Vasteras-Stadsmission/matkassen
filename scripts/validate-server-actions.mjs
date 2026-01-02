#!/usr/bin/env node

/**
 * Validation script to ensure all server actions use protectedAction wrapper
 * This runs in CI/CD to enforce security at build time
 *
 * EXCEPTION: app/db/actions.ts contains storeCspViolationAction which is intentionally
 * public because CSP reports are sent automatically by browsers without authentication.
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
        } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

function checkFile(filePath) {
    const content = readFileSync(filePath, "utf-8");
    const relativePath = relative(rootDir, filePath);

    // Special case: app/db/actions.ts contains intentionally public CSP violation handler
    if (relativePath === "app/db/actions.ts") {
        // Verify it only contains storeCspViolationAction (no other unprotected actions)
        const hasOtherActions =
            content.includes("export async function") &&
            !content.match(/export async function storeCspViolationAction/);

        if (hasOtherActions) {
            violations.push({
                file: relativePath,
                type: "UNEXPECTED_PUBLIC_ACTION",
                message: `File contains public server actions other than storeCspViolationAction. Only CSP handler should be public.`,
            });
            hasErrors = true;
        }
        console.log(
            `${colors.dim}Skipping (CSP handler):${colors.reset} ${relativePath} - storeCspViolationAction is intentionally public`,
        );
        return;
    }

    // Only check files with "use server" directive
    if (!content.includes('"use server"') && !content.includes("'use server'")) {
        return;
    }

    console.log(`${colors.blue}Checking:${colors.reset} ${relativePath}`);

    // Check for direct verifyServerActionAuth calls (should use wrapper instead)
    if (content.includes("verifyServerActionAuth(")) {
        const lines = content.split("\n");
        const lineNumbers = [];

        lines.forEach((line, index) => {
            if (line.includes("verifyServerActionAuth(")) {
                lineNumbers.push(index + 1);
            }
        });

        violations.push({
            file: relativePath,
            type: "DIRECT_AUTH_CALL",
            message: `Direct use of verifyServerActionAuth() detected. Use protectedAction() wrapper instead.`,
            lines: lineNumbers,
        });
        hasErrors = true;
    }

    // Check for exported functions that might be server actions
    const exportedFunctionPattern = /export\s+(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    const protectedActionPattern = /protectedAction\s*\(/g;
    const protectedHouseholdActionPattern = /protectedHouseholdAction\s*\(/g;
    const protectedReadActionPattern = /protectedReadAction\s*\(/g;

    const hasProtectedWrapper =
        protectedActionPattern.test(content) ||
        protectedHouseholdActionPattern.test(content) ||
        protectedReadActionPattern.test(content);

    let match;
    const exportedFunctions = [];
    while ((match = exportedFunctionPattern.exec(content)) !== null) {
        exportedFunctions.push(match[1]);
    }

    // Check for exported const/let arrow functions
    const exportedConstPattern =
        /export\s+const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/g;
    while ((match = exportedConstPattern.exec(content)) !== null) {
        exportedFunctions.push(match[1]);
    }

    // If file has exported functions but no protected wrapper, flag it
    if (exportedFunctions.length > 0 && !hasProtectedWrapper && content.includes('"use server"')) {
        // Check if this is likely a server action file (has database operations, etc.)
        const hasDbOperations = content.includes("db.") || content.includes("from(");

        if (hasDbOperations) {
            violations.push({
                file: relativePath,
                type: "MISSING_PROTECTION",
                message: `Server action file has ${exportedFunctions.length} exported function(s) but doesn't use protectedAction() wrapper.`,
                functions: exportedFunctions,
            });
            hasErrors = true;
        }
    }
}

// Main execution
console.log(`\n${colors.blue}🔒 Validating Server Action Security...${colors.reset}\n`);

const appDir = join(rootDir, "app");
const files = getAllFiles(appDir);

files.forEach(checkFile);

// Report results
console.log(`\n${colors.blue}═══════════════════════════════════════${colors.reset}\n`);

if (violations.length === 0) {
    console.log(`${colors.green}✅ All server actions are properly protected!${colors.reset}\n`);
    process.exit(0);
} else {
    console.log(
        `${colors.red}❌ Found ${violations.length} security violation(s):${colors.reset}\n`,
    );

    violations.forEach((violation, index) => {
        console.log(`${colors.yellow}${index + 1}. ${violation.file}${colors.reset}`);
        console.log(`   ${violation.message}`);

        if (violation.lines) {
            console.log(`   Lines: ${violation.lines.join(", ")}`);
        }

        if (violation.functions) {
            console.log(`   Functions: ${violation.functions.join(", ")}`);
        }

        console.log("");
    });

    console.log(`${colors.red}Fix these issues before deploying.${colors.reset}\n`);
    process.exit(1);
}
