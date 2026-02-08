#!/usr/bin/env node
/**
 * E2E Test Authentication Setup
 *
 * Simple, fast, and reliable method to set up authentication for Playwright E2E tests.
 * Just copy/paste your session cookie - takes 10 seconds!
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep in sync with app/utils/auth/session-cookie.ts
const SESSION_COOKIE_NAME = "next-auth.session-token.v4";
const authFile = path.join(__dirname, "..", ".auth", "user.json");

console.log("\n=== E2E Authentication Setup ===\n");
console.log("Quick and easy - just copy your session cookie:\n");
console.log("1. Open your browser and go to: http://localhost:3000/sv");
console.log("2. Log in with GitHub (if not already logged in)");
console.log("3. Open DevTools (F12 or Cmd+Option+I)");
console.log("4. Go to Application/Storage → Cookies → http://localhost:3000");
console.log(`5. Find the cookie named: ${SESSION_COOKIE_NAME}`);
console.log("6. Copy its Value (usually starts with 'ey...')\n");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("Paste the cookie value here: ", sessionToken => {
    if (!sessionToken || sessionToken.trim().length < 10) {
        console.log("\n❌ Invalid session token\n");
        rl.close();
        process.exit(1);
    }

    const authState = {
        cookies: [
            {
                name: SESSION_COOKIE_NAME,
                value: sessionToken.trim(),
                domain: "localhost",
                path: "/",
                expires: -1,
                httpOnly: true,
                secure: false,
                sameSite: "Lax",
            },
        ],
        origins: [],
    };

    const authDir = path.dirname(authFile);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    fs.writeFileSync(authFile, JSON.stringify(authState, null, 2));

    console.log("\n✅ Auth state saved to:", authFile);
    console.log("✅ You can now run E2E tests: pnpm run test:e2e\n");

    rl.close();
});
